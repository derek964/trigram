/**
 * East plant playback for the eastline layer plates.
 * The root stays on the grid. One plant is 0.440 world units due east.
 * Support and outgoing boots lock to a world point. The shaft, trousers,
 * and upper stay on the root. This is not a gait pass.
 */

export const PLANT_PIVOT_X = 256;
export const PLANT_PIVOT_Y = 600;
/** Entry contact to trailing support, art pixels. Image y grows downward. */
export const PLANT_ART_DELTA_X = -110;
export const PLANT_ART_DELTA_Y = -55;
/** Pure east. The world-y of that art step is 0. Not 1.024. */
export const PLANT_DISTANCE = 0.44;
export const PLANT_CYCLE = PLANT_DISTANCE * 2;
/** Same-frame entry soles: contact y 625, outgoing y 570. */
export const ENTRY_SOLE_Y_GAP = 55;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ArtPoint {
  x: number;
  y: number;
}

export type PlantFoot = 0 | 1;
export type PlantPoseId =
  | "source0-entry"
  | "E0-mid"
  | "source0-trailing"
  | "source1-entry"
  | "E1-mid"
  | "source1-trailing";
/** Windows of one 0.440 plant. Not the 1.024 cycle and not the 0.256 plants. */
export const EAST_ENTRY_END = 0.11;
export const EAST_MID_END = 0.33;

export interface PlantBoot {
  file: string;
  foot: PlantFoot;
  sole: ArtPoint;
  /** Planted boots lock to a world latch. Swing boots stay on the root. */
  latched: boolean;
  role: "support" | "outgoing" | "swing";
}

export interface PlantPose {
  id: PlantPoseId;
  trousers: string;
  /** Back to front: smaller sole y first. */
  boots: PlantBoot[];
}

export interface EastPlant {
  originX: number;
  originY: number;
  foot: PlantFoot;
  /** Distance since origin, in [0, PLANT_DISTANCE). */
  local: number;
}

const POSES: Record<PlantPoseId, PlantPose> = {
  "source0-entry": {
    id: "source0-entry",
    trousers: "east-source0-entry-trousers.png",
    boots: [
      { file: "boot-foot1-trailing.png", foot: 1, sole: { x: 205.5, y: 570 }, latched: true, role: "outgoing" },
      { file: "boot-foot0-entry.png", foot: 0, sole: { x: 314.5, y: 625 }, latched: true, role: "support" },
    ],
  },
  "E0-mid": {
    id: "E0-mid",
    trousers: "trousers-E0-mid.png",
    boots: [
      { file: "boot-foot1-E0-mid-swing.png", foot: 1, sole: { x: 271, y: 557 }, latched: false, role: "swing" },
      { file: "boot-foot0-E0-mid.png", foot: 0, sole: { x: 259.5, y: 597 }, latched: true, role: "support" },
    ],
  },
  "source0-trailing": {
    id: "source0-trailing",
    trousers: "east-source0-trailing-trousers.png",
    boots: [
      { file: "boot-foot1-source0-trailing-swing.png", foot: 1, sole: { x: 335.5, y: 543 }, latched: false, role: "swing" },
      { file: "boot-foot0-trailing.png", foot: 0, sole: { x: 204.5, y: 570 }, latched: true, role: "support" },
    ],
  },
  "source1-entry": {
    id: "source1-entry",
    trousers: "east-source1-entry-trousers.png",
    boots: [
      { file: "boot-foot0-trailing.png", foot: 0, sole: { x: 204.5, y: 570 }, latched: true, role: "outgoing" },
      { file: "boot-foot1-entry.png", foot: 1, sole: { x: 315.5, y: 625 }, latched: true, role: "support" },
    ],
  },
  "E1-mid": {
    id: "E1-mid",
    trousers: "trousers-E1-mid.png",
    boots: [
      { file: "boot-foot0-E1-mid-swing.png", foot: 0, sole: { x: 270, y: 557 }, latched: false, role: "swing" },
      { file: "boot-foot1-E1-mid.png", foot: 1, sole: { x: 260.5, y: 597 }, latched: true, role: "support" },
    ],
  },
  "source1-trailing": {
    id: "source1-trailing",
    trousers: "east-source1-trailing-trousers.png",
    boots: [
      { file: "boot-foot0-source1-trailing-swing.png", foot: 0, sole: { x: 335, y: 543 }, latched: false, role: "swing" },
      { file: "boot-foot1-trailing.png", foot: 1, sole: { x: 205.5, y: 570 }, latched: true, role: "support" },
    ],
  },
};

