/**
 * West plant playback for the V6 west plates.
 * One plant is the measured same-foot step, 0.256 world units due west.
 * That is not the east 0.440 plant. Four such holds are the existing 1.024 cycle.
 * The root stays on the grid. World y is held. This is not a gait pass.
 */
import { artToWorld, type ArtPoint, type WorldPoint } from "./east-plant";

export const WEST_PLANT_DISTANCE = 0.256;
/** Two same-foot plants, W0–W1 then W2–W3. Not a new stride. */
export const WEST_PLANT_PAIR = WEST_PLANT_DISTANCE * 2;
export const WEST_UPPER = "shared-w-fixed-upper.png";
/** Shared upper with the official W1/W3 mask already zeroed. Not an alpha punch of the response plate. */
export const WEST_UPPER_W1 = "shared-w-fixed-upper-cleared-W1.png";
export const WEST_UPPER_W3 = "shared-w-fixed-upper-cleared-W3.png";
export const WEST_SHAFT = "shared-w-rear-shaft.png";
export const WEST_SHARED_SPEAR = "shared-w-spear.png";
/** Isolated-boot sole on the idle foot-1 plate. Not a V6 composite lock. */
export const WEST_IDLE_FOOT1_PLATE_SOLE: ArtPoint = { x: 268.5, y: 594 };

export type WestFoot = 0 | 1;
export type WestPoseId = "W0" | "W1" | "W2" | "W3" | "idle";

export interface WestBoot {
  file: string;
  foot: WestFoot;
  sole: ArtPoint;
  latched: boolean;
  role: "support" | "swing" | "stand";
}

export interface WestPose {
  id: WestPoseId;
  spear: string;
  trousers: string;
  /** Unpunched shared upper, or the official pre-cleared upper on W1/W3. */
  upper: string;
  response: string | null;
  /** Back to front: smaller sole y first. */
  boots: WestBoot[];
}

export interface WestPlant {
  originX: number;
  originY: number;
  /** 0 is the W0–W1 plant. 1 is the W2–W3 plant. */
  foot: WestFoot;
  local: number;
}

export type WestLayer =
  | { kind: "boot"; boot: WestBoot }
  | { kind: "root"; file: string; role: "shaft" | "trousers" | "upper" | "response" | "spear" };

const POSES: Record<WestPoseId, WestPose> = {
  W0: {
    id: "W0",
    spear: WEST_SHARED_SPEAR,
    trousers: "trousers-W0.png",
    upper: WEST_UPPER,
    response: null,
    boots: [
      { file: "boot-foot0-W0.png", foot: 0, sole: { x: 212.5, y: 590 }, latched: true, role: "support" },
      { file: "boot-foot1-W0-swing.png", foot: 1, sole: { x: 300.5, y: 598 }, latched: false, role: "swing" },
    ],
  },
  W1: {
    id: "W1",
    spear: "w-spear-W1.png",
    trousers: "trousers-W1.png",
    upper: WEST_UPPER_W1,
    response: "w-response-W1.png",
    boots: [
      { file: "boot-foot1-W1-swing.png", foot: 1, sole: { x: 268.5, y: 576 }, latched: false, role: "swing" },
      { file: "boot-foot0-W1.png", foot: 0, sole: { x: 276.5, y: 622 }, latched: true, role: "support" },
    ],
  },
  W2: {
    id: "W2",
    spear: WEST_SHARED_SPEAR,
    trousers: "trousers-W2.png",
    upper: WEST_UPPER,
    response: null,
    boots: [
      { file: "boot-foot1-W2.png", foot: 1, sole: { x: 236.5, y: 578 }, latched: true, role: "support" },
      { file: "boot-foot0-W2-swing.png", foot: 0, sole: { x: 300.5, y: 622 }, latched: false, role: "swing" },
    ],
  },
  W3: {
    id: "W3",
    spear: "w-spear-W3.png",
    trousers: "trousers-W3.png",
    upper: WEST_UPPER_W3,
    response: "w-response-W3.png",
    boots: [
      { file: "boot-foot0-W3-swing.png", foot: 0, sole: { x: 244.5, y: 588 }, latched: false, role: "swing" },
      { file: "boot-foot1-W3.png", foot: 1, sole: { x: 300.5, y: 610 }, latched: true, role: "support" },
    ],
  },
  idle: {
    id: "idle",
    spear: WEST_SHARED_SPEAR,
    trousers: "trousers-idle.png",
    upper: WEST_UPPER,
    response: null,
    boots: [
      // Foot 1's plate sole is the isolated boot. It is not a composite lock.
      { file: "boot-foot1-idle.png", foot: 1, sole: WEST_IDLE_FOOT1_PLATE_SOLE, latched: false, role: "stand" },
      { file: "boot-foot0-idle.png", foot: 0, sole: { x: 244.5, y: 606 }, latched: false, role: "stand" },
    ],
  },
};

export function westPose(foot: WestFoot, local: number): WestPose {
  const trailing = local >= WEST_PLANT_DISTANCE * 0.5;
  if (foot === 0) return trailing ? POSES.W1 : POSES.W0;
  return trailing ? POSES.W3 : POSES.W2;
}

export function westIdlePose(): WestPose {
  return POSES.idle;
}

/**
 * Back to front. Rear shaft, boots by sole y, cuff, upper, W1/W3 replacement, front spear.
 * W1 and W3 use the pre-cleared upper so the unwarped cloak is already gone.
 */
export function westLayers(pose: WestPose): WestLayer[] {
  const layers: WestLayer[] = [{ kind: "root", file: WEST_SHAFT, role: "shaft" }];
  const boots = [...pose.boots].sort((a, b) => a.sole.y - b.sole.y || a.sole.x - b.sole.x);
  for (const boot of boots) layers.push({ kind: "boot", boot });
  layers.push({ kind: "root", file: pose.trousers, role: "trousers" });
  layers.push({ kind: "root", file: pose.upper, role: "upper" });
  if (pose.response) layers.push({ kind: "root", file: pose.response, role: "response" });
  layers.push({ kind: "root", file: pose.spear, role: "spear" });
  return layers;
}

/** Support latch from the contact sample of this plant. Idle soles are not locks. */
export function westLatch(origin: WorldPoint, foot: WestFoot): WorldPoint {
  const pose = foot === 0 ? POSES.W0 : POSES.W2;
  const boot = pose.boots.find((item) => item.role === "support");
  if (!boot) throw new Error("missing west support");
  const offset = artToWorld(boot.sole);
  return { x: origin.x + offset.x, y: origin.y + offset.y };
}

/**
 * Advance or freeze a west plant. The root is not steered off the west axis.
 * A stop leaves the latch where it is.
 */
export function stepWestPlant(
  plant: WestPlant | null,
  prev: WorldPoint,
  next: WorldPoint,
  moved: boolean,
  facingWest: boolean,
): WestPlant | null {
  if (!facingWest) return null;
  if (!moved) return plant;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (dx >= -1e-6 || Math.abs(dy) > 1e-4) return null;
  let originX = plant ? plant.originX : prev.x;
  let originY = plant ? plant.originY : prev.y;
  let foot: WestFoot = plant ? plant.foot : 0;
  if (Math.abs(next.y - originY) > 1e-3) return null;
  let local = originX - next.x;
  while (local + 1e-9 >= WEST_PLANT_DISTANCE) {
    originX -= WEST_PLANT_DISTANCE;
    local -= WEST_PLANT_DISTANCE;
    foot = foot === 0 ? 1 : 0;
  }
  return { originX, originY, foot, local };
}
