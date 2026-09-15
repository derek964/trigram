import { storageGet, storageSet } from "../wx-api";

const KEY = "save-animals-shelter-v1";
export const LEVEL_COUNT = 30;

export interface Progress {
  unlocked: number;
  current: number;
  bestSteps: number[];
  bestTime: number[];
  bestStars: number[];
  sfx: boolean;
  vib: boolean;
}

const defaults = (): Progress => ({
  unlocked: 1,
  current: 1,
  bestSteps: Array.from({ length: LEVEL_COUNT }, () => 0),
  bestTime: Array.from({ length: LEVEL_COUNT }, () => 0),
  bestStars: Array.from({ length: LEVEL_COUNT }, () => 0),
  sfx: true,
  vib: true,
});

export function loadProgress(): Progress {
  try {
    const raw = storageGet(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const d = defaults();
    return {
      unlocked: clampInt(parsed.unlocked ?? 1, 1, LEVEL_COUNT),
      current: clampInt(parsed.current ?? 1, 1, LEVEL_COUNT),
      bestSteps: Array.from({ length: LEVEL_COUNT }, (_, i) => Math.max(0, Math.floor(parsed.bestSteps?.[i] ?? 0))),
      bestTime: Array.from({ length: LEVEL_COUNT }, (_, i) => Math.max(0, parsed.bestTime?.[i] ?? 0)),
      bestStars: Array.from({ length: LEVEL_COUNT }, (_, i) => clampInt(parsed.bestStars?.[i] ?? 0, 0, 3)),
      sfx: parsed.sfx ?? d.sfx,
      vib: parsed.vib ?? d.vib,
    };
  } catch {
    return defaults();
  }
}

export function saveProgress(p: Progress): void {
  storageSet(KEY, JSON.stringify(p));
}

export function markCleared(levelId: number, steps: number, time: number, stars: number): Progress {
  const p = loadProgress();
  const idx = levelId - 1;
  const prevS = p.bestSteps[idx] ?? 0;
  const prevT = p.bestTime[idx] ?? 0;
  if (prevS === 0 || steps < prevS) p.bestSteps[idx] = steps;
  if (prevT === 0 || time < prevT) p.bestTime[idx] = time;
  p.bestStars[idx] = Math.max(p.bestStars[idx] ?? 0, stars);
  p.unlocked = Math.min(LEVEL_COUNT, Math.max(p.unlocked, levelId + 1));
  p.current = Math.min(LEVEL_COUNT, levelId + 1);
  saveProgress(p);
  return p;
}

function clampInt(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, Math.floor(n)));
}
