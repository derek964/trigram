import { LEVELS } from "./levels";

export const TIME_WARN_SEC = 10;
/** L1–5 (soft tutorial / 夜巡 opener): time may affect stars, never a hard fail. */
export const TUTORIAL_BAND_MAX = 5;

export function hardTimeLimitSec(levelId: number): number | null {
  const cfg = LEVELS[levelId - 1];
  if (!cfg || cfg.timeLimit <= 0) return null;
  return cfg.timeLimit;
}

export function remainingTimeSec(playTime: number, limit: number): number {
  return Math.max(0, limit - playTime);
}

/** Remaining `MM:SS` (e.g. 剩余 00:50). */
export function formatCountdown(remaining: number): string {
  const t = Math.max(0, Math.ceil(remaining - 1e-9));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function countdownUrgent(remaining: number): boolean {
  return remaining > 0 && remaining <= TIME_WARN_SEC;
}

export function playClockFrozen(input: {
  tipOpen: boolean;
  pauseOpen: boolean;
  adOpen: boolean;
}): boolean {
  return input.tipOpen || input.pauseOpen || input.adOpen;
}

export function stepPlayClock(playTime: number, dt: number, frozen: boolean): number {
  if (frozen || dt <= 0) return playTime;
  return playTime + dt;
}

export function shouldTimeFail(levelId: number, playTime: number): boolean {
  const limit = hardTimeLimitSec(levelId);
  return limit != null && playTime >= limit;
}

export type FailKind = "thief" | "timeout";

export function failReasonCopy(kind: FailKind, hopsLeft = 0): string {
  if (kind === "thief") return "被偷宠贼拦住了。";
  const n = Math.max(0, Math.round(hopsLeft));
  return `时间到了，还差${n}格。`;
}

export function failKicker(kind: FailKind): string {
  return kind === "thief" ? "糟了" : "时间到了";
}
