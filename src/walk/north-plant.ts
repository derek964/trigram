/**
 * North plant playback for the V6 north plates.
 * One plant is the measured same-foot step, 0.256 world units due north.
 * That is not the east 0.440 plant. Four such holds are the existing 1.024 cycle.
 * The root stays on the grid. This is not a gait pass.
 */
import { artToWorld, type ArtPoint, type WorldPoint } from "./east-plant";

export const NORTH_PLANT_DISTANCE = 0.256;
/** Two same-foot plants, N0–N1 then N2–N3. Not a new stride. */
export const NORTH_PLANT_PAIR = NORTH_PLANT_DISTANCE * 2;

export type NorthFoot = 0 | 1;
export type NorthPoseId = "N0" | "N1" | "N2" | "N3" | "idle";

export interface NorthBoot {
  file: string;
  foot: NorthFoot;
  sole: ArtPoint;
  latched: boolean;
  role: "support" | "swing" | "stand";
}

export interface NorthPose {
  id: NorthPoseId;
  spear: string;
  trousers: string;
  response: string | null;
  /** Back to front: smaller sole y first. */
  boots: NorthBoot[];
}

export interface NorthPlant {
  originX: number;
  originY: number;
  /** 1 is the N0–N1 plant. 0 is the N2–N3 plant. */
  foot: NorthFoot;
  local: number;
}

const POSES: Record<NorthPoseId, NorthPose> = {
  N0: {
    id: "N0",
    spear: "shared-n-spear.png",
    trousers: "trousers-N0.png",
    response: null,
    boots: [
      { file: "boot-foot0-N0-swing.png", foot: 0, sole: { x: 194, y: 589 }, latched: false, role: "swing" },
      { file: "boot-foot1-N0.png", foot: 1, sole: { x: 318, y: 599 }, latched: true, role: "support" },
    ],
  },
  N1: {
    id: "N1",
    spear: "n-spear-N1.png",
    trousers: "trousers-N1.png",
    response: "n-response-N1.png",
    boots: [
      { file: "boot-foot0-N1-swing.png", foot: 0, sole: { x: 226, y: 567 }, latched: false, role: "swing" },
      { file: "boot-foot1-N1.png", foot: 1, sole: { x: 254, y: 631 }, latched: true, role: "support" },
    ],
  },
  N2: {
    id: "N2",
    spear: "shared-n-spear.png",
    trousers: "trousers-N2.png",
    response: null,
    boots: [
      { file: "boot-foot0-N2.png", foot: 0, sole: { x: 258, y: 569 }, latched: true, role: "support" },
      { file: "boot-foot1-N2-swing.png", foot: 1, sole: { x: 286, y: 635 }, latched: false, role: "swing" },
    ],
  },
  N3: {
    id: "N3",
    spear: "n-spear-N3.png",
    trousers: "trousers-N3.png",
    response: "n-response-N3.png",
    boots: [
      { file: "boot-foot1-N3-swing.png", foot: 1, sole: { x: 286, y: 597 }, latched: false, role: "swing" },
      { file: "boot-foot0-N3.png", foot: 0, sole: { x: 194, y: 601 }, latched: true, role: "support" },
    ],
  },
  idle: {
    id: "idle",
    spear: "shared-n-spear.png",
    trousers: "trousers-idle.png",
    response: null,
    boots: [
      { file: "boot-foot0-idle.png", foot: 0, sole: { x: 226, y: 585 }, latched: false, role: "stand" },
      { file: "boot-foot1-idle.png", foot: 1, sole: { x: 286, y: 615 }, latched: false, role: "stand" },
    ],
  },
};

export function northPose(foot: NorthFoot, local: number): NorthPose {
  const trailing = local >= NORTH_PLANT_DISTANCE * 0.5;
  if (foot === 1) return trailing ? POSES.N1 : POSES.N0;
  return trailing ? POSES.N3 : POSES.N2;
}

export function northIdlePose(): NorthPose {
  return POSES.idle;
}

/** Support latch from the contact sample of this plant. */
export function northLatch(origin: WorldPoint, foot: NorthFoot): WorldPoint {
  const pose = foot === 1 ? POSES.N0 : POSES.N2;
  const boot = pose.boots.find((item) => item.role === "support");
  if (!boot) throw new Error("missing north support");
  const offset = artToWorld(boot.sole);
  return { x: origin.x + offset.x, y: origin.y + offset.y };
}

/**
 * Advance or freeze a north plant. The root is not steered off the north axis.
 * A stop leaves the latch where it is.
 */
export function stepNorthPlant(
  plant: NorthPlant | null,
  prev: WorldPoint,
  next: WorldPoint,
  moved: boolean,
  facingNorth: boolean,
): NorthPlant | null {
  if (!facingNorth) return null;
  if (!moved) return plant;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (dy >= -1e-6 || Math.abs(dx) > 1e-4) return null;
  let originX = plant ? plant.originX : prev.x;
  let originY = plant ? plant.originY : prev.y;
  let foot: NorthFoot = plant ? plant.foot : 1;
  if (Math.abs(next.x - originX) > 1e-3) return null;
  let local = originY - next.y;
  while (local + 1e-9 >= NORTH_PLANT_DISTANCE) {
    originY -= NORTH_PLANT_DISTANCE;
    local -= NORTH_PLANT_DISTANCE;
    foot = foot === 1 ? 0 : 1;
  }
  return { originX, originY, foot, local };
}
