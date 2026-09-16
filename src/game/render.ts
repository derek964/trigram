import type { Chaser } from "./chaser";
import { isApproachStroke, type Maze } from "./maze";
import { angLerp, angNorm, type Vec2 } from "./math";
import { drawAnimalSprite, drawThief, drawVolunteer } from "./sprites";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Player {
  x: number;
  y: number;
  facing: number;
}

export interface RenderView {
  maze: Maze;
  player: Player;
  chaser: Chaser | null;
  cam: Camera;
  time: number;
  peeking: boolean;
  hasKey: boolean;
  holeFlash: Vec2 | null;
  animalPos?: Vec2 | null;
  animalFacing?: number;
  trail?: number[];
  visionMask?: boolean;
  visionRadius?: number;
  trailMood?: number;
  trailPulse?: number;
  preview?: { pts: Vec2[]; ok: boolean } | null;
  goalMark?: Vec2 | null;
  chevron?: { x: number; y: number; ang: number } | null;
  particles?: { x: number; y: number; r: number; a: number }[];
  clearPulse?: number;
  hugScale?: number;
  ghost?: { x: number; y: number; facing: number } | null;
  repairMode?: boolean;
}

/** Follow-cam circular vision radius, world units. L2 uses 2.2; L3+ uses 2.0. L1 is full-bright. */
export const PLAY_VISION_RADIUS = 2.0;
const VISION_FEATHER = 0.045;

export function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, view: RenderView): void {
  const { maze, player, cam, time, peeking } = view;
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#d8f3e8");
  g.addColorStop(1, "#c3eadb");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.translate(w * 0.5, h * 0.5);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);

  drawYard(ctx, maze);
  drawFloor(ctx, maze);
  drawGrass(ctx, maze);
  drawTrail(ctx, maze, view.trail, player, view.trailMood ?? 0, view.trailPulse ?? 0);
  drawChamberFloor(ctx, maze, view.hasKey);
  drawWalls(ctx, maze);
  if (view.repairMode) drawRepairHighlight(ctx, maze, time);
  if (maze.locked) drawCageDoor(ctx, maze);
  drawIsolationGlow(ctx, maze, time);
  if (maze.keyPos && !view.hasKey) drawKey(ctx, maze.keyPos, time);
  if (view.holeFlash) drawHoleFlash(ctx, view.holeFlash, time);
  const animalAt = view.animalPos ?? { x: 0, y: 0 };
  const caged = maze.config.needsKey && !view.hasKey;
  ctx.save();
  ctx.translate(animalAt.x, animalAt.y);
  const hug = view.hugScale ?? 1;
  ctx.scale(hug, hug);
  drawAnimalSprite(ctx, maze.config.animal, time, caged, view.animalFacing ?? Math.PI / 2);
  ctx.restore();
  if (maze.config.needsKey) drawCageBars(ctx, maze, time, view.hasKey);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(hug, hug);
  ctx.translate(-player.x, -player.y);
  drawVolunteer(ctx, player.x, player.y, player.facing, time);
  ctx.restore();
  if (view.ghost) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawVolunteer(ctx, view.ghost.x, view.ghost.y, view.ghost.facing, time);
    ctx.restore();
  }
  if (view.chaser) drawThief(ctx, view.chaser, time);
  if (view.particles) drawParticles(ctx, view.particles);

  if (peeking) {
    ctx.strokeStyle = "rgba(255, 123, 107, 0.9)";
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 0.52 + Math.sin(time * 4) * 0.06, 0, Math.PI * 2);
    ctx.stroke();
  } else if (view.visionMask) {
    const radius = view.visionRadius ?? PLAY_VISION_RADIUS;
    drawVisionMask(ctx, player, cam, w, h, radius);
    drawWallSilhouette(ctx, maze, player, cam, w, h, radius);
  }
  // Route preview sits above fog so a tap-to-move path stays readable.
  if (view.preview) drawPreview(ctx, view.preview.pts, view.preview.ok);
  if (view.goalMark) drawGoalMark(ctx, view.goalMark, time);
  if (view.chevron) drawChevron(ctx, view.chevron);
  if (view.clearPulse && view.clearPulse > 0) {
    ctx.fillStyle = `rgba(255, 253, 249, ${0.22 * view.clearPulse})`;
    const hw = w / (2 * cam.scale) + 2;
    const hh = h / (2 * cam.scale) + 2;
    ctx.fillRect(cam.x - hw, cam.y - hh, hw * 2, hh * 2);
  }
  ctx.restore();
}

