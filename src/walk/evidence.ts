/**
 * Opt-in draw evidence. Off unless the page is opened with ?evidence=1.
 * It records the draw that already happened and paints that draw's id on the
 * same canvas. It does not step the walker, change dt, or choose plates.
 * A frame step is still about 0.043 world at 60Hz, so a 0.015 window can
 * pass without a draw. That skip is reported, not filled.
 * The extra work, only while enabled, is one row plus a short run of
 * rectangle paints. Sole residuals here are the projection already used to
 * place the boot, not a reading of screenshot pixels.
 */

export const EVIDENCE_LOG_CAP = 4096;
export const DRAW_ID_CELL = 8;
export const DRAW_ID_X = 12;
export const DRAW_ID_Y = 12;
export const DRAW_ID_BITS = 20;

/** Fixed floor points in the east corridor. World x is east, y is south. */
export const EVIDENCE_FIDUCIALS = [
  { id: "A", x: 1.72, y: 1.28 },
  { id: "B", x: 2.4, y: 1.78 },
  { id: "C", x: 3.2, y: 1.22 },
] as const;

export function evidenceEnabled(search: string): boolean {
  return new URLSearchParams(search).get("evidence") === "1";
}

export function drawIdPattern(id: number): boolean[] {
  const bits: boolean[] = [true, false, true];
  let rest = id;
  const body: boolean[] = [];
  for (let i = 0; i < DRAW_ID_BITS; i++) {
    body.push((rest & 1) === 1);
    rest = Math.floor(rest / 2);
  }
  body.reverse();
  bits.push(...body, true, false);
  return bits;
}

export function decodeDrawId(bits: boolean[]): number | null {
  if (bits.length !== 3 + DRAW_ID_BITS + 2) return null;
  if (!(bits[0] && !bits[1] && bits[2])) return null;
  if (!(bits[bits.length - 2] && !bits[bits.length - 1])) return null;
  let id = 0;
  for (let i = 0; i < DRAW_ID_BITS; i++) id = id * 2 + (bits[3 + i] ? 1 : 0);
  return id;
}

export interface EvidenceBoot {
  role: string;
  foot: 0 | 1;
  latched: boolean;
  soleArt: { x: number; y: number };
  latchWorld: { x: number; y: number } | null;
  /** Screen point this draw projected for the sole. Not a pixel sample. */
  projectedSole: { x: number; y: number } | null;
  projectedDeltaPx: number | null;
  projectedArtDelta: number | null;
}

export interface EvidenceRow {
  drawId: number;
  input: string[];
  root: { x: number; y: number };
  phase: number;
  moving: boolean;
  facing: string;
  blocked: boolean;
  plantFrozen: boolean;
  hudAtDraw: string;
  eastPlant: { originX: number; originY: number; foot: 0 | 1; local: number } | null;
  eastDrawn: { poseId: string; boots: EvidenceBoot[] } | null;
  camera: {
    back: number;
    eye: { x: number; y: number; z: number };
    look: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
    right: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
    fovY: number;
    aspect: number;
    view: { x: number; y: number; w: number; h: number };
  };
  fiducials: { id: string; world: { x: number; y: number }; projected: { x: number; y: number } | null }[];
  projectedNotPixel: true;
}

export function assembleEvidenceRow(drawId: number, row: Omit<EvidenceRow, "drawId" | "projectedNotPixel">): EvidenceRow {
  return { drawId, ...row, projectedNotPixel: true };
}
