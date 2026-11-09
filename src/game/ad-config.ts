/** Paste real ad unit IDs after 流量主开通. Safe to ship as placeholders. */
export const REWARD_AD_UNIT_ID = "wxYOUR_REWARD_AD_UNIT_ID";
export const INTERSTITIAL_AD_UNIT_ID = "wxYOUR_INTERSTITIAL_AD_UNIT_ID";

/**
 * 广告节奏 — the one place to tune ad pacing (modelled on Pocket Paths).
 * Placeholders only: no real ad IDs live here.
 */
export const AD_PACING = {
  interstitial: {
    /** Never show an interstitial on clears of levels 1..N. */
    noneThroughLevel: 10,
    /** Never during the player's first session. */
    skipFirstSession: true,
    /** At most one per this many cleared levels. */
    everyLevels: 3,
    /** And at least this long since the previous one. */
    minGapMs: 4 * 60 * 1000,
    /** Only shown after the level-complete screen, never after a fail. */
    onlyAfterClear: true,
  },
  rewarded: {
    /** Offered on the fail screen and when the run is close to winning. */
    undoSteps: 3,
    freezeThiefTurns: 1,
    hintSafeCells: 3,
    /** "Near win": all animals in the queue and the exit is this many cells away or less. */
    nearWinCells: 5,
  },
} as const;

/** Main 30-level game chapter beats; still filtered by AD_PACING. */
export const INTERSTITIAL_LEVELS = [10, 15, 20, 25, 30] as const;
