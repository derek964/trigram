/**
 * public/art/hunter.png is one screen-right pose. It has no north, south,
 * east, or west sheet and no walk frames, so it cannot show a turn or a gait.
 * This figure is drawn in code, in the same kraft / green / spear palette.
 * Hips stay put. The feet alternate: one boot stays on the ground, the other
 * swings forward.
 */

export type Cardinal = "N" | "E" | "S" | "W";

export interface FacingRead {
  /** 0 back, 1 profile, 2 front. */
  eyes: 0 | 1 | 2;
  /** Profile nose. +1 points with east, -1 with west, 0 for front/back. */
  nose: -1 | 0 | 1;
  cloak: "back" | "front" | "side";
}

export interface Foot {
  /** -1 is behind the hips, +1 is in front. */
  along: number;
  /** 0 on the ground. Swing peaks near 0.4. */
  lift: number;
  planted: boolean;
}

export interface Gait {
  /** Always 0. The body does not hop. */
  hipLift: number;
  back: Foot;
  front: Foot;
}

export function cardinalFromFacing(facing: number): Cardinal {
  const a = Math.atan2(Math.sin(facing), Math.cos(facing));
  if (Math.abs(a) <= Math.PI / 4) return "E";
  if (Math.abs(a) >= (3 * Math.PI) / 4) return "W";
  return a > 0 ? "S" : "N";
}

export function facingRead(dir: Cardinal): FacingRead {
  if (dir === "N") return { eyes: 0, nose: 0, cloak: "back" };
  if (dir === "S") return { eyes: 2, nose: 0, cloak: "front" };
  if (dir === "E") return { eyes: 1, nose: 1, cloak: "side" };
  return { eyes: 1, nose: -1, cloak: "side" };
}

