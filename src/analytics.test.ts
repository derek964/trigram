import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ANALYTICS_CAP,
  TRACKED_EVENTS,
  analyticsBuffer,
  clearEvents,
  recentEvents,
  reportToWeChat,
  resetAnalytics,
  setWxImpl,
  track,
} from "./analytics";

const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
};
Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });

test("track buffers events and reportToWeChat is a no-op without wx", () => {
  resetAnalytics();
  setWxImpl(null);
  assert.equal(reportToWeChat("app_launch", {}), false);
  const ev = track("app_launch", { v: "test" });
  assert.equal(ev.event, "app_launch");
  assert.equal(ev.props.v, "test");
  assert.equal(recentEvents()[0]?.event, "app_launch");
  assert.ok(analyticsBuffer().length >= 1);
});

test("wx.reportAnalytics adapter fires when wx is present", () => {
  resetAnalytics();
  const calls: [string, Record<string, string | number>][] = [];
  setWxImpl({
    reportAnalytics(name, data) {
      calls.push([name, data]);
    },
  });
  track("level_start", { level: 3, retry: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]![0], "level_start");
  assert.equal(calls[0]![1]!.level, 3);
  assert.equal(calls[0]![1]!.retry, 0);
  setWxImpl(null);
});

test("buffer caps and clearEvents empties storage", () => {
  resetAnalytics();
  for (let i = 0; i < ANALYTICS_CAP + 8; i++) track("move_step", { i });
  assert.equal(analyticsBuffer().length, ANALYTICS_CAP);
  assert.equal(recentEvents(20).length, 20);
  clearEvents();
  assert.equal(analyticsBuffer().length, 0);
  assert.equal(recentEvents().length, 0);
});

test("required events are wired in game.ts / main.ts / debug-panel.ts", () => {
  const game = readFileSync(new URL("./game/game.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  const debug = readFileSync(new URL("./debug-panel.ts", import.meta.url), "utf8");
  const blob = `${game}\n${main}\n${debug}`;
  for (const name of TRACKED_EVENTS) {
    assert.match(blob, new RegExp(`["']${name}["']`), `missing track(${name})`);
  }
  assert.match(main, /mountDebugPanel/);
  assert.match(debug, /get\("debug"\) === "1"/);
  assert.match(debug, /btn-debug-clear/);
  assert.match(game, /"level_retry" \? "level_retry" : "level_start"|retry \? "level_retry" : "level_start"/);
  assert.match(game, /track\("level_clear"/);
  assert.match(game, /track\("level_fail"/);
  assert.match(game, /track\("monitor_use"/);
  assert.match(game, /track\("repair_use"/);
  assert.match(game, /track\("ad_reward_offer"/);
  assert.match(game, /track\("ad_interstitial_stub"/);
  assert.match(game, /track\("settings_sfx_toggle"/);
  assert.match(game, /track\("settings_vibe_toggle"/);
  assert.match(game, /track\("path_tap"/);
  assert.match(game, /track\("move_step"/);
});

test("debug panel markup exists in index.html", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="debug-panel"/);
  assert.match(html, /id="debug-log"/);
  assert.match(html, /id="btn-debug-clear"/);
  assert.match(html, /id="btn-debug-close"/);
});
