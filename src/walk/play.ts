/**
 * Default playable maze. Continuous walk, not a node hop.
 * The picture is public/art/hunter.png until four RGBA walk sheets load.
 * That file is one pose. It is not tilted into a fake step.
 */
import { FLAG_URL, GRASS_URLS, HUNTER_URL, PATH_URLS } from "./art";
import { GOAL, MAZE_GRID, MAZE_ROWS, START } from "./maze";
import { createWalker, isWall, stepWalker, type Walker } from "./motion";
import { hunterRect, project, shouldCutaway, wallDepth, wallRect, walkerDepth } from "./occlusion";
import { cardinalFromFacing, type Cardinal } from "./paper-hunter";
import {
  HUNTER_BODY_SCALE,
  WALL_RAISE_SCALE,
  WALK_ANCHOR_X,
  WALK_ANCHOR_Y,
  WALK_FRAME_H,
  WALK_FRAME_W,
  WALK_FRAMES,
  WALK_SHEET_URLS,
  isRgbaPng,
  sheetFrame,
  sheetSizeOk,
} from "./walk-sheets";

type Img = HTMLImageElement;
type Box = { sx: number; sy: number; sw: number; sh: number };

const COLS = MAZE_ROWS[0]!.length;
const ROWS = MAZE_ROWS.length;

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "./";
  return (base.endsWith("/") ? base : `${base}/`) + path;
}

function loadImage(src: string): Promise<Img | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadRgbaSheet(src: string): Promise<Img | null> {
  if (!src.toLowerCase().split("?")[0]!.endsWith(".png")) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!isRgbaPng(bytes)) return null;
    const img = await loadImage(URL.createObjectURL(new Blob([bytes], { type: "image/png" })));
    if (!img || !sheetSizeOk(img.naturalWidth, img.naturalHeight)) return null;
    return img;
  } catch {
    return null;
  }
}

function opaqueBox(img: Img): Box {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width;
    let minY = c.height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const a = data[(y * c.width + x) * 4 + 3] ?? 0;
        if (a <= 16) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX > minX && maxY > minY) return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
  } catch {
    /* use the full frame */
  }
  return { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
}

