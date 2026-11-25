/**
 * BFS solvability over Hitman GO state:
 * player node × each enemy (index, dir, facing) × carried set × animals-left keys.
 * Asserts birth → cage pickup → camp win (acceptance §20).
 */
import { neighborsOf, type NodeId } from "./graph";
import { createState, moveTo, type GoState } from "./logic";
import type { GoLevel } from "./levels";

export function cloneGoState(s: GoState): GoState {
  return {
    graph: s.graph,
    player: s.player,
    steps: s.steps,
    enemies: s.enemies.map((e) => ({
      id: e.id,
      path: [...e.path],
      kind: e.kind,
      index: e.index,
      dir: e.dir,
      facing: e.facing,
      visionN: e.visionN,
    })),
    animalsLeft: { ...s.animalsLeft },
    carried: [...s.carried],
    safe: s.safe,
    required: [...s.required],
    status: s.status,
    reason: s.reason,
    visionR: s.visionR,
    explored: new Set(s.explored),
    fogBowSafe: s.fogBowSafe,
  };
}

export function encodeGoState(s: GoState): string {
  const e = s.enemies.map((x) => `${x.index}:${x.dir}:${x.facing}`).join(",");
  const carried = [...s.carried].sort().join(",");
  const left = Object.keys(s.animalsLeft).sort().join(",");
  return `${s.player}|${e}|${carried}|${left}|${s.status}`;
}

export interface SolveResult {
  solvable: boolean;
  depth: number;
  states: number;
  /** Hop sequence (destination nodes) from start to win; empty if unsolvable. */
  path: NodeId[];
  /** True when a winning path picked up required animals before camp. */
  rescued: boolean;
}

interface BfsNode {
  state: GoState;
  depth: number;
  /** Destination of this hop (null at root). */
  hop: NodeId | null;
  parent: number;
  rescued: boolean;
}

/** Breadth-first search for a win. Levels without rescue are not considered solvable. */
export function solveLevel(level: GoLevel, maxStates = 50_000): SolveResult {
  if (!level.rescue) return { solvable: false, depth: -1, states: 0, path: [], rescued: false };
  const root = createState(level.graph, level.start, {
    enemies: level.enemies,
    rescue: level.rescue,
    visionR: level.visionR,
    // Solver ignores fog mercy so chase BFS gate reflects full bow danger.
    fogBowSafe: false,
  });
  if (root.status === "win") {
    return { solvable: true, depth: 0, states: 1, path: [], rescued: root.carried.length > 0 };
  }
  if (root.status === "caught") {
    return { solvable: false, depth: -1, states: 1, path: [], rescued: false };
  }

  const seen = new Set<string>([encodeGoState(root)]);
  const nodes: BfsNode[] = [{ state: root, depth: 0, hop: null, parent: -1, rescued: false }];
  let qi = 0;
  let states = 1;

  while (qi < nodes.length) {
    const cur = nodes[qi]!;
    const moves = neighborsOf(cur.state.graph, cur.state.player);
    for (const to of moves) {
      const next = cloneGoState(cur.state);
      const r = moveTo(next, to);
      if (!r.ok) continue;
      states += 1;
      if (states > maxStates) {
        return { solvable: false, depth: -1, states, path: [], rescued: false };
      }
      const rescued = cur.rescued || (r.ok && r.picked.length > 0) || next.carried.length > 0;
      if (next.status === "win" || (r.ok && r.won)) {
        // Reconstruct hop path
        const path: NodeId[] = [to];
        let p = qi;
        while (p >= 0) {
          const n = nodes[p]!;
          if (n.hop != null) path.push(n.hop);
          p = n.parent;
        }
        path.reverse();
        return { solvable: true, depth: cur.depth + 1, states, path, rescued };
      }
      if (next.status === "caught" || (r.ok && r.caught)) continue;
      const key = encodeGoState(next);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({
        state: next,
        depth: cur.depth + 1,
        hop: to,
        parent: qi,
        rescued,
      });
    }
    qi += 1;
  }
  return { solvable: false, depth: -1, states, path: [], rescued: false };
}

export function assertLevelSolvable(level: GoLevel, maxStates = 120_000): SolveResult {
  const r = solveLevel(level, maxStates);
  if (!r.solvable) {
    throw new Error(
      `unsolvable: L${level.id} ${level.name} mode=${level.mode} seed=${level.mazeSeed} (states=${r.states})`,
    );
  }
  if (!r.rescued) {
    throw new Error(
      `no cage→camp rescue on win path: L${level.id} ${level.name} depth=${r.depth}`,
    );
  }
  if (r.depth < 1) {
    throw new Error(`trivial/empty win: L${level.id} ${level.name}`);
  }
  return r;
}

