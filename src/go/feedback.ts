/**
 * Hitman GO three-color feedback (Art dark variants on #C9BBA8 — product unlocked).
 * Adjacent legal: #35504A · E next-beat preview/warn: #314F5D · Danger (vision + must-die): #7F3629
 * Prior locked light hexes (#7BA89E/#5B8FA8/#C45C4A) kept as COLOR_*_LIGHT for rollback.
 */
import type { NodeId } from "./graph";
import { enemyNode, enemyVision, type E1State, type GoState } from "./logic";
import { facingBetween } from "./vision";

/** Product-unlocked Art dark variants (≥~4.5:1 on #C9BBA8). Active paint. */
export const COLOR_ADJACENT = "#35504A";
export const COLOR_PREVIEW = "#314F5D";
export const COLOR_DANGER = "#7F3629";

/** Prior style-guide light hexes — inactive; switch back if Art reverts. */
export const COLOR_ADJACENT_LIGHT = "#7BA89E";
export const COLOR_PREVIEW_LIGHT = "#5B8FA8";
export const COLOR_DANGER_LIGHT = "#C45C4A";

/** Next patrol node after one beat — pure, does not mutate. */
export function peekNextE1(e: E1State): NodeId {
  if (e.kind === "static" || e.path.length <= 1) return e.path[e.index]!;
  if (e.kind === "ring") {
    const n = e.path.length;
    const idx = ((e.index + e.dir) % n + n) % n;
    return e.path[idx]!;
  }
  let dir = e.dir;
  let index = e.index;
  const next = index + dir;
  if (next < 0 || next >= e.path.length) {
    dir = (dir === 1 ? -1 : 1) as 1 | -1;
    index = index + dir;
  } else {
    index = next;
  }
  return e.path[index]!;
}

/** Pure copy of enemy state after one patrol beat (index/dir/facing). */
export function peekEnemyAfterBeat(state: GoState, e: E1State): E1State {
  if (e.kind === "static" || e.path.length <= 1) {
    return { ...e, path: [...e.path] };
  }
  const from = enemyNode(e);
  const next: E1State = { ...e, path: [...e.path] };
  if (e.kind === "ring") {
    const n = e.path.length;
    next.index = ((e.index + e.dir) % n + n) % n;
  } else {
    const nxt = e.index + e.dir;
    if (nxt < 0 || nxt >= e.path.length) {
      next.dir = (e.dir === 1 ? -1 : 1) as 1 | -1;
      next.index = e.index + next.dir;
    } else {
      next.index = nxt;
    }
  }
  const to = next.path[next.index]!;
  const face = facingBetween(state.graph, from, to);
  if (face) next.facing = face;
  return next;
}

/** E next-beat nodes (preview markers). Sorted unique. */
export function previewNodes(state: GoState): NodeId[] {
  const set = new Set<NodeId>();
  for (const e of state.enemies) set.add(peekNextE1(e));
  return [...set].sort();
}

/** All cells currently covered by bow vision (danger paint). */
export function visionDangerNodes(state: GoState): NodeId[] {
  const set = new Set<NodeId>();
  for (const e of state.enemies) {
    for (const id of enemyVision(state.graph, e)) set.add(id);
  }
  return [...set].sort();
}

/**
 * Stepping onto `to` this turn → after resolution, contact or vision catch.
 * Mirrors moveTo catch rules without mutating.
 */
export function isCatchOnStep(state: GoState, to: NodeId): boolean {
  if (state.status !== "play") return false;
  if (to === state.player) return false;

  // Pre-tick vision (current facing)
  for (const e of state.enemies) {
    if (enemyVision(state.graph, e).includes(to)) return true;
  }

  // After one enemy beat: contact or updated vision
  for (const e of state.enemies) {
    const after = peekEnemyAfterBeat(state, e);
    if (enemyNode(after) === to) return true;
    if (enemyVision(state.graph, after).includes(to)) return true;
  }
  return false;
}

/**
 * Danger paint set: current bow vision ∪ proven catch-on-step destinations
 * among enemy body / next-beat tiles (keeps paint bounded + solvable UI).
 */
export function dangerNodes(state: GoState): NodeId[] {
  const set = new Set<NodeId>(visionDangerNodes(state));
  const candidates = new Set<NodeId>();
  for (const e of state.enemies) {
    candidates.add(enemyNode(e));
    candidates.add(peekNextE1(e));
  }
  for (const id of candidates) {
    if (isCatchOnStep(state, id)) set.add(id);
  }
  return [...set].sort();
}

/**
 * Feedback paint priority while playing.
 * Bow vision → danger (#7F3629) even when not adjacent (readable LOS).
 * Next-beat warn (#314F5D) for sentry landing tiles not already danger.
 * Adjacent legal → #35504A.
 */
export type FeedbackKind = "danger" | "preview" | "adjacent" | "none";

export function feedbackKind(
  state: GoState,
  id: NodeId,
  neigh: ReadonlySet<NodeId>,
  preview: ReadonlySet<NodeId>,
  danger: ReadonlySet<NodeId>,
): FeedbackKind {
  if (state.status !== "play") return "none";
  if (danger.has(id)) return "danger";
  if (preview.has(id)) return "preview";
  if (neigh.has(id)) return "adjacent";
  return "none";
}