function poly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], fill: string): void {
  const a = pts[0];
  if (!a) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

const KEYS: Record<string, string> = {
  ArrowUp: "n",
  ArrowDown: "s",
  ArrowLeft: "w",
  ArrowRight: "e",
  w: "n",
  a: "w",
  s: "s",
  d: "e",
  W: "n",
  A: "w",
  S: "s",
  D: "e",
};

export class WalkMode {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private status: HTMLElement;
  private win: HTMLElement;
  private walker = createWalker();
  private held = new Set<string>();
  private active = false;
  private last = 0;
  private hunter: Img | null = null;
  private hunterBox: Box | null = null;
  private sheets: Partial<Record<Cardinal, Img>> = {};
  private flag: Img | null = null;
  private paths: Img[] = [];
  private grass: Img[] = [];
  private flagBox: Box | null = null;
  private readySent = false;
  private cutaways = 0;

  constructor() {
    this.root = document.createElement("section");
    this.root.id = "walk-screen";
    this.root.className = "walk-screen";
    this.root.dataset.mode = "freewalk";
    this.canvas = document.createElement("canvas");
    this.canvas.id = "walk-canvas";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    this.ctx = ctx;
    this.status = document.createElement("p");
    this.win = document.createElement("div");
    this.build();
    document.querySelector("#app")?.appendChild(this.root);
    this.bind();
    void this.loadArt();
  }

  open(): void {
    this.active = true;
    document.body.classList.add("walk-mode");
    document.getElementById("title-screen")?.classList.add("hidden");
    this.root.classList.remove("hidden");
    this.resize();
    this.loop(performance.now());
  }

  restart(): void {
    this.walker = createWalker();
    this.win.classList.add("hidden");
    this.status.textContent = "沿走廊走到绿旗";
  }

  getState(): Walker & {
    cardinal: Cardinal;
    presentation: "walk-sheet" | "interim-single-pose";
    wallRaise: number;
    bodyScale: number;
    cutaways: number;
  } {
    const cardinal = cardinalFromFacing(this.walker.facing);
    return {
      ...this.walker,
      cardinal,
      presentation: this.sheets[cardinal] ? "walk-sheet" : "interim-single-pose",
      wallRaise: WALL_RAISE_SCALE,
      bodyScale: HUNTER_BODY_SCALE,
      cutaways: this.cutaways,
    };
  }

  private build(): void {
    const top = document.createElement("header");
    top.className = "walk-top";
    const title = document.createElement("div");
    title.className = "walk-title";
    title.textContent = "纸艺迷宫";
    this.status.id = "walk-status";
    this.status.textContent = "沿走廊走到绿旗";
    const restart = document.createElement("button");
    restart.type = "button";
    restart.id = "walk-restart";
    restart.className = "ghost";
    restart.textContent = "重开";
    restart.onclick = () => this.restart();
    top.append(title, this.status, restart);

    const stage = document.createElement("div");
    stage.className = "walk-stage";
    stage.appendChild(this.canvas);

    const hint = document.createElement("p");
    hint.className = "walk-hint";
    hint.id = "walk-limit";
    hint.textContent = "猎人是单张立绘。没有四向，也没有迈步。朝西只是镜像，不是行走动画。";

    const pad = document.createElement("div");
    pad.className = "walk-pad";
    pad.setAttribute("aria-label", "方向");
    for (const [id, label, dir] of [
      ["walk-pad-n", "上", "n"],
      ["walk-pad-w", "左", "w"],
      ["walk-pad-s", "下", "s"],
      ["walk-pad-e", "右", "e"],
    ] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.textContent = label;
      b.dataset.dir = dir;
      this.bindHold(b, dir);
      pad.appendChild(b);
    }

    this.win.id = "walk-win";
    this.win.className = "walk-win hidden";
    const msg = document.createElement("p");
    msg.textContent = "走到绿旗了";
    const again = document.createElement("button");
    again.type = "button";
    again.id = "walk-again";
    again.className = "primary";
    again.textContent = "再走一次";
    again.onclick = () => this.restart();
    this.win.append(msg, again);

    this.root.append(top, stage, hint, pad, this.win);
  }

  private bindHold(btn: HTMLButtonElement, dir: string): void {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this.held.add(dir);
    };
    const up = () => this.held.delete(dir);
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("lostpointercapture", up);
  }

  private bind(): void {
    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      const dir = KEYS[e.key];
      if (dir) {
        e.preventDefault();
        this.held.add(dir);
      }
      if (e.key === "r" || e.key === "R") this.restart();
    });
    window.addEventListener("keyup", (e) => {
      const dir = KEYS[e.key];
      if (dir) this.held.delete(dir);
    });
    window.addEventListener("blur", () => this.held.clear());
    window.addEventListener("resize", () => this.resize());
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.resize()).observe(this.canvas);
  }

  private async loadArt(): Promise<void> {
    const [hunter, flag, ...rest] = await Promise.all([
      loadImage(assetUrl(HUNTER_URL)),
      loadImage(assetUrl(FLAG_URL)),
      ...PATH_URLS.map((p) => loadImage(assetUrl(p))),
      ...GRASS_URLS.map((p) => loadImage(assetUrl(p))),
    ]);
    this.hunter = hunter;
    this.flag = flag;
    this.paths = rest.slice(0, PATH_URLS.length).filter((img): img is Img => !!img);
    this.grass = rest.slice(PATH_URLS.length).filter((img): img is Img => !!img);
    if (hunter) this.hunterBox = opaqueBox(hunter);
    if (flag) this.flagBox = opaqueBox(flag);
    await this.loadSheets();
    this.markReady();
  }

  private async loadSheets(): Promise<void> {
    const dirs = Object.keys(WALK_SHEET_URLS) as Cardinal[];
    await Promise.all(
      dirs.map(async (dir) => {
        const img = await loadRgbaSheet(assetUrl(WALK_SHEET_URLS[dir]));
        if (img) this.sheets[dir] = img;
      }),
    );
    const missing = dirs.filter((dir) => !this.sheets[dir]);
    const note = document.getElementById("walk-limit");
    if (note && missing.length === 0) note.textContent = "四向行走帧已接入。";
  }

  private markReady(): void {
    if (this.readySent) return;
    this.readySent = true;
    document.documentElement.dataset.freewalk = "ready";
    Object.assign(window, { __walkReady: true });
  }

  private stick(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.held.has("e")) x += 1;
    if (this.held.has("w")) x -= 1;
    if (this.held.has("s")) y += 1;
    if (this.held.has("n")) y -= 1;
    return { x, y };
  }

  private loop = (t: number): void => {
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
    this.last = t;
    if (this.active) {
      this.walker = stepWalker(this.walker, this.stick(), dt || 0);
      if (this.walker.won) {
        this.win.classList.remove("hidden");
        this.status.textContent = "走到绿旗了";
      }
      this.draw();
    }
    requestAnimationFrame(this.loop);
  };

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w < 2 || h < 2) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#e7d8c4";
    ctx.fillRect(0, 0, w, h);

    const padTop = 8;
    const padBottom = 8;
    const corners = [
      project(0, 0, 1, 0, 0),
      project(COLS, 0, 1, 0, 0),
      project(0, ROWS, 1, 0, 0),
      project(COLS, ROWS, 1, 0, 0),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of corners) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const availW = w * 0.88;
    const availH = (h - padTop - padBottom) * 0.78;
    const scale = Math.min(availW / bw, availH / (bh + WALL_RAISE_SCALE));
    const raise = WALL_RAISE_SCALE * scale;
    const ox = w / 2 - ((minX + maxX) / 2) * scale;
    const oy = padTop + raise + 10 - minY * scale;
    const at = (x: number, y: number) => project(x, y, scale, ox, oy);

    const footprint = [at(0.15, 0.15), at(COLS - 0.15, 0.15), at(COLS - 0.15, ROWS - 0.15), at(0.15, ROWS - 0.15)];
    const shadow = footprint.map((p) => ({ x: p.x + scale * 0.06, y: p.y + scale * 0.1 }));
    poly(ctx, shadow, "rgba(92, 64, 38, 0.16)");
    poly(ctx, footprint, "#e4cba6");

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isWall(MAZE_GRID, c, r)) continue;
        const pad = this.paths[(c * 3 + r) % Math.max(1, this.paths.length)] ?? this.paths[0];
        const center = at(c + 0.5, r + 0.5);
        if (pad) {
          const dw = scale * 1.22;
          const dh = dw * 0.52;
          ctx.drawImage(pad, center.x - dw / 2, center.y - dh / 2, dw, dh);
        }
        if (this.grass.length && ((c * 5 + r * 9) & 3) === 0 && !(c === START.c && r === START.r) && !(c === GOAL.c && r === GOAL.r)) {
          const g = this.grass[(c + r) % this.grass.length]!;
          const gh = scale * 0.42;
          const gw = gh * (g.naturalWidth / g.naturalHeight);
          ctx.drawImage(g, center.x - gw / 2, center.y - gh * 0.72, gw, gh);
        }
      }
    }

    const feet = at(this.walker.x, this.walker.y);
    const bodyH = HUNTER_BODY_SCALE * scale;
    const aspect = this.hunterBox ? this.hunterBox.sw / this.hunterBox.sh : 0.63;
    const body = hunterRect(feet.x, feet.y, bodyH * aspect, bodyH);
    const playerDepth = walkerDepth(this.walker.x, this.walker.y);
    const walls: { c: number; r: number; depth: number; cut: boolean }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isWall(MAZE_GRID, c, r)) continue;
        const depth = wallDepth(c, r);
        const box = wallRect(c, r, scale, ox, oy, raise);
        const pc = Math.floor(this.walker.x);
        const pr = Math.floor(this.walker.y);
        const near = Math.max(Math.abs(c - pc), Math.abs(r - pr)) <= 1;
        walls.push({ c, r, depth, cut: shouldCutaway(depth, playerDepth, box, body, near) });
      }
    }
    this.cutaways = walls.filter((cell) => cell.cut).length;
    const paint = (cell: { c: number; r: number }, alpha: number) => {
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.drawWall(cell.c, cell.r, scale, ox, oy, raise);
      this.ctx.restore();
    };
    const behind = walls.filter((cell) => cell.depth <= playerDepth).sort((a, b) => a.depth - b.depth);
    for (const cell of behind) paint(cell, 1);
    if (GOAL.x + GOAL.y < playerDepth) this.drawFlag(scale, ox, oy);
    this.drawHunter(feet.x, feet.y, bodyH);
    const front = walls.filter((cell) => cell.depth > playerDepth && !cell.cut).sort((a, b) => a.depth - b.depth);
    for (const cell of front) paint(cell, 1);
    if (GOAL.x + GOAL.y >= playerDepth) this.drawFlag(scale, ox, oy);
    const faded = walls.filter((cell) => cell.cut).sort((a, b) => a.depth - b.depth);
    for (const cell of faded) paint(cell, 0.32);
  }

  private drawWall(c: number, r: number, scale: number, ox: number, oy: number, lift: number): void {
    const ctx = this.ctx;
    const up = (x: number, y: number) => {
      const p = project(x, y, scale, ox, oy);
      return { x: p.x, y: p.y - lift };
    };
    const sw = project(c, r + 1, scale, ox, oy);
    const se = project(c + 1, r + 1, scale, ox, oy);
    const ne = project(c + 1, r, scale, ox, oy);
    const nw = project(c, r, scale, ox, oy);
    const variant = (c * 7 + r * 3) & 3;
    const left = ["#b4895e", "#a67c50", "#c19766", "#9a7048"][variant]!;
    const right = ["#8d6844", "#7a5738", "#9a734c", "#6e4c32"][variant]!;
    const top = ["#e0c49a", "#d7b88a", "#edd0a6", "#c9a56e"][variant]!;
    ctx.beginPath();
    ctx.ellipse(se.x + 2, se.y + scale * 0.06, scale * 0.34, scale * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(80, 52, 30, 0.18)";
    ctx.fill();
    poly(ctx, [sw, se, up(c + 1, r + 1), up(c, r + 1)], left);
    poly(ctx, [se, ne, up(c + 1, r), up(c + 1, r + 1)], right);
    poly(ctx, [up(c, r), up(c + 1, r), up(c + 1, r + 1), up(c, r + 1)], top);
    ctx.beginPath();
    ctx.moveTo(up(c, r).x, up(c, r).y);
    ctx.lineTo(up(c + 1, r).x, up(c + 1, r).y);
    ctx.lineTo(up(c + 1, r + 1).x, up(c + 1, r + 1).y);
    ctx.lineTo(up(c, r + 1).x, up(c, r + 1).y);
    ctx.closePath();
    ctx.strokeStyle = "rgba(92, 62, 36, 0.45)";
    ctx.lineWidth = Math.max(1, scale * 0.015);
    ctx.stroke();
    if (this.grass.length && ((c * 11 + r * 5) & 3) === 0) {
      const g = this.grass[(c * 2 + r) % this.grass.length]!;
      const topC = up(c + 0.5, r + 0.35);
      const gh = scale * 0.28;
      const gw = gh * (g.naturalWidth / g.naturalHeight);
      ctx.drawImage(g, topC.x - gw / 2, topC.y - gh * 0.8, gw, gh);
    }
    void nw;
  }

  private drawFlag(scale: number, ox: number, oy: number): void {
    const ctx = this.ctx;
    const p = project(GOAL.x + 0.08, GOAL.y - 0.02, scale, ox, oy);
    const img = this.flag;
    const box = this.flagBox;
    if (!img || !box) {
      ctx.fillStyle = "#6e8a62";
      ctx.fillRect(p.x, p.y - scale * 0.8, 3, scale * 0.8);
      return;
    }
    const fh = scale * 1.45;
    const fw = fh * (box.sw / box.sh);
    ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, p.x - fw * 0.28, p.y - fh, fw, fh);
  }

  /** Upright blit. No tilt and no hop. A loaded sheet supplies the step frames. */
  private drawHunter(feetX: number, feetY: number, bodyH: number): void {
    const ctx = this.ctx;
    const cardinal = cardinalFromFacing(this.walker.facing);
    const sheet = this.sheets[cardinal];
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(feetX, feetY + 2, bodyH * 0.22, bodyH * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(70, 48, 28, 0.28)";
    ctx.fill();
    if (sheet) {
      const px = bodyH / WALK_ANCHOR_Y;
      const frame = sheetFrame(this.walker.phase, this.walker.moving, WALK_FRAMES);
      ctx.drawImage(
        sheet,
        frame * WALK_FRAME_W,
        0,
        WALK_FRAME_W,
        WALK_FRAME_H,
        feetX - WALK_ANCHOR_X * px,
        feetY - WALK_ANCHOR_Y * px,
        WALK_FRAME_W * px,
        WALK_FRAME_H * px,
      );
      ctx.restore();
      return;
    }
    const img = this.hunter;
    const box = this.hunterBox;
    if (!img || !box) {
      ctx.restore();
      return;
    }
    const dw = bodyH * (box.sw / box.sh);
    if (cardinal === "W") {
      ctx.translate(feetX, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, -dw / 2, feetY - bodyH, dw, bodyH);
    } else {
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, feetX - dw / 2, feetY - bodyH, dw, bodyH);
    }
    ctx.restore();
  }
}
