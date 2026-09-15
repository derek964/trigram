import type { Chaser } from "./chaser";
import type { AnimalKind } from "./levels";

const INK = "#24302c";
const SKIN = "#f0c8a2";

function stroke(ctx: CanvasRenderingContext2D, w = 0.048): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
}

function oval(
  ctx: CanvasRenderingContext2D,
  fill: string,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0,
  line = 0.048,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx, line);
  ctx.stroke();
  ctx.restore();
}

function chip(
  ctx: CanvasRenderingContext2D,
  fill: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  line = 0.048,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx, line);
  ctx.stroke();
}

function tri(ctx: CanvasRenderingContext2D, fill: string, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx);
  ctx.stroke();
}

function shade(hex: string, t: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const m = (c: number) => Math.max(0, Math.min(255, Math.round(c + (t < 0 ? c * t : (255 - c) * t))));
  return `#${m(r).toString(16).padStart(2, "0")}${m(g).toString(16).padStart(2, "0")}${m(b).toString(16).padStart(2, "0")}`;
}

function shadow(ctx: CanvasRenderingContext2D, x = 0.02, y = 0.14): void {
  ctx.fillStyle = "rgba(24, 28, 26, 0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y, 0.22, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Top-down 值班员: mint uniform, cap, badge, backpack. +x is facing. */
export function drawVolunteer(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, time: number): void {
  const bob = Math.sin(time * 8) * 0.018;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  shadow(ctx, -0.02, 0.02);
  ctx.translate(bob * 0.15, bob);

  oval(ctx, "#3a4540", -0.2, -0.11, 0.08, 0.055);
  oval(ctx, "#3a4540", -0.2, 0.11, 0.08, 0.055);

  chip(ctx, "#6b4a2e", -0.34, -0.13, 0.18, 0.26, 0.07, 0.04);
  ctx.fillStyle = "#c9a227";
  ctx.beginPath();
  ctx.arc(-0.22, 0, 0.035, 0, Math.PI * 2);
  ctx.fill();

  chip(ctx, "#3d9a82", -0.2, -0.175, 0.4, 0.35, 0.14, 0.055);
  oval(ctx, "#2f7a68", 0.04, 0, 0.12, 0.1, 0, 0.03);
  chip(ctx, "#eef4f1", 0.12, -0.12, 0.08, 0.24, 0.04, 0.03);
  oval(ctx, "#e8c547", 0.02, -0.12, 0.045, 0.045, 0, 0.035);

  oval(ctx, "#2f7a68", 0.02, -0.22, 0.09, 0.07);
  oval(ctx, "#2f7a68", 0.02, 0.22, 0.09, 0.07);
  oval(ctx, SKIN, 0.04, -0.22, 0.05, 0.045, 0, 0.03);
  oval(ctx, SKIN, 0.04, 0.22, 0.05, 0.045, 0, 0.03);

  oval(ctx, SKIN, 0.2, 0, 0.135, 0.125);
  chip(ctx, "#1f5c52", 0.1, -0.13, 0.22, 0.26, 0.1, 0.045);
  chip(ctx, "#163f39", 0.26, -0.07, 0.12, 0.14, 0.04, 0.04);

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0.24, -0.045, 0.022, 0, Math.PI * 2);
  ctx.arc(0.24, 0.045, 0.022, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(0.25, -0.055, 0.01, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Hooded 偷宠贼 with a net pole, same body language as the volunteer. */
export function drawThief(ctx: CanvasRenderingContext2D, ch: Chaser, time: number): void {
  ctx.save();
  ctx.translate(ch.x, ch.y);
  ctx.rotate(ch.facing);
  ctx.fillStyle = ch.mode === "chase" ? "rgba(200,60,50,0.2)" : "rgba(40,40,50,0.12)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, Math.min(1.15, ch.vision * 0.22), -0.42, 0.42);
  ctx.closePath();
  ctx.fill();
  shadow(ctx, -0.02, 0.02);

  const hoodie = ch.mode === "chase" ? "#7a3838" : "#4a5560";
  const dark = ch.mode === "chase" ? "#4a2020" : "#2e3840";

  oval(ctx, "#2a2e32", -0.18, -0.1, 0.07, 0.05);
  oval(ctx, "#2a2e32", -0.18, 0.1, 0.07, 0.05);
  chip(ctx, hoodie, -0.2, -0.17, 0.4, 0.34, 0.14, 0.055);
  oval(ctx, dark, 0.02, -0.21, 0.08, 0.065);
  oval(ctx, dark, 0.02, 0.21, 0.08, 0.065);

  oval(ctx, SKIN, 0.16, 0, 0.11, 0.1, 0, 0.04);
  ctx.beginPath();
  ctx.moveTo(0.02, -0.16);
  ctx.quadraticCurveTo(0.34, 0, 0.02, 0.16);
  ctx.quadraticCurveTo(-0.08, 0, 0.02, -0.16);
  ctx.fillStyle = dark;
  ctx.fill();
  stroke(ctx, 0.05);
  ctx.stroke();
  ctx.fillStyle = "#1a1e22";
  ctx.beginPath();
  ctx.arc(0.2, -0.035, 0.02, 0, Math.PI * 2);
  ctx.arc(0.2, 0.035, 0.02, 0, Math.PI * 2);
  ctx.fill();

  const sway = Math.sin(time * 6) * 0.03;
  ctx.strokeStyle = "#c5ccd4";
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(0.22, -0.04);
  ctx.lineTo(0.48, -0.2 + sway);
  ctx.stroke();
  ctx.fillStyle = "rgba(180, 190, 200, 0.25)";
  ctx.beginPath();
  ctx.moveTo(0.4, -0.28 + sway);
  ctx.lineTo(0.58, -0.06 + sway);
  ctx.lineTo(0.5, 0.1 + sway);
  ctx.lineTo(0.34, -0.04 + sway);
  ctx.closePath();
  ctx.fill();
  stroke(ctx, 0.05);
  ctx.stroke();
  ctx.restore();
}

type Ear = "long" | "lop" | "tri" | "round" | "tuft" | "none";
type Tail = "puff" | "long" | "bush" | "curl" | "none";
type Muzzle = "dot" | "pig" | "beak" | "bill" | "none";

function look(id: string): {
  ear: Ear;
  tail: Tail;
  muzzle: Muzzle;
  mask: boolean;
  tux: boolean;
  shell: boolean;
  spike: boolean;
  antler: boolean;
  wool: boolean;
} {
  const ear: Ear =
    id === "bunny2" ? "lop"
    : id === "rabbit" || id === "deer" ? "long"
    : id === "cat" || id === "kit" || id === "fox" || id === "shiba" || id === "squirrel" || id === "redpan" || id === "goat"
      ? "tri"
    : id === "owl" || id === "hedge" ? "tuft"
    : id === "penguin" || id === "seal" || id === "frog" || id === "turtle" || id === "duck" || id === "chick" || id === "bird"
      ? "none"
    : "round";
  const tail: Tail =
    id === "cat" || id === "kit" || id === "fox" || id === "redpan" || id === "rac" || id === "squirrel" ? "bush"
    : id === "shiba" ? "curl"
    : id === "pup" || id === "mouse" || id === "otter" ? "long"
    : id === "penguin" || id === "frog" || id === "turtle" || id === "seal" || id === "owl" || id === "chick" || id === "duck" || id === "bird"
      ? "none"
    : "puff";
  const muzzle: Muzzle =
    id === "pig" ? "pig"
    : id === "chick" || id === "owl" || id === "penguin" || id === "bird" ? "beak"
    : id === "duck" ? "bill"
    : id === "frog" || id === "turtle" || id === "seal" ? "none"
    : "dot";
  return {
    ear,
    tail,
    muzzle,
    mask: id === "rac" || id === "panda",
    tux: id === "penguin" || id === "panda",
    shell: id === "turtle",
    spike: id === "hedge",
    antler: id === "deer" || id === "goat",
    wool: id === "lamb" || id === "ham" || id === "capy" || id === "koala",
  };
}

/** Top-down rescue animal. +x is facing (south by default, toward the gate). */
export function drawAnimalSprite(
  ctx: CanvasRenderingContext2D,
  kind: AnimalKind,
  time: number,
  caged: boolean,
  facing = Math.PI / 2,
): void {
  const f = look(kind.id);
  const fur = kind.color;
  const dark = shade(fur, -0.28);
  const light = shade(fur, 0.35);
  const bob = Math.sin(time * (caged ? 2.2 : 3.4)) * (caged ? 0.012 : 0.03);
  ctx.save();
  ctx.rotate(facing);
  ctx.translate(bob * 0.2, 0);
  ctx.scale(caged ? 0.9 : 1.02, caged ? 0.9 : 1.02);
  shadow(ctx, -0.04, 0.02);

  if (f.tail === "puff") oval(ctx, light, -0.28, 0, 0.09, 0.09);
  if (f.tail === "long") {
    ctx.beginPath();
    ctx.moveTo(-0.18, 0.02);
    ctx.quadraticCurveTo(-0.42, 0.16, -0.36, 0.02);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }
  if (f.tail === "bush") oval(ctx, dark, -0.32, 0.04, 0.16, 0.09, -0.4);
  if (f.tail === "curl") oval(ctx, dark, -0.26, 0.1, 0.08, 0.07, 0.8);

  if (f.shell) oval(ctx, "#6f8f5a", -0.02, 0, 0.22, 0.18);
  else if (f.spike) {
    ctx.fillStyle = dark;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.06, i * 0.07);
      ctx.lineTo(-0.22, i * 0.08);
      ctx.lineTo(0.02, i * 0.07 + 0.04);
      ctx.closePath();
      ctx.fill();
    }
    oval(ctx, fur, 0, 0, 0.2, 0.16);
  } else {
    oval(ctx, fur, -0.02, 0, 0.22, 0.17);
  }
  if (f.wool) {
    oval(ctx, light, -0.14, -0.12, 0.1, 0.09, 0, 0.03);
    oval(ctx, light, -0.14, 0.12, 0.1, 0.09, 0, 0.03);
    oval(ctx, light, -0.22, 0, 0.1, 0.1, 0, 0.03);
  }
  oval(ctx, light, 0.02, 0, 0.12, 0.1, 0, 0.03);

  if (f.tux && kind.id === "penguin") {
    oval(ctx, "#f7f4ef", 0.04, 0, 0.1, 0.09, 0, 0.03);
    oval(ctx, "#2c3840", -0.08, -0.1, 0.08, 0.06);
    oval(ctx, "#2c3840", -0.08, 0.1, 0.08, 0.06);
  }

  oval(ctx, dark, -0.1, -0.12, 0.07, 0.055);
  oval(ctx, dark, -0.1, 0.12, 0.07, 0.055);
  if (kind.id === "penguin") {
    oval(ctx, "#e89b3c", 0.1, -0.14, 0.07, 0.05, 0.2);
    oval(ctx, "#e89b3c", 0.1, 0.14, 0.07, 0.05, -0.2);
  } else {
    oval(ctx, fur, 0.1, -0.13, 0.065, 0.05);
    oval(ctx, fur, 0.1, 0.13, 0.065, 0.05);
  }

  if (f.ear === "long") {
    oval(ctx, fur, 0.08, -0.22, 0.055, 0.16, -0.35);
    oval(ctx, fur, 0.08, 0.22, 0.055, 0.16, 0.35);
    oval(ctx, "#f4b6c4", 0.08, -0.22, 0.025, 0.09, -0.35, 0.02);
    oval(ctx, "#f4b6c4", 0.08, 0.22, 0.025, 0.09, 0.35, 0.02);
  } else if (f.ear === "lop") {
    oval(ctx, fur, 0.1, -0.22, 0.06, 0.14, 0.5);
    oval(ctx, fur, 0.1, 0.22, 0.06, 0.14, -0.5);
  } else if (f.ear === "tri") {
    tri(ctx, fur, 0.12, -0.1, 0.08, -0.28, 0.24, -0.14);
    tri(ctx, fur, 0.12, 0.1, 0.08, 0.28, 0.24, 0.14);
  } else if (f.ear === "round") {
    oval(ctx, fur, 0.1, -0.18, 0.08, 0.08);
    oval(ctx, fur, 0.1, 0.18, 0.08, 0.08);
  } else if (f.ear === "tuft") {
    tri(ctx, dark, 0.14, -0.08, 0.1, -0.22, 0.22, -0.1);
    tri(ctx, dark, 0.14, 0.08, 0.1, 0.22, 0.22, 0.1);
  }

  if (f.antler) {
    ctx.strokeStyle = "#8a6a40";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(0.16, -0.16);
    ctx.lineTo(0.22, -0.28);
    ctx.moveTo(0.16, 0.16);
    ctx.lineTo(0.22, 0.28);
    ctx.stroke();
  }

  oval(ctx, fur, 0.2, 0, 0.15, 0.135);
  if (f.mask) {
    oval(ctx, kind.id === "panda" ? "#2c2c2c" : "#3a3530", 0.22, -0.05, 0.07, 0.055, 0, 0.03);
    oval(ctx, kind.id === "panda" ? "#2c2c2c" : "#3a3530", 0.22, 0.05, 0.07, 0.055, 0, 0.03);
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0.26, -0.04, 0.028, 0, Math.PI * 2);
  ctx.arc(0.26, 0.04, 0.028, 0, Math.PI * 2);
  ctx.fill();
  if (kind.blush) {
    ctx.fillStyle = "rgba(232, 120, 140, 0.45)";
    ctx.beginPath();
    ctx.ellipse(0.2, -0.09, 0.045, 0.025, 0, 0, Math.PI * 2);
    ctx.ellipse(0.2, 0.09, 0.045, 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (f.muzzle === "dot") {
    oval(ctx, "#c45a5a", 0.32, 0, 0.035, 0.028, 0, 0.03);
  } else if (f.muzzle === "pig") {
    oval(ctx, "#e8a0b0", 0.32, 0, 0.07, 0.05, 0, 0.035);
    ctx.fillStyle = "#c45a5a";
    ctx.beginPath();
    ctx.arc(0.34, -0.02, 0.012, 0, Math.PI * 2);
    ctx.arc(0.34, 0.02, 0.012, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.muzzle === "beak") {
    tri(ctx, "#e8b24a", 0.3, -0.04, 0.3, 0.04, 0.42, 0);
  } else if (f.muzzle === "bill") {
    oval(ctx, "#e8b24a", 0.34, 0, 0.08, 0.04, 0, 0.035);
  }

  if (kind.id === "frog") {
    oval(ctx, fur, 0.22, -0.1, 0.07, 0.07);
    oval(ctx, fur, 0.22, 0.1, 0.07, 0.07);
  }
  ctx.restore();
}
