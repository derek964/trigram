import { vibrateNative } from "../wx-api";

export type SfxName =
  | "ui"
  | "step"
  | "closer"
  | "farther"
  | "dead"
  | "rescue"
  | "hole"
  | "bump"
  | "key"
  | "catch"
  | "toggleOn"
  | "toggleOff";

export const SFX_NAMES: readonly SfxName[] = [
  "ui",
  "step",
  "closer",
  "farther",
  "dead",
  "rescue",
  "hole",
  "bump",
  "key",
  "catch",
  "toggleOn",
  "toggleOff",
];

/** Haptic lengths in ms: UI 10–30, dead-end ~40, clear ~60–80. */
export const VIBE = {
  ui: 16,
  step: 12,
  dead: 40,
  medium: 28,
  clear: 72,
} as const;

type SfxImpl = (name: SfxName) => void;
type VibrateImpl = (ms: number) => boolean;

let ac: AudioContext | null = null;
let sfxImpl: SfxImpl | null = null;
let vibeImpl: VibrateImpl | null = null;
const played: SfxName[] = [];
const rumbled: number[] = [];

function ctx(): AudioContext | null {
  const C = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  if (!ac) ac = new C();
  return ac;
}

/** Resume the audio graph after a user gesture (required by browsers). */
export function unlockAudio(): void {
  try {
    void ctx()?.resume?.();
  } catch {
    /* ignore */
  }
}

function beep(freq: number, dur: number, vol = 0.045, type: OscillatorType = "sine", delay = 0): void {
  const audio = ctx();
  if (!audio) return;
  const t0 = audio.currentTime + delay;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g);
  g.connect(audio.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function defaultPlay(name: SfxName): void {
  unlockAudio();
  if (name === "ui") beep(760, 0.04, 0.04, "triangle");
  else if (name === "step") beep(880, 0.038, 0.032, "sine");
  else if (name === "closer") {
    beep(523, 0.05, 0.04, "triangle");
    beep(784, 0.07, 0.038, "sine", 0.04);
  } else if (name === "farther") beep(294, 0.055, 0.028, "triangle");
  else if (name === "dead") beep(185, 0.11, 0.045, "square");
  else if (name === "bump") beep(156, 0.06, 0.036, "square");
  else if (name === "hole") beep(392, 0.07, 0.04, "sine");
  else if (name === "key") {
    beep(659, 0.07, 0.04, "triangle");
    beep(880, 0.09, 0.038, "sine", 0.05);
  } else if (name === "rescue") {
    beep(523, 0.09, 0.042, "sine");
    beep(659, 0.1, 0.04, "sine", 0.07);
    beep(784, 0.14, 0.044, "sine", 0.14);
  } else if (name === "catch") beep(196, 0.14, 0.04, "triangle");
  else if (name === "toggleOn") {
    beep(523, 0.05, 0.04, "sine");
    beep(784, 0.07, 0.038, "sine", 0.04);
  } else if (name === "toggleOff") beep(330, 0.06, 0.032, "triangle");
  else throw new Error(`missing sfx stub: ${name as string}`);
}

export function setSfxImpl(fn: SfxImpl | null): void {
  sfxImpl = fn;
}

export function setVibrateImpl(fn: VibrateImpl | null): void {
  vibeImpl = fn;
}

export function resetAudioLog(): void {
  played.length = 0;
  rumbled.length = 0;
}

export function sfxLog(): readonly SfxName[] {
  return played;
}

export function rumbleLog(): readonly number[] {
  return rumbled;
}

export function playSfx(name: SfxName, enabled: boolean): boolean {
  if (!enabled) return false;
  played.push(name);
  try {
    (sfxImpl ?? defaultPlay)(name);
  } catch {
    /* ignore hardware failures; the log still proves the stub fired */
  }
  return true;
}

export function rumble(enabled: boolean, ms: number = VIBE.ui): boolean {
  if (!enabled) return false;
  rumbled.push(ms);
  const fn = vibeImpl ?? ((n: number) => vibrateNative(n));
  try {
    fn?.(ms);
  } catch {
    /* ignore */
  }
  return true;
}
