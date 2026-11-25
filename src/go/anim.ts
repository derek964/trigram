/**
 * Presentation-only motion helpers for Hitman GO.
 * Logic stays discrete (one adjacency hop); this file only interpolates draw positions.
 */

/** Smoothstep ease-in-out (same feel as chase hop). */
export function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hop duration in seconds — within Derek's 200–400ms ask. */
export const HOP_SEC = 0.3;

/** Subtle vertical bob while a piece is mid-hop (screen px scale via caller). */
export function walkBob(t: number, amp = 1): number {
  // one up-down cycle over the hop
  return Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * amp;
}

/** Continuous idle breathe / ear twitch for waiting animals. */
export function idleBob(timeSec: number, phase = 0, amp = 1): number {
  return Math.sin(timeSec * 2.1 + phase) * amp + Math.sin(timeSec * 4.2 + phase * 1.7) * amp * 0.4;
}

/** Stable phase from a string id so animals don't bob in sync. */
export function phaseFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h % 628) / 100; // ~0..6.28
}
