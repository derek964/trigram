/**
 * Presentation shell for Hitman GO — isometric paper-craft diorama placeholders.
 *
 * Art hooks: character sprites + maze tiles (fog / wall-paper / grass-tuft).
 * Fog visibility rules stay in fog.ts — this file only paints. Logic stays in
 * graph space (x,y); this file only maps to screen.
 *
 * Camera: classic 2:1 isometric (¾ bird's-eye feel). Not pure top-down.
 */

import type { MazeBoard } from "./maze-grid";
import type { Facing } from "./vision";

export interface IsoLayout {
  /** World-units → screen pixels along the iso X axis half-tile. */
  scale: number;
  ox: number;
  oy: number;
  /** Platform radius in screen px (for pick hit tests). */
  nodeR: number;
}

/** Locked feedback hex — do not brighten. */
export const COLOR_ADJACENT = "#35504A";
export const COLOR_PREVIEW = "#314F5D";
export const COLOR_DANGER = "#7F3629";
/** Inactive light hexes (product unlocked dark; keep for flip-back). */
export const COLOR_ADJACENT_LIGHT = "#7BA89E";
export const COLOR_PREVIEW_LIGHT = "#5B8FA8";
export const COLOR_DANGER_LIGHT = "#C45C4A";
export const FLOOR = "#C9BBA8";

const ROAD_FILL = "#E6D9C4";
const ROAD_EDGE = "#B6A890";
const ROAD_SEAM = "#D2C4AE";
const INK = "#2A3A32";
const HUNTER = "#C45C4A";
const HUNTER_DARK = "#8E3A30";
const ANIMAL = "#E8B84A";
const ANIMAL_DARK = "#B8892A";
const POACHER = "#5B8FA8";
const POACHER_DARK = "#3A6078";
const CAGE = "#8A6A4A";

/** Graph (x,y) → isometric screen. y-down in graph ≈ south. */
export function isoProject(x: number, y: number, L: IsoLayout): { x: number; y: number } {
  // 2:1 isometric: screenX = (x - y) * s/2, screenY = (x + y) * s/4
  const s = L.scale;
  return {
    x: L.ox + (x - y) * (s * 0.5),
    y: L.oy + (x + y) * (s * 0.25),
  };
}

/** Fit graph bounds into canvas with isometric framing. */
export function computeIsoLayout(
  nodes: Iterable<{ x: number; y: number }>,
  canvasW: number,
  canvasH: number,
): IsoLayout {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of nodes) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) {
    return { scale: 80, ox: canvasW / 2, oy: canvasH / 2, nodeR: 22 };
  }
  const pad = 1.35;
  // Project four corners of the padded AABB to find screen bounds at scale=1
  const corners = [
    { x: minX - pad, y: minY - pad },
    { x: minX - pad, y: maxY + pad },
    { x: maxX + pad, y: minY - pad },
    { x: maxX + pad, y: maxY + pad },
  ];
  const unit = { scale: 1, ox: 0, oy: 0, nodeR: 1 };
  let sminX = Infinity,
    smaxX = -Infinity,
    sminY = Infinity,
    smaxY = -Infinity;
  for (const c of corners) {
    const s = isoProject(c.x, c.y, unit);
    sminX = Math.min(sminX, s.x);
    smaxX = Math.max(smaxX, s.x);
    sminY = Math.min(sminY, s.y);
    smaxY = Math.max(smaxY, s.y);
  }
  const bw = Math.max(0.1, smaxX - sminX);
  const bh = Math.max(0.1, smaxY - sminY);
  const scale = Math.min(canvasW / bw, canvasH / bh) * 0.88;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const mid = isoProject(cx, cy, { scale, ox: 0, oy: 0, nodeR: 1 });
  const nodeR = Math.max(18, scale * 0.28);
  return {
    scale,
    ox: canvasW / 2 - mid.x,
    oy: canvasH / 2 - mid.y + nodeR * 0.15,
    nodeR,
  };
}