function drawVisionMask(
  ctx: CanvasRenderingContext2D,
  player: Player,
  cam: Camera,
  viewW: number,
  viewH: number,
  radius: number,
): void {
  const hw = viewW / (2 * cam.scale) + 1.2;
  const hh = viewH / (2 * cam.scale) + 1.2;
  const inner = Math.max(0.08, radius - VISION_FEATHER);
  const g = ctx.createRadialGradient(player.x, player.y, inner, player.x, player.y, radius);
  g.addColorStop(0, "rgba(28, 52, 46, 0)");
  g.addColorStop(1, "rgba(18, 42, 36, 0.78)");
  ctx.fillStyle = g;
  ctx.fillRect(cam.x - hw, cam.y - hh, hw * 2, hh * 2);
}

function drawYard(ctx: CanvasRenderingContext2D, maze: Maze): void {
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  const r = maze.outerR + 2.2;
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.arc(Math.cos(t) * r, Math.sin(t) * r, 0.7 + (i % 3) * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, maze: Maze): void {
  const h = maze.outerR;
  ctx.beginPath();
  ctx.roundRect(-h, -h, h * 2, h * 2, 0.28);
  ctx.fillStyle = "#eefbf4";
  ctx.fill();
  ctx.save();
  ctx.clip();
  const wash = ctx.createRadialGradient(0, h * 0.1, h * 0.18, 0, 0, h * 1.12);
  wash.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  wash.addColorStop(1, "rgba(150, 210, 188, 0.18)");
  ctx.fillStyle = wash;
  ctx.fillRect(-h, -h, h * 2, h * 2);
  ctx.fillStyle = "rgba(120, 196, 168, 0.07)";
  ctx.beginPath();
  ctx.ellipse(-h * 0.28, -h * 0.18, h * 0.55, h * 0.4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(h * 0.32, h * 0.22, h * 0.5, h * 0.36, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrass(ctx: CanvasRenderingContext2D, maze: Maze): void {
  for (const g of maze.grass) {
    ctx.save();
    ctx.fillStyle = "rgba(86, 132, 104, 0.42)";
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, g.r, g.r * 0.7, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(58, 96, 74, 0.55)";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(g.x - g.r * 0.25, g.y + g.r * 0.1);
    ctx.quadraticCurveTo(g.x - g.r * 0.08, g.y - g.r * 0.7, g.x, g.y + g.r * 0.05);
    ctx.moveTo(g.x, g.y + g.r * 0.12);
    ctx.quadraticCurveTo(g.x + g.r * 0.05, g.y - g.r * 0.75, g.x + g.r * 0.22, g.y + g.r * 0.08);
    ctx.stroke();
    ctx.restore();
  }
}

/** Inner ribbon width in world units; outer glow is ~1.7× this. */
export const TRAIL_WIDTH = 0.2;

function drawTrail(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  trail: number[] | undefined,
  player: Player,
  mood: number,
  pulse: number,
): void {
  if (!trail || trail.length === 0) return;
  const pts: Vec2[] = [];
  for (const id of trail) {
    const c = maze.cells[id];
    if (c) pts.push({ x: c.x, y: c.y });
  }
  const last = pts[pts.length - 1];
  if (last && Math.hypot(player.x - last.x, player.y - last.y) > 0.05) {
    pts.push({ x: player.x, y: player.y });
  }
  const warm = Math.max(0, mood);
  const cool = Math.max(0, -mood);
  const outer = `rgba(${Math.round(255 - cool * 80)}, ${Math.round(176 + warm * 20 - cool * 40)}, ${Math.round(140 + cool * 70)}, ${0.32 + pulse * 0.2})`;
  const inner = `rgba(${Math.round(255 - cool * 90)}, ${Math.round(112 + warm * 30 - cool * 20)}, ${Math.round(86 + cool * 80)}, ${0.72 + pulse * 0.15})`;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const width = TRAIL_WIDTH * (1 + pulse * 0.45);
  if (pts.length === 1) {
    const p = pts[0]!;
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(p.x, p.y, width * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  strokeRibbon(ctx, pts, width * 1.7, outer);
  strokeRibbon(ctx, pts, width, inner);
  ctx.restore();
}

function drawPreview(ctx: CanvasRenderingContext2D, pts: Vec2[], ok: boolean): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([0.16, 0.1]);
  strokeRibbon(ctx, pts, 0.26, ok ? "rgba(255, 255, 255, 0.38)" : "rgba(80, 16, 12, 0.42)");
  strokeRibbon(ctx, pts, 0.15, ok ? "rgba(72, 214, 176, 0.95)" : "rgba(255, 92, 72, 0.95)");
  ctx.setLineDash([]);
  const tip = pts[pts.length - 1]!;
  ctx.fillStyle = ok ? "rgba(72, 214, 176, 0.95)" : "rgba(255, 92, 72, 0.95)";
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGoalMark(ctx: CanvasRenderingContext2D, p: Vec2, time: number): void {
  const r = 0.28 + Math.sin(time * 4) * 0.05;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 196, 90, 0.85)";
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 220, 140, 0.35)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawChevron(ctx: CanvasRenderingContext2D, c: { x: number; y: number; ang: number }): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.ang);
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = "#3d9a82";
  ctx.beginPath();
  ctx.moveTo(0.22, 0);
  ctx.lineTo(-0.12, 0.16);
  ctx.lineTo(-0.12, -0.16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, bits: { x: number; y: number; r: number; a: number }[]): void {
  for (const p of bits) {
    ctx.fillStyle = `rgba(255, 186, 120, ${p.a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function strokeRibbon(ctx: CanvasRenderingContext2D, pts: Vec2[], width: number, color: string): void {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1]!.x, pts[1]!.y);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const n = pts[i + 1]!;
      ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) * 0.5, (p.y + n.y) * 0.5);
    }
    ctx.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
  }
  ctx.stroke();
}

/** Drawn wall stroke in world units. Was a 0.38 + 0.12 slab (~0.50). Collision uses `config.wallWidth` (0.18). */
export const WALL_DRAW_WIDTH = 0.16;

function drawWalls(ctx: CanvasRenderingContext2D, maze: Maze): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const paint = (color: string, width: number, ox = 0, oy = 0) => {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const s of maze.strokes) {
      if (s.kind === "arc") {
        const a0 = angNorm(s.th0);
        const span = Math.max(0.01, angLerp(s.th0, s.th1));
        ctx.moveTo(s.r * Math.cos(a0), s.r * Math.sin(a0));
        ctx.arc(0, 0, s.r, a0, a0 + span);
      } else if (s.kind === "radial") {
        ctx.moveTo(s.ri * Math.cos(s.th), s.ri * Math.sin(s.th));
        ctx.lineTo(s.ro * Math.cos(s.th), s.ro * Math.sin(s.th));
      } else {
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(s.b.x, s.b.y);
      }
    }
    ctx.stroke();
    ctx.restore();
  };
  paint("rgba(47, 109, 98, 0.22)", WALL_DRAW_WIDTH + 0.05, 0.02, 0.025);
  paint("#2b6b5e", WALL_DRAW_WIDTH);
}

function drawRepairHighlight(ctx: CanvasRenderingContext2D, maze: Maze, time: number): void {
  const pulse = 0.72 + Math.sin(time * 6) * 0.18;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const paint = (color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const s of maze.strokes) {
      if (isApproachStroke(maze, s)) continue;
      if (s.kind === "arc") {
        const a0 = angNorm(s.th0);
        const span = Math.max(0.01, angLerp(s.th0, s.th1));
        ctx.moveTo(s.r * Math.cos(a0), s.r * Math.sin(a0));
        ctx.arc(0, 0, s.r, a0, a0 + span);
      } else if (s.kind === "radial") {
        ctx.moveTo(s.ri * Math.cos(s.th), s.ri * Math.sin(s.th));
        ctx.lineTo(s.ro * Math.cos(s.th), s.ro * Math.sin(s.th));
      } else {
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(s.b.x, s.b.y);
      }
    }
    ctx.stroke();
  };
  paint(`rgba(255, 123, 107, ${pulse * 0.45})`, WALL_DRAW_WIDTH + 0.22);
  paint(`rgba(255, 210, 170, ${pulse})`, WALL_DRAW_WIDTH + 0.04);
  ctx.restore();
}

function drawWallSilhouette(
  ctx: CanvasRenderingContext2D,
  maze: Maze,
  player: Player,
  cam: Camera,
  viewW: number,
  viewH: number,
  radius: number,
): void {
  const hw = viewW / (2 * cam.scale) + 1.2;
  const hh = viewH / (2 * cam.scale) + 1.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cam.x - hw, cam.y - hh, hw * 2, hh * 2);
  ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Pale mint on the dark fog so corridor topology stays readable outside the disc.
  ctx.strokeStyle = "rgba(214, 244, 232, 0.58)";
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  for (const s of maze.strokes) {
    if (s.kind === "seg") {
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
    }
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 250, 240, 0.28)";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawChamberFloor(ctx: CanvasRenderingContext2D, maze: Maze, hasKey: boolean): void {
  const locked = maze.config.needsKey && !hasKey;
  const s = maze.hedge - 0.04;
  ctx.fillStyle = locked ? "#8fd4b8" : "#b6f0d4";
  ctx.beginPath();
  ctx.roundRect(-s, -s, s * 2, s * 2, 0.16);
  ctx.fill();
  ctx.fillStyle = "rgba(46, 110, 92, 0.55)";
  ctx.font = `${Math.max(0.22, maze.cellSize * 0.18)}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("隔离间", 0, -s + 0.34);
}

function drawIsolationGlow(ctx: CanvasRenderingContext2D, maze: Maze, time: number): void {
  if (maze.config.needsKey) return;
  ctx.save();
  ctx.fillStyle = "rgba(255, 248, 220, 0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.55, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(232, 170, 90, 0.7)";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + time * 0.15;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCageBars(ctx: CanvasRenderingContext2D, maze: Maze, time: number, hasKey: boolean): void {
  const locked = maze.config.needsKey && !hasKey;
  const r = maze.cage;
  ctx.save();

  if (locked) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(62, 48, 32, 0.82)";
    ctx.lineWidth = 0.07;
    ctx.lineCap = "round";
    for (let x = -r + 0.16; x <= r - 0.12; x += 0.18) {
      ctx.beginPath();
      ctx.moveTo(x, -r);
      ctx.lineTo(x, r);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(90, 70, 42, 0.9)";
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.62);
    ctx.lineTo(r, -r * 0.62);
    ctx.moveTo(-r, r * 0.62);
    ctx.lineTo(r, r * 0.62);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#d7b24a";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    drawLock(ctx, r * 1.02, time);
  } else {
    ctx.strokeStyle = "rgba(80, 140, 70, 0.55)";
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(201, 162, 39, 0.7)";
    ctx.setLineDash([0.16, 0.1]);
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, 0.4, Math.PI * 1.7);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawLock(ctx: CanvasRenderingContext2D, y: number, time: number): void {
  ctx.save();
  ctx.translate(0, y);
  ctx.translate(0, Math.sin(time * 3) * 0.02);
  ctx.scale(1.35, 1.35);
  ctx.fillStyle = "#e8c547";
  ctx.strokeStyle = "#8a6a12";
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.arc(0, -0.14, 0.11, Math.PI, 0);
  ctx.stroke();
  ctx.fillRect(-0.14, -0.14, 0.28, 0.22);
  ctx.strokeRect(-0.14, -0.14, 0.28, 0.22);
  ctx.fillStyle = "#6a5438";
  ctx.beginPath();
  ctx.arc(0, -0.03, 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCageDoor(ctx: CanvasRenderingContext2D, maze: Maze): void {
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = Math.min(0.14, maze.config.wallWidth * 0.85);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(maze.cageDoor.a.x, maze.cageDoor.a.y);
  ctx.lineTo(maze.cageDoor.b.x, maze.cageDoor.b.y);
  ctx.stroke();
}

function drawKey(ctx: CanvasRenderingContext2D, p: Vec2, time: number): void {
  const bob = Math.sin(time * 3.2) * 0.08;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.fillStyle = "rgba(255, 220, 120, 0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8c547";
  ctx.strokeStyle = "#a67c12";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(-0.08, 0, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(0.02, -0.05, 0.22, 0.1);
  ctx.fillRect(0.16, -0.05, 0.06, 0.16);
  ctx.restore();
}

function drawHoleFlash(ctx: CanvasRenderingContext2D, p: Vec2, time: number): void {
  ctx.save();
  ctx.strokeStyle = `rgba(232, 140, 80, ${0.45 + Math.sin(time * 8) * 0.2})`;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function fitPeekScale(maze: Maze, viewW: number, viewH: number): { x: number; y: number; scale: number } {
  const pad = 1.35;
  const w = maze.outerR * 2 + pad * 2;
  const h = maze.outerR * 2 + pad * 2;
  const scale = Math.min(viewW / w, viewH / h) * 0.94;
  return { x: 0, y: 0, scale };
}
