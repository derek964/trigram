import { INTERSTITIAL_LEVELS } from "./ad-config";

export type AdEventKind = "interstitial" | "revive_offer";

export interface AdEvent {
  kind: AdEventKind;
  levelId: number;
}

/** Mock IAA bus — no WeChat SDK. Tests and the game share this module singleton. */
export class AdBus {
  events: AdEvent[] = [];

  emit(kind: AdEventKind, levelId: number): AdEvent {
    const ev: AdEvent = { kind, levelId };
    this.events.push(ev);
    return ev;
  }

  reset(): void {
    this.events = [];
  }

  of(kind: AdEventKind): AdEvent[] {
    return this.events.filter((e) => e.kind === kind);
  }
}

export const adBus = new AdBus();

export function resetAdBus(): void {
  adBus.reset();
}

/** Chapter-end interstitial: L10 / L15 / L20 / L25 / L30. Never L1–9. */
export function interstitialOnClear(levelId: number): boolean {
  return (INTERSTITIAL_LEVELS as readonly number[]).includes(levelId);
}

/** Revive offer after a death, starting at the key chapter. */
export function reviveOnDeath(levelId: number): boolean {
  return levelId >= 11;
}

export function emitClear(levelId: number): AdEvent | null {
  if (!interstitialOnClear(levelId)) return null;
  return adBus.emit("interstitial", levelId);
}

export function emitDeath(levelId: number): AdEvent | null {
  if (!reviveOnDeath(levelId)) return null;
  return adBus.emit("revive_offer", levelId);
}
