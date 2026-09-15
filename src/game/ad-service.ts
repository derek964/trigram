import { INTERSTITIAL_LEVELS, INTERSTITIAL_AD_UNIT_ID, REWARD_AD_UNIT_ID } from "./ad-config";
import { getWx, type WxInterstitialAd, type WxRewardedAd } from "../wx-api";

export type AdResult = "success" | "fail" | "cancel";
export type RewardedScene = "peek" | "heart" | "revive";

export interface AdShowRequest {
  kind: "rewarded" | "interstitial";
  scene?: RewardedScene | "chapter";
  levelId?: number;
}

type MockCtl = {
  result: AdResult;
  delayMs: number;
  throwOnShow: boolean;
};

const mock: MockCtl = { result: "success", delayMs: 1000, throwOnShow: false };
const requests: AdShowRequest[] = [];

export function resetAdService(): void {
  mock.result = "success";
  mock.delayMs = 0;
  mock.throwOnShow = false;
  requests.length = 0;
}

export function setAdMock(opts: Partial<MockCtl>): void {
  Object.assign(mock, opts);
}

export function adRequests(): readonly AdShowRequest[] {
  return requests;
}

export function shouldRequestInterstitial(levelId: number): boolean {
  return (INTERSTITIAL_LEVELS as readonly number[]).includes(levelId);
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

function record(req: AdShowRequest): void {
  requests.push(req);
}

/** Calling shape of `wx.createRewardedVideoAd`. Web uses a 1s mock. */
export function createRewardedVideoAd(opts: { adUnitId?: string } = {}): {
  show: () => Promise<AdResult>;
  load: () => Promise<void>;
  destroy: () => void;
} {
  const wx = getWx();
  const unit = opts.adUnitId ?? REWARD_AD_UNIT_ID;
  if (wx?.createRewardedVideoAd && !unit.startsWith("wxYOUR_")) {
    let ad: WxRewardedAd | null = null;
    try {
      ad = wx.createRewardedVideoAd({ adUnitId: unit });
    } catch {
      ad = null;
    }
    if (ad) {
      return {
        load: async () => {
          await ad!.load();
        },
        show: () =>
          new Promise<AdResult>((resolve) => {
            let done = false;
            const finish = (r: AdResult) => {
              if (done) return;
              done = true;
              resolve(r);
            };
            try {
              ad!.onClose((res) => finish(res?.isEnded ? "success" : "cancel"));
              ad!.onError(() => finish("fail"));
              const shown = ad!.show();
              if (shown && typeof (shown as Promise<unknown>).catch === "function") {
                void (shown as Promise<unknown>).catch(() => {
                  void Promise.resolve(ad!.load()).then(() => ad!.show()).catch(() => finish("fail"));
                });
              }
            } catch {
              finish("fail");
            }
          }),
        destroy: () => ad?.destroy?.(),
      };
    }
  }
  return {
    load: async () => undefined,
    show: async () => {
      if (mock.throwOnShow) return "fail";
      await wait(mock.delayMs);
      return mock.result;
    },
    destroy: () => undefined,
  };
}

/** Calling shape of `wx.createInterstitialAd`. */
export function createInterstitialAd(opts: { adUnitId?: string } = {}): {
  show: () => Promise<AdResult>;
  load: () => Promise<void>;
  destroy: () => void;
} {
  const wx = getWx();
  const unit = opts.adUnitId ?? INTERSTITIAL_AD_UNIT_ID;
  if (wx?.createInterstitialAd && !unit.startsWith("wxYOUR_")) {
    let ad: WxInterstitialAd | null = null;
    try {
      ad = wx.createInterstitialAd({ adUnitId: unit });
    } catch {
      ad = null;
    }
    if (ad) {
      return {
        load: async () => {
          await ad!.load();
        },
        show: () =>
          new Promise<AdResult>((resolve) => {
            let done = false;
            const finish = (r: AdResult) => {
              if (done) return;
              done = true;
              resolve(r);
            };
            try {
              ad!.onClose(() => finish("success"));
              ad!.onError(() => finish("fail"));
              const shown = ad!.show();
              if (shown && typeof (shown as Promise<unknown>).catch === "function") {
                void (shown as Promise<unknown>).catch(() => finish("fail"));
              }
            } catch {
              finish("fail");
            }
          }),
        destroy: () => ad?.destroy?.(),
      };
    }
  }
  return {
    load: async () => undefined,
    show: async () => {
      if (mock.throwOnShow) return "fail";
      await wait(mock.delayMs);
      return mock.result;
    },
    destroy: () => undefined,
  };
}

export async function showRewardedVideo(scene: RewardedScene, levelId?: number): Promise<AdResult> {
  record({ kind: "rewarded", scene, levelId });
  const ad = createRewardedVideoAd();
  try {
    await ad.load();
    return await ad.show();
  } catch {
    return "fail";
  } finally {
    ad.destroy();
  }
}

export async function showInterstitial(levelId: number): Promise<AdResult | "skipped"> {
  if (!shouldRequestInterstitial(levelId)) return "skipped";
  record({ kind: "interstitial", scene: "chapter", levelId });
  const ad = createInterstitialAd();
  try {
    await ad.load();
    return await ad.show();
  } catch {
    return "fail";
  } finally {
    ad.destroy();
  }
}