export function pickIsoNode(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  dpr: number,
  L: IsoLayout,
  nodes: Record<string, { x: number; y: number }>,
): string | null {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * (canvas.width / dpr);
  const y = ((clientY - rect.top) / rect.height) * (canvas.height / dpr);
  // Ellipse-ish pick: horizontal radius larger under iso squash
  const rx = L.nodeR * 1.35;
  const ry = L.nodeR * 0.85;
  let best: string | null = null;
  let bestD = 1;
  for (const [id, p] of Object.entries(nodes)) {
    const s = isoProject(p.x, p.y, L);
    const dx = (s.x - x) / rx;
    const dy = (s.y - y) / ry;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

/** Soft paper floor wash (Art replaces with diorama sprite). */
export function drawFloor(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = FLOOR;
  ctx.fillRect(0, 0, w, h);
  // faint fold seams — paper feel, not grid
  ctx.strokeStyle = "rgba(138,126,108,0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = (h / 6) * (i + 0.5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(w * 0.5, y + (i % 2 ? 6 : -6), w, y);
    ctx.stroke();
  }
}

/**
 * Road between two nodes — wide paper strip with edge + center seam.
 * Orthogonal graph edges stay straight in iso space (look like roads, not CAD lines).
 * ART_HOOK: swap for textured path sprites / recessed grooves.
 */
export function drawRoad(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  L: IsoLayout,
): void {
  const sa = isoProject(a.x, a.y, L);
  const sb = isoProject(b.x, b.y, L);
  const dx = sb.x - sa.x;
  const dy = sb.y - sa.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const half = Math.max(7, L.scale * 0.09);

  // drop shadow
  ctx.beginPath();
  ctx.moveTo(sa.x + nx * half + 2, sa.y + ny * half + 3);
  ctx.lineTo(sb.x + nx * half + 2, sb.y + ny * half + 3);
  ctx.lineTo(sb.x - nx * half + 2, sb.y - ny * half + 3);
  ctx.lineTo(sa.x - nx * half + 2, sa.y - ny * half + 3);
  ctx.closePath();
  ctx.fillStyle = "rgba(42,58,50,0.18)";
  ctx.fill();

  // road body
  ctx.beginPath();
  ctx.moveTo(sa.x + nx * half, sa.y + ny * half);
  ctx.lineTo(sb.x + nx * half, sb.y + ny * half);
  ctx.lineTo(sb.x - nx * half, sb.y - ny * half);
  ctx.lineTo(sa.x - nx * half, sa.y - ny * half);
  ctx.closePath();
  ctx.fillStyle = ROAD_FILL;
  ctx.fill();
  ctx.strokeStyle = ROAD_EDGE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // center paper seam
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.strokeStyle = ROAD_SEAM;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Path marker platform — DISABLED for观感门禁.
 * White/cream discs read as CAD path dots; paper path tiles TBD from Art.
 * Keep export so go-ui call sites compile; optional ring/wash only if asked.
 */
export function drawPlatform(
  _ctx: CanvasRenderingContext2D,
  _x: number,
  _y: number,
  _r: number,
  _opts?: { ring?: string; wash?: string; washAlpha?: number },
): void {
  // no-op: do not paint white discs on corridor cells
}

/** Tiny label under platform — keep for debug readability. */
export function drawNodeLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  id: string,
): void {
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.55;
  ctx.font = `600 ${Math.max(10, r * 0.42)}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(id, x, y + r * 0.55);
  ctx.globalAlpha = 1;
}

/**
 * Safe camp prop — prefer thin flag PNG (no cream disc). Tent PNG is alt.
 * Never paint a ground ellipse / node-pad under the hunter (birth == camp).
 */
export function drawCamp(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const flag = tiles.campFlag;
  const tent = tiles.campTent;
  const img =
    flag && flag.complete && flag.naturalWidth > 0
      ? flag
      : tent && tent.complete && tent.naturalWidth > 0
        ? tent
        : null;
  if (img) {
    // Flag: tall thin pole; tent: wider. Sit BESIDE the node (not under feet).
    const tall = img === flag;
    const h = tall ? s * 2.4 : s * 1.6;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    const ox = tall ? s * 1.15 : s * 1.35;
    ctx.drawImage(img, x + ox - w / 2, y - h + s * 0.15, w, h);
    return;
  }
  // Minimal procedural fallback: pole + pennant only (no ground disc).
  ctx.beginPath();
  ctx.moveTo(x + s * 0.45, y + s * 0.05);
  ctx.lineTo(x + s * 0.45, y - s * 1.15);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.45, y - s * 1.15);
  ctx.lineTo(x + s * 0.95, y - s * 0.95);
  ctx.lineTo(x + s * 0.45, y - s * 0.8);
  ctx.closePath();
  ctx.fillStyle = COLOR_DANGER;
  ctx.fill();
}

/** Animal cage prop — barred crate (not a ring). ART_HOOK: cage sprite. */
export function drawCage(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const w = s * 0.9;
  const h = s * 0.7;
  ellipse(ctx, x + 1, y + h * 0.45, w * 0.5, s * 0.16);
  ctx.fillStyle = "rgba(42,58,50,0.22)";
  ctx.fill();
  // crate body
  roundRect(ctx, x - w / 2, y - h * 0.55, w, h, 3);
  ctx.fillStyle = CAGE;
  ctx.fill();
  ctx.strokeStyle = "#5A4028";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // bars
  ctx.strokeStyle = "#3A2818";
  ctx.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) {
    const bx = x + (i * w) / 5;
    ctx.beginPath();
    ctx.moveTo(bx, y - h * 0.45);
    ctx.lineTo(bx, y + h * 0.35);
    ctx.stroke();
  }
  // top rail
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h * 0.55);
  ctx.lineTo(x + w / 2, y - h * 0.55);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Hunter paper cutout — hat brim + coat + legs. Distinct at 50% scale.
 * ART_HOOK: blit hunter sprite sheet here.
 */
export function drawHunter(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  // shadow
  ellipse(ctx, 1, s * 0.12, s * 0.42, s * 0.14);
  ctx.fillStyle = "rgba(42,58,50,0.3)";
  ctx.fill();
  // legs
  ctx.fillStyle = HUNTER_DARK;
  roundRect(ctx, -s * 0.22, -s * 0.05, s * 0.16, s * 0.28, 2);
  roundRect(ctx, s * 0.06, -s * 0.05, s * 0.16, s * 0.28, 2);
  // boots
  ctx.fillStyle = INK;
  roundRect(ctx, -s * 0.24, s * 0.18, s * 0.2, s * 0.1, 2);
  roundRect(ctx, s * 0.04, s * 0.18, s * 0.2, s * 0.1, 2);
  // body / coat
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.75);
  ctx.lineTo(s * 0.38, -s * 0.15);
  ctx.lineTo(s * 0.28, s * 0.05);
  ctx.lineTo(-s * 0.28, s * 0.05);
  ctx.lineTo(-s * 0.38, -s * 0.15);
  ctx.closePath();
  ctx.fillStyle = HUNTER;
  ctx.fill();
  ctx.strokeStyle = HUNTER_DARK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // head
  ellipse(ctx, 0, -s * 0.85, s * 0.2, s * 0.22);
  ctx.fillStyle = "#F0D5B8";
  ctx.fill();
  // hat brim (hunter cue)
  ellipse(ctx, 0, -s * 1.0, s * 0.42, s * 0.1);
  ctx.fillStyle = HUNTER_DARK;
  ctx.fill();
  // hat crown
  roundRect(ctx, -s * 0.22, -s * 1.28, s * 0.44, s * 0.28, 3);
  ctx.fillStyle = HUNTER;
  ctx.fill();
  ctx.strokeStyle = HUNTER_DARK;
  ctx.lineWidth = 1;
  ctx.stroke();
  // staff / stick (right hand cue)
  ctx.beginPath();
  ctx.moveTo(s * 0.32, -s * 0.55);
  ctx.lineTo(s * 0.55, s * 0.2);
  ctx.strokeStyle = "#6B4A2A";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

/**
 * Rescued animal — round body + ear tufts (readable vs hunter/poacher).
 * ART_HOOK: animal paper pawn sprite.
 */
export function drawAnimal(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 1, s * 0.1, s * 0.38, s * 0.14);
  ctx.fillStyle = "rgba(42,58,50,0.28)";
  ctx.fill();
  // body
  ellipse(ctx, 0, -s * 0.15, s * 0.38, s * 0.32);
  ctx.fillStyle = ANIMAL;
  ctx.fill();
  ctx.strokeStyle = ANIMAL_DARK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // head
  ellipse(ctx, 0, -s * 0.55, s * 0.28, s * 0.26);
  ctx.fillStyle = ANIMAL;
  ctx.fill();
  ctx.stroke();
  // ears (identity cue)
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.12, -s * 0.7);
    ctx.lineTo(side * s * 0.28, -s * 1.05);
    ctx.lineTo(side * s * 0.02, -s * 0.78);
    ctx.closePath();
    ctx.fillStyle = ANIMAL_DARK;
    ctx.fill();
  }
  // eyes
  ctx.fillStyle = INK;
  ellipse(ctx, -s * 0.09, -s * 0.55, s * 0.04, s * 0.05);
  ctx.fill();
  ellipse(ctx, s * 0.09, -s * 0.55, s * 0.04, s * 0.05);
  ctx.fill();
  // snout
  ellipse(ctx, 0, -s * 0.42, s * 0.1, s * 0.07);
  ctx.fillStyle = "#FFF6E0";
  ctx.fill();
  ctx.restore();
}

/**
 * Poacher / patrol — hood + net pole (distinct from hunter hat).
 * ART_HOOK: poacher sprite.
 */
export function drawPoacher(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 1, s * 0.12, s * 0.4, s * 0.14);
  ctx.fillStyle = "rgba(42,58,50,0.3)";
  ctx.fill();
  // legs
  ctx.fillStyle = POACHER_DARK;
  roundRect(ctx, -s * 0.2, -s * 0.02, s * 0.14, s * 0.26, 2);
  roundRect(ctx, s * 0.06, -s * 0.02, s * 0.14, s * 0.26, 2);
  // body
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.7);
  ctx.lineTo(s * 0.34, -s * 0.1);
  ctx.lineTo(s * 0.26, s * 0.08);
  ctx.lineTo(-s * 0.26, s * 0.08);
  ctx.lineTo(-s * 0.34, -s * 0.1);
  ctx.closePath();
  ctx.fillStyle = POACHER;
  ctx.fill();
  ctx.strokeStyle = POACHER_DARK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // hood (identity cue — no brim hat)
  ctx.beginPath();
  ctx.arc(0, -s * 0.85, s * 0.28, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineTo(s * 0.18, -s * 0.55);
  ctx.lineTo(-s * 0.18, -s * 0.55);
  ctx.closePath();
  ctx.fillStyle = POACHER_DARK;
  ctx.fill();
  // face inset
  ellipse(ctx, 0, -s * 0.78, s * 0.14, s * 0.14);
  ctx.fillStyle = "#D4B89A";
  ctx.fill();
  // net pole / weapon cue
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.5);
  ctx.lineTo(-s * 0.55, -s * 1.15);
  ctx.strokeStyle = "#4A3820";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();
  // net hoop
  ctx.beginPath();
  ctx.ellipse(-s * 0.55, -s * 1.22, s * 0.18, s * 0.12, -0.4, 0, Math.PI * 2);
  ctx.strokeStyle = "#C9BBA8";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Depth sort key for isometric painter's algorithm (back → front). */
export function isoDepth(x: number, y: number): number {
  return x + y;
}

/* ---- Art sprite atlas (prefer keyed PNG; JPG paths kept as Art source) ---- */

export type SpriteKind = "hunter" | "poacher" | "rabbit";
export type TileKind = "fogUnexplored" | "fogExplored" | "nodePad" | "campFlag" | "campTent";

const SPRITE_URLS: Record<SpriteKind, string[]> = {
  // PNG only — JPG fallbacks have opaque cream pedestals baked in
  hunter: ["/art/hunter.png"],
  poacher: ["/art/poacher.png"],
  rabbit: ["/art/rabbit.png"],
};

/** Paper-art maze tiles — presentation only (fog logic stays in fog.ts). */
const TILE_URLS: Record<TileKind, string[]> = {
  fogUnexplored: ["/art/fog-unexplored.png"],
  fogExplored: ["/art/fog-explored.png"],
  nodePad: ["/art/node-pad.png"],
  campFlag: ["/art/camp-flag.png"], // product default: thin pole, no disc
  campTent: ["/art/camp-tent.png"], // alt prop
};

/** Transparent wall variants — hash-stable pick per cell. */
const WALL_VARIANT_URLS = [
  "/art/wall-paper.png",
  "/art/wall-paper-v1.png",
  "/art/wall-paper-v2.png",
  "/art/wall-paper-v3.png",
];

/** Kraft path pads — corridor / walkable floor (no white rings). */
const PATH_PAD_URLS = ["/art/path-pad.png", "/art/path-pad-v2.png"];

/** Grass tufts — denser v2 preferred, mix with v1. */
const GRASS_URLS = ["/art/grass-tuft-v2.png", "/art/grass-tuft.png"];

const sprites: Partial<Record<SpriteKind, HTMLImageElement>> = {};
const tiles: Partial<Record<TileKind, HTMLImageElement>> = {};
const wallVariants: HTMLImageElement[] = [];
const pathPadVariants: HTMLImageElement[] = [];
const grassVariants: HTMLImageElement[] = [];
let spritesLoading = false;
let spritesReady = false;
const readyWaiters: Array<() => void> = [];

function variantReady(list: HTMLImageElement[]): boolean {
  return list.some((img) => img.complete && (img.naturalWidth ?? 0) > 0);
}

function wallsReady(): boolean {
  return variantReady(wallVariants);
}

function pickVariant(list: HTMLImageElement[], gx: number, gy: number, a = 17, b = 31): HTMLImageElement | null {
  const ready = list.filter((img) => img.complete && img.naturalWidth > 0);
  if (!ready.length) return null;
  const idx = Math.abs(gx * a + gy * b) % ready.length;
  return ready[idx]!;
}

function notifyReady(): void {
  // Progressive redraw: each tile/character arrival re-paints the board.
  for (const w of [...readyWaiters]) w();
  const chars = !!(sprites.hunter && sprites.poacher && sprites.rabbit);
  const mazeTiles =
    tileReady("fogUnexplored") && tileReady("fogExplored") && wallsReady();
  const campReady = tileReady("campFlag") || tileReady("campTent");
  spritesReady = chars;
  // Keep waiters until camp marker loads — else flag never triggers a redraw pass
  // after chars/fog/walls already cleared the queue.
  if (chars && mazeTiles && campReady) readyWaiters.length = 0;
}

function tryLoad(kind: SpriteKind, urls: string[], i: number): void {
  if (i >= urls.length) return;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    sprites[kind] = img;
    notifyReady();
  };
  img.onerror = () => tryLoad(kind, urls, i + 1);
  img.src = urls[i]!;
}

function tryLoadTile(kind: TileKind, urls: string[], i: number): void {
  if (i >= urls.length) return;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    tiles[kind] = img;
    notifyReady();
  };
  img.onerror = () => tryLoadTile(kind, urls, i + 1);
  img.src = urls[i]!;
}

function tryLoadVariant(list: HTMLImageElement[], url: string): void {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    if (img.naturalWidth > 0) list.push(img);
    notifyReady();
  };
  img.onerror = () => notifyReady();
  img.src = url;
}

function tileReady(kind: TileKind): boolean {
  const img = tiles[kind];
  return !!img?.complete && (img.naturalWidth ?? 0) > 0;
}

/** Hash-stable wall sprite for cell (gx,gy). */
function wallSpriteForCell(gx: number, gy: number): HTMLImageElement | null {
  return pickVariant(wallVariants, gx, gy);
}

/** Kick off sprite + tile loads once; call redraw when ready. */
export function ensureSprites(onReady?: () => void): void {
  if (spritesReady && tileReady("fogUnexplored") && wallsReady()) {
    onReady?.();
    return;
  }
  if (onReady) readyWaiters.push(onReady);
  if (spritesLoading) return;
  spritesLoading = true;
  (Object.keys(SPRITE_URLS) as SpriteKind[]).forEach((k) => tryLoad(k, SPRITE_URLS[k], 0));
  (Object.keys(TILE_URLS) as TileKind[]).forEach((k) => tryLoadTile(k, TILE_URLS[k], 0));
  WALL_VARIANT_URLS.forEach((url) => tryLoadVariant(wallVariants, url));
  PATH_PAD_URLS.forEach((url) => tryLoadVariant(pathPadVariants, url));
  GRASS_URLS.forEach((url) => tryLoadVariant(grassVariants, url));
}

export function spriteReady(kind: SpriteKind): boolean {
  return !!sprites[kind]?.complete && (sprites[kind]!.naturalWidth ?? 0) > 0;
}

/**
 * Draw art sprite anchored bottom-center at (x,y).
 * Art v0.3.7: per-facing ~4-frame walk sheets later; until then single PNG + hop lerp.
 * Facing change = 1-frame snap (W/N horizontal flip; E/S unflipped). Idle later.
 * Canvas target for new sheets: 256×256. Keep ¾ soft-iso diorama — no top-down line maze.
 */
const spriteBBox: Partial<Record<SpriteKind, { sx: number; sy: number; sw: number; sh: number }>> = {};

function contentBBox(kind: SpriteKind, img: HTMLImageElement): { sx: number; sy: number; sw: number; sh: number } {
  const hit = spriteBBox[kind];
  if (hit) return hit;
  // Prefer full frame when already tight; known hunter sheet has bottom pad.
  // Scan once on first draw (offscreen canvas) for opaque bounds.
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    if (g) {
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const a = data[(y * c.width + x) * 4 + 3] ?? 0;
          if (a > 12) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX > minX && maxY > minY) {
        const box = { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
        spriteBBox[kind] = box;
        return box;
      }
    }
  } catch {
    /* ignore — fall through */
  }
  const box = { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
  spriteBBox[kind] = box;
  return box;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  kind: SpriteKind,
  x: number,
  y: number,
  displayH: number,
  facing: Facing = "S",
): void {
  const flip = facing === "W" || facing === "N";
  const img = sprites[kind];
  if (img && img.complete && img.naturalWidth > 0) {
    const box = contentBBox(kind, img);
    const h = Math.max(96, Math.min(160, displayH));
    const w = (box.sw / box.sh) * h;
    ctx.save();
    // no contact ellipse — JPG cream pedestals removed; blit opaque bounds only
    if (flip) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, -w / 2, y - h, w, h);
    } else {
      ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, x - w / 2, y - h, w, h);
    }
    ctx.restore();
    return;
  }
  // silhouette fallback until art loads — same facing flip
  const s = Math.max(28, displayH * 0.28);
  ctx.save();
  if (flip) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    x = 0;
  }
  if (kind === "hunter") drawHunter(ctx, x, y - s * 0.15, s);
  else if (kind === "poacher") drawPoacher(ctx, x, y - s * 0.15, s);
  else drawAnimal(ctx, x, y - s * 0.1, s);
  ctx.restore();
}

/**
 * Three-color overlay on sand floor #C9BBA8.
 * Hex LOCKED — only stroke weight + opacity may change for ≥~4.5:1 readability.
 * Adjacent #35504A · Preview #314F5D · Danger #7F3629 (Art dark; product unlocked)
 */
export function drawFeedbackRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nodeR: number,
  kind: "adjacent" | "preview" | "danger",
): void {
  // Art dark variants (product unlocked) — prefer thick opaque strokes over muddy washes.
  const color =
    kind === "danger" ? COLOR_DANGER : kind === "preview" ? COLOR_PREVIEW : COLOR_ADJACENT;
  const rx = nodeR * 1.35;
  const ry = nodeR * 0.78;
  // Soft contrast hairline (weakened — no cream/white disc read on adjacent)
  ctx.beginPath();
  ctx.ellipse(x, y, rx + 10, ry + 7, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(42,58,50,0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Thick opaque outer ring — primary readability
  ctx.beginPath();
  ctx.ellipse(x, y, rx + 7, ry + 5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 9; // adjacent / preview / danger — thick opaque for ≥4.5:1 on sand
  ctx.stroke();
  // Inner opaque rim (double-stroke, no translucent fill wash)
  ctx.beginPath();
  ctx.ellipse(x, y, rx + 1.5, ry + 0.5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  // Tiny opaque disc core so empty platforms still read the cue
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(4, nodeR * 0.28), Math.max(2.5, nodeR * 0.16), 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ---- Maze-grid board (corridor floors + solid wall blocks) ---- */

const WALL_TOP = "#6B7A5E";
const WALL_TOP_ALT = "#5A6B52";
const WALL_SIDE = "#3F4A38";
const WALL_EDGE = "#2A3326";
const BUSH_TOP = "#5C6E48";
const STONE_TOP = "#7A7268";
const CORRIDOR = "#BF9B72"; // kraft — never cream #E8DCC8 (reads as pedestal)
const CORRIDOR_EDGE = "#B6A890";
const CORRIDOR_SEAM = "#D2C4AE";

function isoDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - hh);
  ctx.lineTo(x + hw, y);
  ctx.lineTo(x, y + hh);
  ctx.lineTo(x - hw, y);
  ctx.closePath();
}

/**
 * Flat corridor tile — kraft path-pad (v1/v2 hash); procedural fallback.
 * When `flat` is true (character standing here), skip the oval path-pad blit —
 * product lock: no cream/kraft disc under hunter feet (birth==camp).
 */
export function drawCorridorFloor(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  L: IsoLayout,
  flat = false,
): void {
  const s = isoProject(gx, gy, L);
  const hw = L.scale * 0.48;
  const hh = L.scale * 0.24;

  if (flat) {
    // Connected floor without oval pedestal silhouette
    isoDiamond(ctx, s.x, s.y, hw, hh);
    ctx.fillStyle = CORRIDOR;
    ctx.fill();
    return;
  }

  // soft drop under pad
  isoDiamond(ctx, s.x + 1.5, s.y + 2.5, hw, hh);
  ctx.fillStyle = "rgba(42,58,50,0.14)";
  ctx.fill();

  const pad = pickVariant(pathPadVariants, gx, gy, 19, 29);
  if (pad) {
    const w = L.scale;
    const h = L.scale * 0.5;
    ctx.drawImage(pad, s.x - w / 2, s.y - h / 2, w, h);
    return;
  }

  // Procedural fallback pre-art / load miss
  isoDiamond(ctx, s.x, s.y, hw, hh);
  ctx.fillStyle = CORRIDOR;
  ctx.fill();
  ctx.strokeStyle = CORRIDOR_EDGE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s.x - hw * 0.55, s.y);
  ctx.lineTo(s.x + hw * 0.55, s.y);
  ctx.moveTo(s.x, s.y - hh * 0.55);
  ctx.lineTo(s.x, s.y + hh * 0.55);
  ctx.strokeStyle = CORRIDOR_SEAM;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Node pad under birth / cage / camp / character feet.
 * Screen-anchored; kraft diamond, no white ring.
 */
export function drawNodePad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  L: IsoLayout,
): void {
  const img = tiles.nodePad;
  if (img && img.complete && img.naturalWidth > 0) {
    const w = L.scale * 1.05;
    const h = L.scale * 0.52;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    return;
  }
  // faint kraft ellipse fallback
  ctx.beginPath();
  ctx.ellipse(x, y, L.nodeR * 1.1, L.nodeR * 0.58, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(166,140,100,0.45)";
  ctx.fill();
}

/**
 * Raised paper wall / bush / stone block — must read as solid obstacle.
 * Raised papercraft wall — transparent wall-paper (+v1/v2/v3) hash per cell;
 * procedural block remains as silhouette fallback.
 */
export function drawWallBlock(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  L: IsoLayout,
): void {
  const s = isoProject(gx, gy, L);
  const hw = L.scale * 0.46;
  const hh = L.scale * 0.23;
  const thick = Math.max(10, L.scale * 0.38);

  // Soft ground shadow (always — sprite has its own but needs contact cue)
  isoDiamond(ctx, s.x + 2, s.y + thick * 0.55 + 3, hw * 1.02, hh * 1.02);
  ctx.fillStyle = "rgba(42,58,50,0.28)";
  ctx.fill();

  const img = wallSpriteForCell(gx, gy);
  if (img) {
    // scale = diamond width; sprite covers ~1 cell footprint, taller for ¾ stack
    const destW = L.scale * 1.12;
    const destH = (img.naturalHeight / img.naturalWidth) * destW;
    // Anchor near cell center / front of iso diamond so walls sit on sand
    const ax = s.x;
    const ay = s.y + hh * 0.55;
    ctx.drawImage(img, ax - destW / 2, ay - destH, destW, destH);
    return;
  }

  // Procedural fallback (pre-art / load miss)
  const variant = (gx * 17 + gy * 31) & 3;
  const top =
    variant === 0 ? BUSH_TOP : variant === 1 ? STONE_TOP : variant === 2 ? WALL_TOP_ALT : WALL_TOP;

  ctx.beginPath();
  ctx.moveTo(s.x - hw, s.y);
  ctx.lineTo(s.x - hw, s.y + thick);
  ctx.lineTo(s.x, s.y + hh + thick);
  ctx.lineTo(s.x, s.y + hh);
  ctx.closePath();
  ctx.fillStyle = WALL_SIDE;
  ctx.fill();
  ctx.strokeStyle = WALL_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s.x + hw, s.y);
  ctx.lineTo(s.x + hw, s.y + thick);
  ctx.lineTo(s.x, s.y + hh + thick);
  ctx.lineTo(s.x, s.y + hh);
  ctx.closePath();
  ctx.fillStyle = "#354032";
  ctx.fill();
  ctx.strokeStyle = WALL_EDGE;
  ctx.stroke();

  isoDiamond(ctx, s.x, s.y, hw, hh);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.strokeStyle = WALL_EDGE;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

export type FogPaint = {
  /** Floor node ids currently visible. */
  visibleFloors: ReadonlySet<string>;
  /** Explored floor node ids (memory). */
  exploredFloors: ReadonlySet<string>;
  /** Visible wall lattice keys "x,y". */
  visibleWalls: ReadonlySet<string>;
  /** Explored wall lattice keys. */
  exploredWalls: ReadonlySet<string>;
};

function wallKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

function drawExploredWallGhost(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  L: IsoLayout,
): void {
  const s = isoProject(gx, gy, L);
  // Explored outline must read (观感门禁) — tile + guaranteed stroke
  drawExploredOutline(ctx, s.x, s.y, L);
}

/** Iso fog blit: width=scale, height=scale/2. Diamond PNGs — no hard clip. */
function blitFogTile(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  L: IsoLayout,
  kind: "fogUnexplored" | "fogExplored",
  alpha = 1,
): boolean {
  const img = tiles[kind];
  if (!img || !img.complete || img.naturalWidth <= 0) return false;
  const w = L.scale; // diamond width
  const h = L.scale * 0.5; // 2:1 iso height
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, sx - w / 2, sy - h / 2, w, h);
  ctx.restore();
  return true;
}

/** Explored-but-not-visible: fog-explored tile + readable diamond rim. */
function drawExploredOutline(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  L: IsoLayout,
): void {
  const hw = L.scale * 0.48;
  const hh = L.scale * 0.24;
  // Soft memory wash so sand still reads under the outline
  isoDiamond(ctx, sx, sy, hw, hh);
  ctx.fillStyle = "rgba(42,58,50,0.18)";
  ctx.fill();
  blitFogTile(ctx, sx, sy, L, "fogExplored", 1);
  // Guaranteed rim — tile alpha alone can be too faint on sand
  isoDiamond(ctx, sx, sy, hw, hh);
  ctx.strokeStyle = "rgba(42,58,50,0.55)";
  ctx.lineWidth = Math.max(1.5, L.scale * 0.03);
  ctx.stroke();
}

function drawFogCell(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  L: IsoLayout,
): void {
  const s = isoProject(gx, gy, L);
  if (blitFogTile(ctx, s.x, s.y, L, "fogUnexplored", 1)) return;
  const hw = L.scale * 0.5;
  const hh = L.scale * 0.25;
  isoDiamond(ctx, s.x, s.y, hw, hh);
  ctx.fillStyle = "rgba(8,10,12,0.92)";
  ctx.fill();
}

/** Decor grass near walls — denser; v2/v1 mix; no collision. */
function drawGrassTuft(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  L: IsoLayout,
): void {
  const img = pickVariant(grassVariants, gx, gy, 13, 37);
  if (!img) return;
  const s = isoProject(gx, gy, L);
  const destH = Math.max(20, L.scale * 0.48);
  const destW = (img.naturalWidth / img.naturalHeight) * destH;
  // Slight hash jitter so tufts don't lock to dead center
  const jx = (((gx * 13 + gy * 7) & 7) - 3) * (L.scale * 0.025);
  const jy = (((gx * 5 + gy * 11) & 7) - 3) * (L.scale * 0.012);
  ctx.drawImage(img, s.x - destW / 2 + jx, s.y - destH * 0.82 + jy, destW, destH);
}

function shouldPlaceGrass(gx: number, gy: number, wallKeys: Set<string>): boolean {
  const near =
    wallKeys.has(wallKey(gx + 1, gy)) ||
    wallKeys.has(wallKey(gx - 1, gy)) ||
    wallKeys.has(wallKey(gx, gy + 1)) ||
    wallKeys.has(wallKey(gx, gy - 1)) ||
    wallKeys.has(wallKey(gx + 1, gy + 1)) ||
    wallKeys.has(wallKey(gx - 1, gy - 1)) ||
    wallKeys.has(wallKey(gx + 1, gy - 1)) ||
    wallKeys.has(wallKey(gx - 1, gy + 1));
  if (!near) return ((gx * 17 + gy * 31) & 15) === 0; // rare mid-corridor sprinkle
  return ((gx * 17 + gy * 31) & 7) < 5; // ~62% of near-wall floors
}

/**
 * Paint full maze board back→front with optional exploration fog.
 * Unexplored → deep fog; explored-not-visible walls → faint outline; visible → full art.
 */
export function drawMazeBoard(
  ctx: CanvasRenderingContext2D,
  board: MazeBoard,
  L: IsoLayout,
  fog?: FogPaint | null,
  /** Node ids whose floor must not show oval path-pad (player / enemies). */
  noPadNodes?: ReadonlySet<string> | null,
): void {
  const wallKeys = new Set<string>();
  for (const c of board.cells) {
    if (c.kind === "wall") wallKeys.add(wallKey(c.gx, c.gy));
  }
  const sorted = [...board.cells].sort((a, b) => {
    const da = isoDepth(a.gx, a.gy);
    const db = isoDepth(b.gx, b.gy);
    if (da !== db) return da - db;
    if (a.kind !== b.kind) return a.kind === "floor" ? -1 : 1;
    return 0;
  });
  for (const c of sorted) {
    if (!fog) {
      if (c.kind === "floor") {
        drawCorridorFloor(ctx, c.gx, c.gy, L, !!(noPadNodes && c.nodeId && noPadNodes.has(c.nodeId)));
        if (shouldPlaceGrass(c.gx, c.gy, wallKeys)) drawGrassTuft(ctx, c.gx, c.gy, L);
      } else drawWallBlock(ctx, c.gx, c.gy, L);
      continue;
    }
    if (c.kind === "floor") {
      const id = c.nodeId ?? wallKey(c.gx, c.gy);
      if (fog.visibleFloors.has(id)) {
        drawCorridorFloor(ctx, c.gx, c.gy, L, !!(noPadNodes && c.nodeId && noPadNodes.has(c.nodeId)));
        if (shouldPlaceGrass(c.gx, c.gy, wallKeys)) drawGrassTuft(ctx, c.gx, c.gy, L);
      } else if (fog.exploredFloors.has(id)) {
        drawCorridorFloor(ctx, c.gx, c.gy, L, !!(noPadNodes && c.nodeId && noPadNodes.has(c.nodeId)));
        const s = isoProject(c.gx, c.gy, L);
        drawExploredOutline(ctx, s.x, s.y, L);
      } else {
        drawFogCell(ctx, c.gx, c.gy, L);
      }
    } else {
      const wk = wallKey(c.gx, c.gy);
      if (fog.visibleWalls.has(wk)) drawWallBlock(ctx, c.gx, c.gy, L);
      else if (fog.exploredWalls.has(wk)) drawExploredWallGhost(ctx, c.gx, c.gy, L);
      else drawFogCell(ctx, c.gx, c.gy, L);
    }
  }
}
