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
export type PlantPoseId = "source0-entry" | "source0-trailing" | "source1-entry" | "source1-trailing";

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

export function poseFor(foot: PlantFoot, local: number): PlantPose {
  const trailing = local >= PLANT_DISTANCE * 0.5;
  if (foot === 0) return trailing ? POSES["source0-trailing"] : POSES["source0-entry"];
  return trailing ? POSES["source1-trailing"] : POSES["source1-entry"];
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
