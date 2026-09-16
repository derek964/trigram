export const LEVEL_COUNT = 30;
export const HEARTS = 3;
export const PLAYER_RADIUS = 0.2;
export const PATH_WIDTH = 2.4;
export const PATH_LENGTH = 5.6;
export const SPEED = 4.2;
export const MIN_CORRIDOR = 0.82;
export const HOLE_WIDTH = 1.18;
export const CHASER_VISION = 6.8;
export const CATCH_RANGE = 0.42;

export type PatternId = "A" | "B" | "C" | "D" | "E" | "F";

export interface AnimalKind {
  id: string;
  name: string;
  title: string;
  ears: "long" | "round" | "point";
  color: string;
  blush: boolean;
}

export const ANIMALS: AnimalKind[] = [
  { id: "rabbit", name: "小兔", title: "夜班小兔", ears: "long", color: "#f4f0ea", blush: true },
  { id: "cat", name: "小猫", title: "夜班小猫", ears: "point", color: "#f0d5a8", blush: true },
  { id: "pup", name: "小狗", title: "夜班小狗", ears: "round", color: "#d8b48a", blush: true },
  { id: "fox", name: "小狐", title: "夜班小狐", ears: "point", color: "#e89b5c", blush: true },
  { id: "bear", name: "小熊", title: "夜班小熊", ears: "round", color: "#c48a5a", blush: true },
  { id: "chick", name: "小鸡", title: "夜班小鸡", ears: "round", color: "#f4d66a", blush: true },
  { id: "deer", name: "小鹿", title: "夜班小鹿", ears: "long", color: "#e6c398", blush: true },
  { id: "panda", name: "熊猫", title: "夜班熊猫", ears: "round", color: "#f2f2f0", blush: true },
  { id: "ham", name: "仓鼠", title: "夜班仓鼠", ears: "round", color: "#e8c4a0", blush: true },
  { id: "duck", name: "小鸭", title: "夜班小鸭", ears: "round", color: "#f3e27a", blush: true },
  { id: "lamb", name: "小羊", title: "夜班小羊", ears: "round", color: "#f6f3ee", blush: true },
  { id: "pig", name: "小猪", title: "隔离间小猪", ears: "round", color: "#f4b6c2", blush: true },
  { id: "koala", name: "考拉", title: "值班考拉", ears: "round", color: "#cfc6b8", blush: true },
  { id: "otter", name: "水獭", title: "夜班水獭", ears: "round", color: "#c9a07a", blush: true },
  { id: "rac", name: "浣熊", title: "夜巡浣熊", ears: "round", color: "#cfc3b5", blush: true },
  { id: "owl", name: "猫头鹰", title: "监控猫头鹰", ears: "point", color: "#cbb58a", blush: false },
  { id: "squirrel", name: "松鼠", title: "钥匙串松鼠", ears: "point", color: "#d9a066", blush: true },
  { id: "hedge", name: "刺猬", title: "夜班刺猬", ears: "round", color: "#c9b08a", blush: true },
  { id: "seal", name: "小海豹", title: "夜班小海豹", ears: "round", color: "#cfd6dc", blush: true },
  { id: "frog", name: "小蛙", title: "夜班小蛙", ears: "round", color: "#8fcd7a", blush: true },
  { id: "penguin", name: "企鹅", title: "防盗企鹅", ears: "round", color: "#3d4a55", blush: true },
  { id: "capy", name: "卡皮", title: "夜班卡皮", ears: "round", color: "#d2b090", blush: true },
  { id: "redpan", name: "小熊猫", title: "巡楼小熊猫", ears: "round", color: "#d97a4a", blush: true },
  { id: "goat", name: "小羊驼", title: "值班羊驼", ears: "point", color: "#efe8dc", blush: true },
  { id: "mouse", name: "小鼠", title: "夜班小鼠", ears: "round", color: "#d9d3cc", blush: true },
  { id: "bird", name: "小鸟", title: "夜班小鸟", ears: "point", color: "#7ec8e3", blush: true },
  { id: "turtle", name: "小龟", title: "夜班小龟", ears: "round", color: "#7fa86a", blush: false },
  { id: "bunny2", name: "垂耳兔", title: "夜班垂耳兔", ears: "long", color: "#f3c6d4", blush: true },
  { id: "shiba", name: "柴犬", title: "夜班柴犬", ears: "point", color: "#e2a15a", blush: true },
  { id: "kit", name: "白猫", title: "夜班白猫", ears: "point", color: "#f7f4ef", blush: true },
];

export interface LevelConfig {
  id: number;
  title: string;
  animal: AnimalKind;
  chapter: 1 | 2 | 3;
  pattern: PatternId;
  rings: number;
  maxAng: number;
  ringWidth: number;
  gridN: number;
  cellSize: number;
  braid: number;
  innerGates: number;
  preferEwMouth: boolean;
  needsKey: boolean;
  hasChaser: boolean;
  peeks: number;
  hearts: number;
  seed: number;
  cage: number;
  wallWidth: number;
  parSteps: number;
  parTime: number;
  /** Hard fail timeout in seconds. `0` = tutorial band, time only affects stars. */
  timeLimit: number;
}

