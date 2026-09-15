/** Every HUD / menu control that must have a click handler + UI SFX. */
export const UI_BUTTON_IDS = [
  "btn-start",
  "btn-continue",
  "btn-restart",
  "btn-peek",
  "btn-undo",
  "btn-sfx",
  "btn-vib",
  "btn-next",
  "btn-win-home",
  "btn-fail-retry",
  "btn-fail-home",
  "btn-fail-ad",
  "btn-watch-ad",
  "btn-ad-cancel",
  "btn-ad-done",
  "btn-tip-ok",
  "btn-privacy",
  "btn-terms",
  "btn-age",
  "btn-legal-close",
] as const;

export type UiButtonId = (typeof UI_BUTTON_IDS)[number];
