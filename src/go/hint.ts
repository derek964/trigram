/**
 * Hint: next optimal adjacent hop on a shortest solvable path.
 * Does NOT auto-move. Not a Theseus two-step preview.
 */
import { neighborsOf, type NodeId } from "./graph";
import { moveTo, type GoState } from "./logic";
import { cloneGoState, encodeGoState } from "./solvability";

/** Free hints per level (MVP). */
export const HINTS_PER_LEVEL = 3;

export interface HintResult {
  /** Next hop from current player node, or null if unsolvable / none. */
  next: NodeId | null;
  /** Shortest win depth in hops (−1 if none). */
  depth: number;
}

/**
 * BFS for a win from `state`; return the first hop of one shortest path.
 */
export function nextHintHop(state: GoState, maxStates = 50_000): HintResult {
  if (state.status === "win") return { next: null, depth: 0 };
  if (state.status === "caught") return { next: null, depth: -1 };
  if (!state.safe || state.required.length === 0) return { next: null, depth: -1 };

  const root = cloneGoState(state);
  const seen = new Set<string>([encodeGoState(root)]);
  const queue: { state: GoState; depth: number; firstHop: NodeId | null }[] = [
    { state: root, depth: 0, firstHop: null },
  ];
  let states = 1;

  while (queue.length) {
    const { state: cur, depth, firstHop } = queue.shift()!;
    const moves = neighborsOf(cur.graph, cur.player);
    for (const to of moves) {
      const next = cloneGoState(cur);
      const r = moveTo(next, to);
      if (!r.ok) continue;
      states += 1;
      if (states > maxStates) return { next: null, depth: -1 };

      const hop = firstHop ?? to;
      if (next.status === "win" || (r.ok && r.won)) {
        return { next: hop, depth: depth + 1 };
      }
      if (next.status === "caught" || (r.ok && r.caught)) continue;
      const key = encodeGoState(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: next, depth: depth + 1, firstHop: hop });
    }
  }
  return { next: null, depth: -1 };
}

/** Ad-revive hook — placeholder only, no real SDK. */
export function adReviveHintPlaceholder(): { ok: true; granted: number; message: string } {
  return {
    ok: true,
    granted: 1,
    message: "广告挂点占位 · 暂无真广告 SDK",
  };
}