export function artToWorld(art: ArtPoint): WorldPoint {
  const dx = art.x - PLANT_PIVOT_X;
  const dy = art.y - PLANT_PIVOT_Y;
  return { x: dx / 500 + dy / 250, y: -dx / 500 + dy / 250 };
}

/** Inverse of artToWorld. (dx, dy) is a world offset from the current root. */
export function worldToArt(offset: WorldPoint): ArtPoint {
  return {
    x: PLANT_PIVOT_X + (offset.x - offset.y) * 250,
    y: PLANT_PIVOT_Y + (offset.x + offset.y) * 125,
  };
}

/**
 * Place a boot in the same billboard as the body. The world latch is kept.
 * Screen position is not a perspective projection of the floor point.
 * When the latch is the current root plus artToWorld(sole), the plate stays put.
 */
export function billboardBoot(
  root: WorldPoint,
  latch: WorldPoint | null,
  sole: ArtPoint,
  feetX: number,
  feetY: number,
  px: number,
): {
  drawX: number;
  drawY: number;
  sole: { x: number; y: number };
  latch: { x: number; y: number } | null;
  rootSole: { x: number; y: number };
} {
  const originX = feetX - PLANT_PIVOT_X * px;
  const originY = feetY - PLANT_PIVOT_Y * px;
  const rootSole = { x: originX + sole.x * px, y: originY + sole.y * px };
  if (!latch) return { drawX: originX, drawY: originY, sole: rootSole, latch: null, rootSole };
  const art = worldToArt({ x: latch.x - root.x, y: latch.y - root.y });
  const drawX = originX + (art.x - sole.x) * px;
  const drawY = originY + (art.y - sole.y) * px;
  const latchScreen = { x: drawX + sole.x * px, y: drawY + sole.y * px };
  return { drawX, drawY, sole: latchScreen, latch: latchScreen, rootSole };
}

export function poseFor(foot: PlantFoot, local: number): PlantPose {
  const phase = local < EAST_ENTRY_END ? "entry" : local < EAST_MID_END ? "mid" : "trail";
  if (foot === 0) {
    if (phase === "entry") return POSES["source0-entry"];
    if (phase === "mid") return POSES["E0-mid"];
    return POSES["source0-trailing"];
  }
  if (phase === "entry") return POSES["source1-entry"];
  if (phase === "mid") return POSES["E1-mid"];
  return POSES["source1-trailing"];
}

/** Mid labels follow the S01 form. Entry and trailing keep 入 / 后. */
export function eastHudToken(foot: PlantFoot, local: number): string {
  const pose = poseFor(foot, local);
  const text = local.toFixed(2);
  if (pose.id === "E0-mid") return `E01${text}`;
  if (pose.id === "E1-mid") return `E1${text}`;
  return `${foot}${pose.id.endsWith("trailing") ? "后" : "入"}${text}`;
}

/** World point of a planted sole. Support uses the entry contact; outgoing uses the entry lock. */
export function latchWorld(origin: WorldPoint, foot: PlantFoot, role: "support" | "outgoing"): WorldPoint {
  const pose = foot === 0 ? POSES["source0-entry"] : POSES["source1-entry"];
  const boot = pose.boots.find((item) => item.role === role);
  if (!boot) throw new Error(`missing ${role} boot`);
  const offset = artToWorld(boot.sole);
  return { x: origin.x + offset.x, y: origin.y + offset.y };
}

/**
 * Advance or freeze the east plant. Diagonal steps and other facings drop it.
 * A stop leaves the latch where it is. The root is never steered off the axis.
 */
export function stepEastPlant(
  plant: EastPlant | null,
  prev: WorldPoint,
  next: WorldPoint,
  moved: boolean,
  facingEast: boolean,
): EastPlant | null {
  if (!facingEast) return null;
  if (!moved) return plant;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (dx <= 1e-6 || Math.abs(dy) > 1e-4) return null;
  let originX = plant ? plant.originX : prev.x;
  let originY = plant ? plant.originY : prev.y;
  let foot: PlantFoot = plant ? plant.foot : 0;
  if (Math.abs(next.y - originY) > 1e-3) return null;
  let local = next.x - originX;
  while (local + 1e-9 >= PLANT_DISTANCE) {
    originX += PLANT_DISTANCE;
    local -= PLANT_DISTANCE;
    foot = foot === 0 ? 1 : 0;
  }
  return { originX, originY, foot, local };
}
