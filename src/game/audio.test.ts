import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  playSfx,
  rumble,
  resetAudioLog,
  setSfxImpl,
  setVibrateImpl,
  sfxLog,
  rumbleLog,
  SFX_NAMES,
  VIBE,
  type SfxName,
} from "./audio";
import { UI_BUTTON_IDS } from "./ui-buttons";

test("unmuted playSfx fires every named stub; mute is a no-op", () => {
  const fired: SfxName[] = [];
  setSfxImpl((name) => {
    fired.push(name);
  });
  resetAudioLog();
  for (const name of SFX_NAMES) {
    assert.equal(playSfx(name, false), false, `${name} must stay silent when muted`);
  }
  assert.deepEqual(fired, []);
  assert.equal(sfxLog().length, 0);

  for (const name of SFX_NAMES) {
    assert.equal(playSfx(name, true), true, `${name} must play when unmuted`);
  }
  assert.deepEqual(fired, [...SFX_NAMES]);
  assert.deepEqual(sfxLog(), [...SFX_NAMES]);
  setSfxImpl(null);
});

test("default unmuted stubs are not no-ops", () => {
  setSfxImpl(null);
  resetAudioLog();
  for (const name of SFX_NAMES) {
    assert.equal(playSfx(name, true), true, `${name} default stub must run`);
  }
  assert.equal(sfxLog().length, SFX_NAMES.length);
});

test("rumble respects vibeEnabled and records duration", () => {
  const pulses: number[] = [];
  setVibrateImpl((ms) => {
    pulses.push(ms);
    return true;
  });
  resetAudioLog();
  assert.equal(rumble(false, VIBE.ui), false);
  assert.deepEqual(pulses, []);
  assert.equal(rumbleLog().length, 0);

  assert.equal(rumble(true, VIBE.ui), true);
  assert.equal(rumble(true, VIBE.dead), true);
  assert.equal(rumble(true, VIBE.clear), true);
  assert.deepEqual(pulses, [VIBE.ui, VIBE.dead, VIBE.clear]);
  assert.deepEqual(rumbleLog(), [VIBE.ui, VIBE.dead, VIBE.clear]);
  assert.ok(VIBE.ui >= 10 && VIBE.ui <= 30);
  assert.ok(VIBE.dead >= 35 && VIBE.dead <= 50);
  assert.ok(VIBE.clear >= 60 && VIBE.clear <= 80);
  setVibrateImpl(null);
});

test("every HUD/menu button id exists in index.html", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.ok(UI_BUTTON_IDS.length >= 12, "button map is too thin");
  for (const id of UI_BUTTON_IDS) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id} in index.html`);
  }
});

test("game.ts wires onUi for every HUD/menu button", () => {
  const src = readFileSync(new URL("./game.ts", import.meta.url), "utf8");
  for (const id of UI_BUTTON_IDS) {
    assert.match(src, new RegExp(`onUi\\("${id}"`), `no onUi handler for #${id}`);
  }
});
