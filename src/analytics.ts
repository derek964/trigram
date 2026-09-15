/** Lightweight analytics for the web prototype + WeChat 小游戏 adapter stub. */

export const ANALYTICS_KEY = "save-animals-analytics-v1";
export const ANALYTICS_CAP = 40;
export const ANALYTICS_VIEW = 20;

export const TRACKED_EVENTS = [
  "app_launch",
  "level_start",
  "level_clear",
  "level_fail",
  "level_retry",
  "monitor_use",
  "repair_use",
  "ad_reward_offer",
  "ad_interstitial_stub",
  "settings_sfx_toggle",
  "settings_vibe_toggle",
  "path_tap",
  "move_step",
] as const;

export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

export type AnalyticsProps = Record<string, string | number | boolean>;

export interface AnalyticsEvent {
  t: number;
  event: string;
  props: AnalyticsProps;
}

type WxLike = {
  reportAnalytics?: (eventName: string, data: Record<string, string | number>) => void;
};

type Listener = (ev: AnalyticsEvent, all: AnalyticsEvent[]) => void;

let buffer: AnalyticsEvent[] = [];
const listeners: Listener[] = [];
let wxImpl: WxLike | null = null;
let logImpl: ((event: string, props: AnalyticsProps) => void) | null = null;

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function persist(): void {
  try {
    storage()?.setItem(ANALYTICS_KEY, JSON.stringify(buffer));
  } catch {
    /* quota / private mode */
  }
}

function hydrate(): void {
  try {
    const raw = storage()?.getItem(ANALYTICS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as AnalyticsEvent[];
    if (Array.isArray(parsed)) {
      buffer = parsed.filter((e) => e && typeof e.event === "string").slice(-ANALYTICS_CAP);
    }
  } catch {
    buffer = [];
  }
}

hydrate();

function wantConsole(): boolean {
  try {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).has("debug")) return true;
  } catch {
    /* node tests */
  }
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

function wxGlobal(): WxLike | undefined {
  if (wxImpl) return wxImpl;
  return (globalThis as { wx?: WxLike }).wx;
}

/** Calling shape of `wx.reportAnalytics` when the WeChat JS bridge exists. */
export function reportToWeChat(event: string, props: AnalyticsProps): boolean {
  const wx = wxGlobal();
  if (typeof wx === "undefined" || typeof wx.reportAnalytics !== "function") return false;
  const data: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "number") data[k] = v;
    else if (typeof v === "boolean") data[k] = v ? 1 : 0;
    else data[k] = String(v);
  }
  try {
    wx.reportAnalytics(event, data);
    return true;
  } catch {
    return false;
  }
}

export function track(event: string, props: AnalyticsProps = {}): AnalyticsEvent {
  const ev: AnalyticsEvent = { t: Date.now(), event, props: { ...props } };
  buffer.push(ev);
  if (buffer.length > ANALYTICS_CAP) buffer.splice(0, buffer.length - ANALYTICS_CAP);
  persist();
  reportToWeChat(event, ev.props);
  const log = logImpl ?? (wantConsole() ? (name, p) => console.debug("[analytics]", name, p) : null);
  try {
    log?.(event, ev.props);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) {
    try {
      fn(ev, recentEvents(ANALYTICS_VIEW));
    } catch {
      /* ignore */
    }
  }
  return ev;
}

export function recentEvents(n = ANALYTICS_VIEW): AnalyticsEvent[] {
  return buffer.slice(-Math.max(0, n));
}

export function clearEvents(): void {
  buffer = [];
  try {
    storage()?.removeItem(ANALYTICS_KEY);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) {
    try {
      fn({ t: Date.now(), event: "__clear", props: {} }, []);
    } catch {
      /* ignore */
    }
  }
}

export function onAnalytics(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Test hooks — do not use from game code. */
export function setWxImpl(fn: WxLike | null): void {
  wxImpl = fn;
}

export function setAnalyticsLog(fn: ((event: string, props: AnalyticsProps) => void) | null): void {
  logImpl = fn;
}

export function resetAnalytics(): void {
  buffer = [];
  try {
    storage()?.removeItem(ANALYTICS_KEY);
  } catch {
    /* ignore */
  }
}

export function analyticsBuffer(): readonly AnalyticsEvent[] {
  return buffer;
}