function legAt(t: number): Foot {
  const u = ((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (u < Math.PI) {
    const k = u / Math.PI;
    return { along: -0.62 + k * 1.24, lift: Math.sin(k * Math.PI) * 0.7, planted: false };
  }
  const k = (u - Math.PI) / Math.PI;
  return { along: 0.62 - k * 1.24, lift: 0, planted: true };
}

/** The two feet, in fixed order: phase leg, then the opposite leg. */
export function footPair(phase: number): [Foot, Foot] {
  return [legAt(phase), legAt(phase + Math.PI)];
}

/** One foot is always planted while the other swings, except when standing. */
export function gait(phase: number, moving: boolean): Gait {
  if (!moving) {
    return {
      hipLift: 0,
      back: { along: -0.18, lift: 0, planted: true },
      front: { along: 0.18, lift: 0, planted: true },
    };
  }
  const [a, b] = footPair(phase);
  const back = a.along <= b.along ? a : b;
  const front = a.along > b.along ? a : b;
  return { hipLift: 0, back, front };
}

const INK = "#3a2c22";
const SKIN = "#e6c4a0";
const HAT = "#c4a06a";
const HAT_DK = "#8d6844";
const CLOAK = "#5f734c";
const CLOAK_DK = "#3f5236";
const BELT = "#6b4a32";
const BOOT = "#1c120e";
const SPEAR = "#7a5a3a";
const TIP = "#d9d6cc";

interface V {
  x: number;
  y: number;
}

function axes(dir: Cardinal): { fx: number; fy: number; sx: number; sy: number } {
  if (dir === "E") return { fx: 1, fy: 0.08, sx: 0.02, sy: 0.55 };
  if (dir === "W") return { fx: -1, fy: -0.08, sx: -0.02, sy: -0.55 };
  if (dir === "S") return { fx: -0.42, fy: 0.92, sx: 0.9, sy: 0.16 };
  return { fx: 0.42, fy: -0.92, sx: -0.9, sy: -0.16 };
}

function unit(x: number, y: number): V {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

function add(a: V, b: V, s = 1): V {
  return { x: a.x + b.x * s, y: a.y + b.y * s };
}

function stroke(ctx: CanvasRenderingContext2D, a: V, b: V, w: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.stroke();
}

function disk(ctx: CanvasRenderingContext2D, p: V, rx: number, ry: number, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, rx * 0.12);
  ctx.stroke();
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hip: V,
  foot: V,
  kneeLift: number,
  u: number,
): void {
  const knee = { x: (hip.x + foot.x) / 2, y: (hip.y + foot.y) / 2 - kneeLift };
  const w = Math.max(6, u * 0.16);
  stroke(ctx, hip, knee, w, "#f0d7b0");
  stroke(ctx, knee, foot, w * 0.9, "#d7b48a");
  disk(ctx, foot, u * 0.2, u * 0.11, BOOT);
}

function drawSpear(ctx: CanvasRenderingContext2D, hand: V, dir: V, u: number): void {
  const tip = add(hand, dir, u * 0.95);
  const up = { x: tip.x - dir.y * u * 0.15, y: tip.y - u * 0.72 };
  stroke(ctx, hand, up, Math.max(2, u * 0.045), SPEAR);
  ctx.beginPath();
  ctx.moveTo(up.x, up.y);
  ctx.lineTo(up.x + dir.x * u * 0.16, up.y + u * 0.05);
  ctx.lineTo(up.x - dir.y * u * 0.08, up.y + u * 0.16);
  ctx.closePath();
  ctx.fillStyle = TIP;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Ground point is where the figure stands. Hips do not bob. Legs are drawn last. */
export function drawPaperHunter(
  ctx: CanvasRenderingContext2D,
  groundX: number,
  groundY: number,
  facing: number,
  phase: number,
  moving: boolean,
  scale: number,
): void {
  const dir = cardinalFromFacing(facing);
  const read = facingRead(dir);
  const step = gait(phase, moving);
  const u = Math.max(40, scale * 0.92);
  const raw = axes(dir);
  const f = unit(raw.fx, raw.fy);
  const s = { x: raw.sx, y: raw.sy };
  const hip: V = { x: groundX, y: groundY - u * 0.95 };
  const place = (foot: Foot, lateral: number): V => ({
    x: hip.x + f.x * foot.along * u * 1.15 + s.x * lateral * u,
    y: hip.y + f.y * foot.along * u * 1.15 + s.y * lateral * u + u * 0.22 - foot.lift * u,
  });
  const backFoot = place(step.back, read.cloak === "side" ? 0.02 : -0.16);
  const frontFoot = place(step.front, read.cloak === "side" ? -0.02 : 0.16);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(groundX, groundY + 3, u * 0.28, u * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(70,48,28,0.25)";
  ctx.fill();

  const shoulder = { x: hip.x, y: hip.y - u * 0.42 };
  if (read.cloak === "back") {
    disk(ctx, { x: hip.x, y: hip.y - u * 0.16 }, u * 0.3, u * 0.28, CLOAK_DK);
  } else if (read.cloak === "front") {
    disk(ctx, { x: hip.x, y: hip.y - u * 0.16 }, u * 0.32, u * 0.3, CLOAK);
    disk(ctx, add(hip, f, u * 0.04), u * 0.09, u * 0.1, BELT);
  } else {
    disk(ctx, add(hip, f, -u * 0.18), u * 0.18, u * 0.24, CLOAK_DK);
    disk(ctx, { x: hip.x, y: hip.y - u * 0.12 }, u * 0.18, u * 0.3, CLOAK);
  }

  const knee = (foot: Foot) => (foot.planted ? u * 0.04 : u * (0.22 + foot.lift * 0.8));
  drawLeg(ctx, hip, backFoot, knee(step.back), u);
  drawLeg(ctx, hip, frontFoot, knee(step.front), u);

  const head = { x: shoulder.x + f.x * u * 0.04, y: shoulder.y - u * 0.28 };
  disk(ctx, head, u * 0.2, u * 0.2, read.eyes === 0 ? HAT_DK : SKIN);
  disk(ctx, { x: head.x + f.x * u * 0.06, y: head.y - u * 0.04 }, u * (read.cloak === "side" ? 0.28 : 0.36), u * 0.08, HAT_DK);
  disk(ctx, { x: head.x, y: head.y - u * 0.2 }, u * 0.15, u * 0.12, HAT);

  if (read.eyes === 2) {
    disk(ctx, add(head, s, 0.1), u * 0.055, u * 0.06, INK);
    disk(ctx, add(head, s, -0.1), u * 0.055, u * 0.06, INK);
  } else if (read.eyes === 1) {
    const eye = add(head, f, u * 0.12);
    disk(ctx, eye, u * 0.05, u * 0.055, INK);
    ctx.beginPath();
    const nx = eye.x + f.x * u * 0.22;
    const ny = eye.y + f.y * u * 0.08;
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(nx, ny - u * 0.06);
    ctx.lineTo(nx, ny + u * 0.08);
    ctx.closePath();
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, u * 0.04);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  drawSpear(ctx, add(shoulder, s, 0.22), f, u * 1.15);
  ctx.restore();
}
