/**
 * Hot-drop contract for four-direction hunter walk sheets.
 * RGBA PNG only. A JPEG, an RGB PNG, or the wrong pixel size is ignored.
 * Until a sheet passes, that direction keeps public/art/hunter.png,
 * which is one screen-right pose and is not a walk cycle.
 */
import type { Cardinal } from "./paper-hunter";

export const HUNTER_BODY_SCALE = 1.2;
/** Screen rise of a wall top above its base. Stays above the hunter body. */
export const WALL_RAISE_SCALE = 1.75;

export const WALK_FRAME_W = 512;
export const WALK_FRAME_H = 640;
export const WALK_FRAMES = 4;
/** Feet contact inside each frame. */
export const WALK_ANCHOR_X = 256;
export const WALK_ANCHOR_Y = 600;
/** V4 four-frame sheets. The pivot and the 1.53-unit cycle stay as they were. */
export const WALK_BATCH = "v4";
export const WALK_SHEET_W = WALK_FRAME_W * WALK_FRAMES;
export const WALK_SHEET_H = WALK_FRAME_H;

export const WALK_SHEET_URLS: Record<Cardinal, string> = {
  N: "art/walk/hunter-n.png",
  E: "art/walk/hunter-e.png",
  S: "art/walk/hunter-s.png",
  W: "art/walk/hunter-w.png",
};

/** One stand pose per facing. Same pivot as the walk cells. Not a second cycle. */
export const IDLE_URLS: Record<Cardinal, string> = {
  N: "art/idle/hunter-n-idle.png",
  E: "art/idle/hunter-e-idle.png",
  S: "art/idle/hunter-s-idle.png",
  W: "art/idle/hunter-w-idle.png",
};

export function idleSizeOk(width: number, height: number): boolean {
  return width === WALK_FRAME_W && height === WALK_FRAME_H;
}

/** A valid idle replaces the frozen walk frame on release, a blocked wall, and the flag. */
export function poseKind(moving: boolean, idleReady: boolean): "walk" | "idle" {
  return !moving && idleReady ? "idle" : "walk";
}

/** Optional stop poses. Four cells, 70ms each. Not a movement. */
export const SETTLE_MS = 70;
export const SETTLE_FRAMES = 4;

export function settleIndex(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.min(SETTLE_FRAMES - 1, Math.floor(elapsedMs / SETTLE_MS));
}

/** Walk wins as soon as the root moves again. Settle never extends the stop. */
export function visualPose(
  moving: boolean,
  settleOn: boolean,
  elapsedMs: number,
  hasStrip: boolean,
): "walk" | "settle" | "idle" {
  if (moving) return "walk";
  if (settleOn && hasStrip && elapsedMs < SETTLE_MS * SETTLE_FRAMES) return "settle";
  return "idle";
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** True only for an 8-bit RGBA PNG (color type 6). JPEG and RGB PNG fail. */
export function isRgbaPng(bytes: Uint8Array): boolean {
  if (bytes.length < 26) return false;
  for (let i = 0; i < PNG_SIG.length; i++) if (bytes[i] !== PNG_SIG[i]) return false;
  return bytes[24] === 8 && bytes[25] === 6;
}

export function sheetSizeOk(width: number, height: number): boolean {
  return width === WALK_SHEET_W && height === WALK_SHEET_H;
}

/** Frame 0 and 2 are the two planted steps. Idle and a missing cycle stay on frame 0. */
export function sheetFrame(phase: number, moving: boolean, frames = WALK_FRAMES): number {
  if (!moving || frames < 2) return 0;
  const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor((cycle / (Math.PI * 2)) * frames) % frames;
}

export function wallTallerThanHunter(): boolean {
  return WALL_RAISE_SCALE > HUNTER_BODY_SCALE;
}
