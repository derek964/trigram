/** Thin WeChat JS-bridge helpers. Safe on the web: every call no-ops without `wx`. */

export type WxVibrateType = "light" | "medium" | "heavy";

export interface WxRewardedAd {
  load: () => Promise<unknown> | unknown;
  show: () => Promise<unknown> | unknown;
  destroy?: () => void;
  onClose: (fn: (res: { isEnded?: boolean }) => void) => void;
  onError: (fn: (err: unknown) => void) => void;
}

export interface WxInterstitialAd {
  load: () => Promise<unknown> | unknown;
  show: () => Promise<unknown> | unknown;
  destroy?: () => void;
  onClose: (fn: () => void) => void;
  onError: (fn: (err: unknown) => void) => void;
}

export interface WxBridge {
  reportAnalytics?: (eventName: string, data: Record<string, string | number>) => void;
  vibrateShort?: (opts?: { type?: WxVibrateType }) => void;
  vibrateLong?: () => void;
  setStorageSync?: (key: string, data: string) => void;
  getStorageSync?: (key: string) => string;
  createRewardedVideoAd?: (opts: { adUnitId: string }) => WxRewardedAd;
  createInterstitialAd?: (opts: { adUnitId: string }) => WxInterstitialAd;
  createCanvas?: () => unknown;
}

export function getWx(): WxBridge | undefined {
  return (globalThis as { wx?: WxBridge }).wx;
}

export function hasWx(): boolean {
  return typeof getWx() !== "undefined";
}

export function vibrateNative(ms: number): boolean {
  const wx = getWx();
  try {
    if (wx?.vibrateLong && ms >= 60) {
      wx.vibrateLong();
      return true;
    }
    if (wx?.vibrateShort) {
      wx.vibrateShort({ type: ms >= 40 ? "medium" : "light" });
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      return Boolean(navigator.vibrate(ms));
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function storageGet(key: string): string | null {
  const wx = getWx();
  try {
    if (wx?.getStorageSync) {
      const v = wx.getStorageSync(key);
      return v == null || v === "" ? null : String(v);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    /* ignore */
  }
  return null;
}

export function storageSet(key: string, value: string): void {
  const wx = getWx();
  try {
    if (wx?.setStorageSync) {
      wx.setStorageSync(key, value);
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
