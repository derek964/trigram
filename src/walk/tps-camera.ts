/**
 * Third-person corridor camera. Orthographic 2:1 stays in occlusion.ts for
 * the old tests. The play view uses this perspective camera instead.
 * Not a camera pass.
 */
import type { Cardinal } from "./paper-hunter";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cells behind the body. Clamped when a wall is closer than this. */
export const TPS_BACK = 1.7;
export const TPS_BACK_MIN = 0.45;
/** Off the floor, below the 1.75 wall top. */
export const TPS_EYE_HEIGHT = 1.05;
/** Aim ahead of the body, around the chest, not at the eyes. */
export const TPS_LOOK_AHEAD = 1.15;
export const TPS_LOOK_HEIGHT = 0.68;
export const TPS_FOV_Y_DEG = 52;
export const TPS_FOV_Y = (TPS_FOV_Y_DEG * Math.PI) / 180;
/** Picture width / height. Taller than the 3.3:1 canvas so the hall is not a panorama. */
export const TPS_VIEW_ASPECT = 0.8;

const DIR: Record<Cardinal, { x: number; z: number }> = {
  E: { x: 1, z: 0 },
  W: { x: -1, z: 0 },
  S: { x: 0, z: 1 },
  N: { x: 0, z: -1 },
};

export interface TpsCamera {
  eye: V3;
  look: V3;
  forward: V3;
  right: V3;
  up: V3;
  fovY: number;
  back: number;
  view: ViewRect;
  aspect: number;
}

export function letterbox(canvasW: number, canvasH: number, aspect = TPS_VIEW_ASPECT): ViewRect {
  let w = canvasH * aspect;
  let h = canvasH;
  if (w > canvasW) {
    w = canvasW;
    h = w / aspect;
  }
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
}

function norm(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Largest back offset that keeps the eye out of a blocked cell. */
export function cameraBack(wx: number, wy: number, cardinal: Cardinal, blocked: (x: number, y: number) => boolean): number {
  const dir = DIR[cardinal];
  for (let d = TPS_BACK; d >= TPS_BACK_MIN; d -= 0.05) {
    const ex = wx - dir.x * d;
    const ez = wy - dir.z * d;
    if (!blocked(ex, ez)) return Math.round(d * 100) / 100;
  }
  return TPS_BACK_MIN;
}

export function makeTpsCamera(
  wx: number,
  wy: number,
  cardinal: Cardinal,
  canvasW: number,
  canvasH: number,
  back = TPS_BACK,
): TpsCamera {
  const dir = DIR[cardinal];
  const eye = { x: wx - dir.x * back, y: TPS_EYE_HEIGHT, z: wy - dir.z * back };
  const look = { x: wx + dir.x * TPS_LOOK_AHEAD, y: TPS_LOOK_HEIGHT, z: wy + dir.z * TPS_LOOK_AHEAD };
  const forward = norm({ x: look.x - eye.x, y: look.y - eye.y, z: look.z - eye.z });
  const right = norm(cross({ x: 0, y: 1, z: 0 }, forward));
  const up = cross(forward, right);
  return { eye, look, forward, right, up, fovY: TPS_FOV_Y, back, view: letterbox(canvasW, canvasH), aspect: TPS_VIEW_ASPECT };
}

/** World x east, y up, z south. Returns null when the point is behind the camera. */
export function projectTps(east: number, up: number, south: number, cam: TpsCamera): Pt | null {
  const p = { x: east - cam.eye.x, y: up - cam.eye.y, z: south - cam.eye.z };
  const cx = dot(p, cam.right);
  const cy = dot(p, cam.up);
  const cz = dot(p, cam.forward);
  if (cz <= 0.08) return null;
  const t = Math.tan(cam.fovY / 2);
  const ndx = cx / (cz * t * cam.aspect);
  const ndy = cy / (cz * t);
  const view = cam.view;
  return { x: view.x + (ndx * 0.5 + 0.5) * view.w, y: view.y + (-ndy * 0.5 + 0.5) * view.h };
}

export function projectGround(east: number, south: number, cam: TpsCamera): Pt | null {
  return projectTps(east, 0, south, cam);
}

/**
 * Keep the whole billboard inside the letterbox, including art that hangs below the foot pivot.
 * `below` is that overhang as a fraction of the pivot height. Feet stay on the projection when it already fits.
 */
export function fitBillboard(
  feet: Pt,
  head: Pt,
  view: ViewRect,
  margin = 8,
  below = 0,
): { x: number; y: number; h: number } {
  const maxH = Math.max(16, (view.h - margin * 2) / (1 + below));
  let h = Math.min(Math.abs(feet.y - head.y), maxH);
  const drop = h * below;
  let y = feet.y;
  const bottom = view.y + view.h - margin;
  const top = view.y + margin;
  if (y + drop > bottom) y = bottom - drop;
  if (y - h < top) y = top + h;
  return { x: feet.x, y, h };
}

export function distanceTo(east: number, up: number, south: number, cam: TpsCamera): number {
  return Math.hypot(east - cam.eye.x, up - cam.eye.y, south - cam.eye.z);
}
