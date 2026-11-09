/**
 * A v2 level table — true maze shell + dual mode (explore | chase).
 * S0=7; pairs share S (explore then chase); S grows +1 each pair.
 */
import type { Graph, NodeId } from "./graph";
import type { E1Def, RescueDef } from "./logic";
import { validateOrthogonalEdges } from "./maze-grid";
import { solveLevel } from "./solvability";
import {
  S0,
  buildChaseEnemies,
  generatePlayableMaze,
  type PlayMode,
} from "./maze-gen";

export type { PlayMode };

export interface GoLevel {
  id: number;
  name: string;
  hint: string;
  graph: Graph;
  start: NodeId;
  enemies?: readonly E1Def[];
  rescue?: RescueDef;
  /** Floor-lattice side length (product S). */
  S: number;
  /** Exploration fog Chebyshev radius. */
  visionR: number;
  /** explore = no kidnappers; chase = enemies near cage. */
  mode: PlayMode;
  /** Seed used for maze (shared by explore/chase pair). */
  mazeSeed: number;
}

const ANIMALS = ["rabbit", "pup", "fox", "rabbit", "pup", "fox", "rabbit", "pup"] as const;

interface Band {
  S: number;
  visionR: number;
  chaseKind: "static" | "polyline" | "ring";
  exploreName: string;
  chaseName: string;
  exploreHint: string;
  chaseHint: string;
}

/** 4 S values × explore+chase = 8 levels. */
const BANDS: Band[] = [
  {
    S: S0,
    visionR: 3,
    chaseKind: "static",
    exploreName: "迷雾初角",
    chaseName: "笼边静哨",
    exploreHint: "角进场 · 视野方圈 · 摸到牢笼带走再回营地 · 比少步",
    chaseHint: "同图追击 · 绑架者贴笼 · 红是弓视线 · 别踩进去",
  },
  {
    S: S0 + 1,
    visionR: 2,
    chaseKind: "static",
    exploreName: "密径加一",
    chaseName: "笼旁长弓",
    exploreHint: "边长+1 · R=2 · 靠记忆摸笼 · 步数越少越好",
    chaseHint: "静站弓 N=3 墙挡 · 绑在笼区 · 救回营地",
  },
  {
    S: S0 + 2,
    visionR: 2,
    chaseKind: "polyline",
    exploreName: "九格密林",
    chaseName: "折返贴笼",
    exploreHint: "更大迷宫 · 无绑纯摸索 · 送到营地",
    chaseHint: "折返巡逻贴笼 · 看浅蓝落点再靠近",
  },
  {
    S: S0 + 3,
    visionR: 2,
    chaseKind: "ring",
    exploreName: "十径远笼",
    chaseName: "环线看守",
    exploreHint: "远笼角进 · 已探索浅影可辨墙 · 未探索全黑",
    chaseHint: "环线巡逻 · 危险色是视线 · 先救牢笼再撤回",
  },
];

function animalFor(i: number): string {
  return ANIMALS[i % ANIMALS.length]!;
}

function buildPair(band: Band, pairIndex: number): [GoLevel, GoLevel] {
  const corner = pairIndex % 4;
  const base = 9000 + band.S * 17 + pairIndex * 13;
  const visionN =
    band.chaseKind === "ring" ? 2 : band.chaseKind === "static" && pairIndex === 0 ? 2 : 3;
  const exploreId = pairIndex * 2 + 1;
  const chaseId = pairIndex * 2 + 2;

  let lastErr = "unsolvable chase";
  for (let attempt = 0; attempt < 80; attempt++) {
    const maze = generatePlayableMaze(band.S, base + attempt * 7919, corner);
    const errs = validateOrthogonalEdges(maze.graph);
    if (errs.length) {
      lastErr = errs.join("; ");
      continue;
    }

    const enemies = buildChaseEnemies(
      maze.graph,
      maze.cage,
      maze.start,
      band.chaseKind,
      visionN,
    );
    if (enemies.length === 0) {
      lastErr = "no enemy placed";
      continue;
    }

    const explore: GoLevel = {
      id: exploreId,
      name: band.exploreName,
      hint: band.exploreHint,
      graph: maze.graph,
      start: maze.start,
      enemies: [],
      rescue: { animals: { [maze.cage]: animalFor(pairIndex * 2) }, safe: maze.safe },
      S: band.S,
      visionR: band.visionR,
      mode: "explore",
      mazeSeed: maze.seed,
    };

    const chase: GoLevel = {
      id: chaseId,
      name: band.chaseName,
      hint: band.chaseHint,
      graph: maze.graph,
      start: maze.start,
      enemies,
      rescue: {
        animals: { [maze.cage]: animalFor(pairIndex * 2 + 1) },
        safe: maze.safe,
      },
      S: band.S,
      visionR: band.visionR,
      mode: "chase",
      mazeSeed: maze.seed,
    };

    // §10 BFS gate: explore+chase birth→cage→camp under full bow
    const ex = solveLevel(explore, 80_000);
    const ch = solveLevel(chase, 120_000);
    if (!ex.solvable || !ex.rescued) {
      lastErr = `explore unsolvable/no-rescue states=${ex.states} rescued=${ex.rescued}`;
      continue;
    }
    if (!ch.solvable || !ch.rescued) {
      lastErr = `chase unsolvable/no-rescue states=${ch.states} rescued=${ch.rescued}`;
      continue;
    }
    return [explore, chase];
  }
  throw new Error(`buildPair S=${band.S} ${band.chaseKind}: ${lastErr}`);
}

export const GO_LEVELS: readonly GoLevel[] = BANDS.flatMap((b, i) => buildPair(b, i));

/** Same-S explore level that gates a chase level, or null. */
export function exploreGateFor(level: GoLevel): GoLevel | null {
  if (level.mode !== "chase") return null;
  return GO_LEVELS.find((l) => l.mode === "explore" && l.S === level.S) ?? null;
}

const UNLOCK_KEY = "sa-go-explore-cleared-v2";

export function loadClearedExplore(): Set<number> {
  try {
    const raw = localStorage.getItem(UNLOCK_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr.filter((n) => typeof n === "number"));
  } catch {
    return new Set();
  }
}

export function markExploreCleared(levelId: number): void {
  const set = loadClearedExplore();
  set.add(levelId);
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/** Chase unlocked when same-S explore id is cleared (or level is explore). */
export function isLevelUnlocked(level: GoLevel, cleared: ReadonlySet<number>): boolean {
  if (level.mode === "explore") return true;
  const gate = exploreGateFor(level);
  if (!gate) return true;
  return cleared.has(gate.id);
}

export { S0 };
