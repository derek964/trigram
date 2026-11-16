import { AD_PACING } from "./ad-config";

export interface PacingState {
  session: number; // 1 = first session
  clearsSinceLast: number;
  lastShownAt: number; // ms epoch, 0 = never
}

const KEY = "save-animals-ad-pacing-v1";

export function freshPacing(): PacingState {
  return { session: 1, clearsSinceLast: 0, lastShownAt: 0 };
}

/** Pure rule: may we show an interstitial after clearing `levelId`? */
export function interstitialAllowed(
  st: PacingState,
  levelId: number,
  now: number,
  after: "clear" | "fail",
): boolean {
  const c = AD_PACING.interstitial;
  if (after !== "clear") return false;
  if (levelId <= c.noneThroughLevel) return false;
  if (c.skipFirstSession && st.session <= 1) return false;
  if (st.clearsSinceLast + 1 < c.everyLevels) return false;
  if (st.lastShownAt > 0 && now - st.lastShownAt < c.minGapMs) return false;
  return true;
}

/** Record a clear; returns true if an interstitial should be shown now. */
export function onLevelClear(st: PacingState, levelId: number, now: number): boolean {
  const ok = interstitialAllowed(st, levelId, now, "clear");
  if (ok) {
    st.clearsSinceLast = 0;
    st.lastShownAt = now;
  } else st.clearsSinceLast++;
  return ok;
}

let cached: PacingState | null = null;

/** Browser-persisted state; each page load counts as a new session. */
export function pacing(): PacingState {
  if (cached) return cached;
  let st = freshPacing();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const old = JSON.parse(raw) as PacingState;
      st = { ...st, ...old, session: (old.session ?? 0) + 1 };
    }
    globalThis.localStorage?.setItem(KEY, JSON.stringify(st));
  } catch {
    /* no storage */
  }
  cached = st;
  return st;
}

export function savePacing(): void {
  try {
    if (cached) globalThis.localStorage?.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* ignore */
  }
}