export function chapterOf(id: number): 1 | 2 | 3 {
  if (id <= 10) return 1;
  if (id <= 20) return 2;
  return 3;
}

export const CHAPTER_NAMES = ["夜巡", "钥匙串", "防盗夜"] as const;

export function patternOf(id: number): PatternId {
  if (id <= 1) return "A";
  if (id <= 3) return "B";
  if (id <= 10) return "D";
  if (id <= 20) return "E";
  return "F";
}

function gridOf(id: number): number {
  if (id <= 1) return 9;
  if (id <= 3) return 11;
  if (id <= 5) return 13;
  return 15;
}

function braidOf(id: number): number {
  if (id <= 1) return 0.02;
  if (id <= 3) return 0.05;
  if (id <= 5) return 0.07;
  if (id <= 10) return 0.1;
  if (id <= 20) return 0.1;
  return 0.11;
}

export function recipe(id: number): LevelConfig {
  const chapter = chapterOf(id);
  const pattern = patternOf(id);
  const gridN = gridOf(id);
  const cellSize = 1.22;
  const wallWidth = 0.38;
  const braid = braidOf(id);
  const animal = ANIMALS[id - 1]!;
  const parTime = id <= 3 ? 28 + id * 4 : 22 + id * 2.4;
  return {
    id,
    title: animal.title,
    animal,
    chapter,
    pattern,
    rings: gridN,
    maxAng: gridN,
    ringWidth: cellSize,
    gridN,
    cellSize,
    braid,
    innerGates: 1,
    preferEwMouth: pattern === "D" || pattern === "E",
    needsKey: chapter >= 2,
    hasChaser: chapter === 3,
    peeks: id <= 5 ? 3 : id <= 15 ? 2 : 1,
    hearts: HEARTS,
    seed: 2200 + id * 173,
    cage: 1.85,
    wallWidth,
    parSteps: id <= 3 ? 16 + id * 4 : 50 + id * 8,
    parTime,
    timeLimit: id <= 5 ? 0 : Math.max(90, Math.round(parTime * 2.5)),
  };
}

export const LEVELS: LevelConfig[] = Array.from({ length: LEVEL_COUNT }, (_, i) => recipe(i + 1));

export function minCellHops(cfg: LevelConfig): number {
  const id = cfg.id;
  if (id <= 1) return 6;
  if (id <= 2) return 9;
  if (id <= 3) return 11;
  if (id <= 5) return 16;
  if (id <= 7) return Math.max(28, Math.round(cfg.gridN * 1.85));
  if (id <= 10) return Math.max(42, Math.round(cfg.gridN * 2.75));
  if (id <= 20) return Math.max(34, Math.round(cfg.gridN * 2.25));
  return Math.max(30, Math.round(cfg.gridN * 2.0));
}

export function minGeoSteps(cfg: LevelConfig): number {
  const id = cfg.id;
  if (id <= 1) return Math.ceil(cfg.gridN * 1.15);
  if (id <= 3) return Math.ceil(cfg.gridN * 1.45);
  if (id <= 5) return Math.ceil(cfg.gridN * 1.7);
  if (id <= 7) return Math.ceil(cfg.gridN * 2.4);
  if (id <= 10) return Math.ceil(cfg.gridN * 7.2);
  if (id <= 20) return Math.ceil(cfg.gridN * 5.8);
  return Math.ceil(cfg.gridN * 5.2);
}

export function playVisionRadius(id: number): number {
  if (id <= 1) return 99;
  return id <= 2 ? 2.2 : 2.0;
}

export type VisionFog = "none" | "soft-silhouette" | "hard-black";

/** L1 full-bright; L2 circular disc with wall silhouette under soft fog; L3+ hard black outside the disc. */
export function visionFog(id: number): VisionFog {
  if (id <= 1) return "none";
  if (id === 2) return "soft-silhouette";
  return "hard-black";
}

/** Circular vision starts at L2. L1 is full-bright so the first idea is one-step tap + rescue. */
export function usesVisionDisc(id: number): boolean {
  return visionFog(id) !== "none";
}

/** L2 only: pale wall traces stay readable outside the disc. L3+ must not silhouette. */
export function usesWallSilhouette(id: number): boolean {
  return visionFog(id) === "soft-silhouette";
}

/** L3+: opaque circular FOV. Outside the lit disc is fully black / unseen. */
export function usesHardVisionMask(id: number): boolean {
  return visionFog(id) === "hard-black";
}

/**
 * What 「箭头」 means in this build, and who gets them:
 * - L1 finger cue (DOM hand + one-step preview) — teaching tap
 * - L2 junction chevron (mint triangle on the next hop) + one-step tap preview
 * - Path-preview dashed ribbon (adjacent step only; never a multi-hop A* ghost)
 * L3+ has none of these. Keyboard Arrow keys are unrelated input mapping.
 */
export function showsFingerCue(id: number): boolean {
  return id === 1;
}

export function showsJunctionChevron(id: number): boolean {
  return id === 2;
}

export function showsPathPreview(id: number): boolean {
  return id <= 2;
}

export function showsTeachingArrows(id: number): boolean {
  return showsFingerCue(id) || showsJunctionChevron(id) || showsPathPreview(id);
}
