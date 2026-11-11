/**
 * South plant playback for the V6 south plates.
 * One plant is the measured same-foot step, 0.256 world units due south.
 * That is not the east 0.440 plant. Four such holds are the existing 1.024 cycle.
 * The root stays on the grid. S0 at a small local still has a swing boot.
 * This is not a gait pass.
 */
import { artToWorld, type ArtPoint, type WorldPoint } from "./east-plant";

export const SOUTH_PLANT_DISTANCE = 0.256;
/** Two same-foot plants, S0–S1 then S2–S3. Not a new stride. */
export const SOUTH_PLANT_PAIR = SOUTH_PLANT_DISTANCE * 2;
export const SOUTH_UPPER = "shared-s-fixed-upper.png";
export const SOUTH_SHARED_SPEAR = "shared-s-spear.png";

export type SouthFoot = 0 | 1;
export type SouthPoseId = "S0" | "S1" | "S2" | "S3" | "idle";

export interface SouthBoot {
  file: string;
  foot: SouthFoot;
  sole: ArtPoint;
  latched: boolean;
  role: "support" | "swing" | "stand";
}

export interface SouthPose {
  id: SouthPoseId;
  /** Front spear, drawn after the body. S0, S2, and idle share one plate. */
  spear: string;
  trousers: string;
  /** S1/S3 replacement for the cleared arm-response region. Not an alpha-over. */
  response: string | null;
  /** Back to front: smaller sole y first. */
  boots: SouthBoot[];
}

export interface SouthPlant {
  originX: number;
  originY: number;
  /** 0 is the S0–S1 plant. 1 is the S2–S3 plant. */
  foot: SouthFoot;
  local: number;
}

export type SouthLayer =
  | { kind: "boot"; boot: SouthBoot }
  | { kind: "root"; file: string; role: "trousers" | "upper" | "response" | "spear" };

const POSES: Record<SouthPoseId, SouthPose> = {
  S0: {
    id: "S0",
    spear: SOUTH_SHARED_SPEAR,
    trousers: "trousers-S0.png",
    response: null,
    boots: [
      { file: "boot-foot1-S0-swing.png", foot: 1, sole: { x: 318.5, y: 587 }, latched: false, role: "swing" },
      { file: "boot-foot0-S0.png", foot: 0, sole: { x: 193.5, y: 601 }, latched: true, role: "support" },
    ],
  },
  S1: {
    id: "S1",
    spear: "s-spear-S1.png",
    trousers: "trousers-S1.png",
    response: "s-response-S1.png",
    boots: [
      { file: "boot-foot0-S1.png", foot: 0, sole: { x: 257.5, y: 569 }, latched: true, role: "support" },
      { file: "boot-foot1-S1-swing.png", foot: 1, sole: { x: 302.5, y: 605 }, latched: false, role: "swing" },
    ],
  },
  S2: {
    id: "S2",
    spear: SOUTH_SHARED_SPEAR,
    trousers: "trousers-S2.png",
    response: null,
    boots: [
      { file: "boot-foot0-S2-swing.png", foot: 0, sole: { x: 257.5, y: 557 }, latched: false, role: "swing" },
      { file: "boot-foot1-S2.png", foot: 1, sole: { x: 254.5, y: 631 }, latched: true, role: "support" },
    ],
  },
  S3: {
    id: "S3",
    spear: "s-spear-S3.png",
    trousers: "trousers-S3.png",
    response: "s-response-S3.png",
    boots: [
      { file: "boot-foot0-S3-swing.png", foot: 0, sole: { x: 225.5, y: 567 }, latched: false, role: "swing" },
      { file: "boot-foot1-S3.png", foot: 1, sole: { x: 318.5, y: 599 }, latched: true, role: "support" },
    ],
  },
  idle: {
    id: "idle",
    spear: SOUTH_SHARED_SPEAR,
    trousers: "trousers-idle.png",
    response: null,
    boots: [
      { file: "boot-foot0-idle.png", foot: 0, sole: { x: 225.5, y: 585 }, latched: false, role: "stand" },
      { file: "boot-foot1-idle.png", foot: 1, sole: { x: 286.5, y: 615 }, latched: false, role: "stand" },
    ],
  },
};

export function southPose(foot: SouthFoot, local: number): SouthPose {
  const trailing = local >= SOUTH_PLANT_DISTANCE * 0.5;
  if (foot === 0) return trailing ? POSES.S1 : POSES.S0;
  return trailing ? POSES.S3 : POSES.S2;
}

export function southIdlePose(): SouthPose {
  return POSES.idle;
}

/**
 * Back to front. Boots by sole y, then the cuff, then the shared upper,
 * then the S1/S3 replacement, then the front spear. No rear shaft.
 */
export function southLayers(pose: SouthPose): SouthLayer[] {
  const boots = [...pose.boots].sort((a, b) => a.sole.y - b.sole.y || a.sole.x - b.sole.x);
  const layers: SouthLayer[] = boots.map((boot) => ({ kind: "boot", boot }));
  layers.push({ kind: "root", file: pose.trousers, role: "trousers" });
  layers.push({ kind: "root", file: SOUTH_UPPER, role: "upper" });
  if (pose.response) layers.push({ kind: "root", file: pose.response, role: "response" });
  layers.push({ kind: "root", file: pose.spear, role: "spear" });
  return layers;
}

/** Support latch from the contact sample of this plant. */
export function southLatch(origin: WorldPoint, foot: SouthFoot): WorldPoint {
  const pose = foot === 0 ? POSES.S0 : POSES.S2;
  const boot = pose.boots.find((item) => item.role === "support");
  if (!boot) throw new Error("missing south support");
  const offset = artToWorld(boot.sole);
  return { x: origin.x + offset.x, y: origin.y + offset.y };
}

/**
 * Advance or freeze a south plant. The root is not steered off the south axis.
 * A stop leaves the latch where it is.
 */
export function stepSouthPlant(
  plant: SouthPlant | null,
  prev: WorldPoint,
  next: WorldPoint,
  moved: boolean,
  facingSouth: boolean,
): SouthPlant | null {
  if (!facingSouth) return null;
  if (!moved) return plant;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (dy <= 1e-6 || Math.abs(dx) > 1e-4) return null;
  let originX = plant ? plant.originX : prev.x;
  let originY = plant ? plant.originY : prev.y;
  let foot: SouthFoot = plant ? plant.foot : 0;
  if (Math.abs(next.x - originX) > 1e-3) return null;
  let local = next.y - originY;
  while (local + 1e-9 >= SOUTH_PLANT_DISTANCE) {
    originY += SOUTH_PLANT_DISTANCE;
    local -= SOUTH_PLANT_DISTANCE;
    foot = foot === 0 ? 1 : 0;
  }
  return { originX, originY, foot, local };
}
