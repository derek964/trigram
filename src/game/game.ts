import { track } from "../analytics";
import { LEGAL, type LegalKind } from "../legal";
import { playSfx, rumble, unlockAudio, VIBE } from "./audio";
import { makeChaser, updateChaser, type Chaser } from "./chaser";
import { CHAPTER_NAMES, LEVELS, PLAYER_RADIUS, SPEED, playVisionRadius, usesVisionDisc, type LevelConfig } from "./levels";
import {
  createFeedback,
  currentPhase,
  currentHops,
  feedbackPath,
  markCell,
  setHasKey,
  type Feedback,
} from "./feedback";
import {
  cellAt,
  cellPathFrom,
  collideMove,
  generateMaze,
  inPlayableFloor,
  punchHole,
  shortestPath,
  type Maze,
} from "./maze";
import { clamp, dist, lerp, type Vec2 } from "./math";
import { loadProgress, markCleared, saveProgress, type Progress } from "./progress";
import { emitClear, emitDeath } from "./ads";
import { showInterstitial, showRewardedVideo, type RewardedScene } from "./ad-service";
import { drawWorld, fitPeekScale, type Camera, type Player } from "./render";
import { UI_BUTTON_IDS, type UiButtonId } from "./ui-buttons";

type Screen = "title" | "play" | "win" | "fail" | "ad" | "replay";
type AdKind = "peek" | "heart" | "revive";

interface UndoSnap {
  x: number;
  y: number;
  facing: number;
  trail: number[];
  visited: number[];
  lastCell: number;
  steps: number;
  cellId: number;
  lastHops: number;
  lastValue: number;
}

const STICK_R = 52;
const LEVEL_COUNT = 30;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private maze!: Maze;
  private player: Player = { x: 0, y: 0, facing: -Math.PI / 2 };
  private chaser: Chaser | null = null;
  private cam: Camera = { x: 0, y: 0, scale: 56 };
  private keys = new Set<string>();
  private pointer = { active: false, ox: 0, oy: 0, x: 0, y: 0, t0: 0 };
  private levelId = 1;
  private steps = 0;
  private stepAcc = 0;
  private playTime = 0;
  private peeksLeft = 3;
  private hearts = 3;
  private hasKey = false;
  private peeking = false;
  private peekT = 0;
  private time = 0;
  private screen: Screen = "title";
  private progress: Progress;
  private toastTimer = 0;
  private adWatching = false;
  private adT = 0;
  private adKind: AdKind = "peek";
  private lastTs = 0;
  private dpr = 1;
  private shotMode: string | null = null;
  private stuckT = 0;
  private lastCell = -1;
  private bestGoal = Infinity;
  private holeFlash: Vec2 | null = null;
  private holeFlashT = 0;
  private lastBump = 0;
  private peekGuard = 0;
  private tipCooldown = false;
  private escorting = false;
  private escortPath: Vec2[] | null = null;
  private escortI = 0;
  private escortT = 0;
  private animalPos: Vec2 | null = null;
  private animalFacing = Math.PI / 2;
  private feedback!: Feedback;
  private deadT = 0;
  private proxPulse = 0;
  private trailMood = 0;
  private trailPulse = 0;
  private autoRoute: { x: number; y: number }[] | null = null;
  private autoI = 0;
  private preview: { pts: { x: number; y: number }[]; ok: boolean } | null = null;
  private previewT = 0;
  private undoSnap: UndoSnap | null = null;
  private recentCells: number[] = [];
  private loopT = 0;
  private peekSeen = false;
  private particles: { x: number; y: number; vx: number; vy: number; r: number; life: number }[] = [];
  private clearPulse = 0;
  private cueT = 0;
  private fingerT = 0;
  private fingerTarget: { x: number; y: number } | null = null;
  private hugT = 0;
  private replayPts: { x: number; y: number }[] = [];
  private replayT = 0;
  private failKind: "thief" | "almost" = "almost";
  private lastMoveTrack = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas");
    this.ctx = ctx;
    this.progress = loadProgress();
    this.bindUi();
    this.bindInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.shotMode = new URLSearchParams(location.search).get("shot");
    this.renderTitleArt();
    if (this.shotMode) {
      const lv = Number(new URLSearchParams(location.search).get("level") ?? "1");
      this.startLevel(clamp(Math.floor(lv), 1, LEVEL_COUNT), true);
    }
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  private bindUi(): void {
    this.onUi("btn-start", () => this.startLevel(1, false));
    this.onUi("btn-continue", () => this.startLevel(this.progress.current, false));
    this.onUi("btn-restart", () => this.startLevel(this.levelId, false, true));
    this.onUi("btn-peek", () => this.onPeek());
    this.onUi("btn-next", () => {
      if (this.levelId >= LEVEL_COUNT) this.goTitle();
      else this.startLevel(this.levelId + 1, false);
    });
    this.onUi("btn-win-home", () => this.goTitle());
    this.onUi("btn-fail-home", () => this.goTitle());
    this.onUi("btn-fail-retry", () => this.startLevel(this.levelId, false, true));
    this.onUi("btn-fail-ad", () => this.openAd("revive"));
    this.onUi("btn-watch-ad", () => {
      void this.watchAd();
    });
    this.onUi("btn-ad-cancel", () => this.closeAd());
    this.onUi("btn-ad-done", () => this.finishAd());
    this.onUi("btn-sfx", () => this.toggleSfx(), { sfx: false, vibe: false });
    this.onUi("btn-vib", () => this.toggleVib(), { sfx: false, vibe: false });
    this.onUi("btn-tip-ok", () => this.dismissTip());
    this.onUi("btn-undo", () => this.undoMove());
    this.onUi("btn-privacy", () => this.openLegal("privacy"));
    this.onUi("btn-terms", () => this.openLegal("terms"));
    this.onUi("btn-age", () => this.openLegal("age"));
    this.onUi("btn-legal-close", () => this.closeLegal());
    for (const id of UI_BUTTON_IDS) {
      if (!this.uiHandlers[id]) throw new Error(`missing click handler for #${id}`);
    }
    qs("#hud").addEventListener("pointerdown", (e) => e.stopPropagation());
    qs("#btn-peek").addEventListener("pointerdown", (e) => e.stopPropagation());
    this.syncToggles();
    this.buildLevelRow();
  }

  /** Public so tests can assert every HUD control is wired. */
  readonly uiHandlers: Partial<Record<UiButtonId, () => void>> = {};

  private onUi(
    id: UiButtonId,
    fn: () => void,
    opts: { sfx?: boolean; vibe?: boolean } = {},
  ): void {
    const run = () => {
      unlockAudio();
      if (opts.sfx !== false) playSfx("ui", this.progress.sfx);
      if (opts.vibe !== false) rumble(this.progress.vib, VIBE.ui);
      fn();
    };
    this.uiHandlers[id] = run;
    qs(`#${id}`).onclick = run;
  }

  private buildLevelRow(): void {
    const row = qs("#level-row");
    row.innerHTML = "";
    for (let ch = 1; ch <= 3; ch++) {
      const lab = document.createElement("div");
      lab.className = "chapter-lab";
      const ranges = ["L1–10", "L11–20", "L21–30"];
      lab.textContent = `${CHAPTER_NAMES[ch - 1]} ${ranges[ch - 1]}`;
      row.appendChild(lab);
      const grid = document.createElement("div");
      grid.className = "level-grid";
      for (const lv of LEVELS.filter((l) => l.chapter === ch)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "level-dot";
        b.textContent = String(lv.id);
        if ((this.progress.bestStars[lv.id - 1] ?? 0) > 0) b.classList.add("done");
        if (lv.id === this.progress.current) b.classList.add("current");
        b.onclick = () => {
          unlockAudio();
          playSfx("ui", this.progress.sfx);
          rumble(this.progress.vib, VIBE.ui);
          this.startLevel(lv.id, false);
        };
        grid.appendChild(b);
      }
      row.appendChild(grid);
    }
    const cont = qs("#btn-continue");
    if (this.progress.unlocked > 1 || (this.progress.bestStars[0] ?? 0) > 0) {
      cont.classList.remove("hidden");
      cont.textContent = `继续救援 · 第${this.progress.current}关`;
    } else cont.classList.add("hidden");
  }

  private bindInput(): void {
    const el = this.canvas;
    el.addEventListener("pointerdown", (e) => {
      if (this.screen !== "play") return;
      if (this.peeking) {
        if (performance.now() < this.peekGuard) return;
        this.peeking = false;
        qs("#peek-badge").classList.add("hidden");
        return;
      }
      el.setPointerCapture(e.pointerId);
      this.pointer = { active: true, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
      this.hideFinger();
      unlockAudio();
      this.showStick(true);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.pointer.active) return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.placeStick();
    });
    const end = (e: PointerEvent) => {
      if (!this.pointer.active) return;
      const dt = performance.now() - this.pointer.t0;
      const moved = Math.hypot(this.pointer.x - this.pointer.ox, this.pointer.y - this.pointer.oy);
      this.pointer.active = false;
      this.showStick(false);
      if (moved < 14 && dt < 320 && this.screen === "play" && !this.peeking) {
        this.tryTap(e.clientX, e.clientY);
      }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", () => {
      this.pointer.active = false;
      this.showStick(false);
    });

    window.addEventListener("keydown", (e) => {
      const map: Record<string, string> = {
        ArrowUp: "w",
        ArrowDown: "s",
        ArrowLeft: "a",
        ArrowRight: "d",
        w: "w",
        a: "a",
        s: "s",
        d: "d",
        W: "w",
        A: "a",
        S: "s",
        D: "d",
      };
      const k = map[e.key];
      if (k) {
        e.preventDefault();
        this.keys.add(k);
        this.hideFinger();
      }
      if (e.key === "r" || e.key === "R") this.startLevel(this.levelId, false, true);
      if (e.key === "g" || e.key === "G") this.onPeek();
    });
    window.addEventListener("keyup", (e) => {
      const map: Record<string, string> = {
        ArrowUp: "w",
        ArrowDown: "s",
        ArrowLeft: "a",
        ArrowRight: "d",
        w: "w",
        a: "a",
        s: "s",
        d: "d",
        W: "w",
        A: "a",
        S: "s",
        D: "d",
      };
      const k = map[e.key];
      if (k) this.keys.delete(k);
    });
  }

  startLevel(id: number, fromShot: boolean, retry = false): void {
    const cfg: LevelConfig = LEVELS[id - 1] ?? LEVELS[0]!;
    this.levelId = cfg.id;
    this.maze = generateMaze(cfg);
    this.player = { x: this.maze.start.x, y: this.maze.start.y, facing: -Math.PI / 2 };
    this.chaser = cfg.hasChaser ? makeChaser(this.maze) : null;
    this.steps = 0;
    this.stepAcc = 0;
    this.playTime = 0;
    this.peeksLeft = cfg.peeks;
    this.hearts = cfg.hearts;
    this.hasKey = !cfg.needsKey;
    this.maze.locked = cfg.needsKey;
    this.escorting = false;
    this.escortPath = null;
    this.escortI = 0;
    this.escortT = 0;
    this.animalPos = null;
    this.animalFacing = Math.PI / 2;
    this.peeking = false;
    this.peekT = 0;
    this.stuckT = 0;
    this.tipCooldown = false;
    this.lastCell = cellAt(this.maze, this.player);
    this.bestGoal = dist(this.player, { x: 0, y: 0 });
    this.feedback = createFeedback(this.maze, this.hasKey);
    this.deadT = 0;
    this.proxPulse = 0;
    this.trailMood = 0;
    this.trailPulse = 0;
    this.autoRoute = null;
    this.autoI = 0;
    this.preview = null;
    this.previewT = 0;
    this.undoSnap = null;
    this.recentCells = [this.lastCell];
    this.loopT = 0;
    this.peekSeen = false;
    this.particles = [];
    this.clearPulse = 0;
    this.cueT = 0;
    this.hugT = 0;
    this.replayT = 0;
    this.replayPts = [];
    this.hideFinger();
    qs("#dead-banner").classList.add("hidden");
    qs("#micro-cue").classList.add("hidden");
    this.screen = "play";
    this.progress.current = id;
    saveProgress(this.progress);
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.cam.scale = this.playScale();

    if (fromShot && (this.shotMode === "walk" || this.shotMode === "hud")) {
      this.paintFeedbackTrail(false, 3);
    }
    if (fromShot && this.shotMode === "path") {
      this.showShotPathPreview();
    }
    if (fromShot && (this.shotMode === "peek" || this.shotMode === "key" || this.shotMode === "chaser")) {
      this.peeking = true;
      this.peekT = 99;
      qs("#peek-badge").classList.remove("hidden");
    }
    if (fromShot && this.shotMode === "tip") {
      this.showLoopTip();
    }
    if (fromShot && this.shotMode === "feedback") {
      this.paintFeedbackTrail(false);
    }
    if (fromShot && this.shotMode === "feedbackpeek") {
      this.paintFeedbackTrail(true);
    }
    if (fromShot && this.shotMode === "finger") {
      this.beginFingerCue(true);
    }
    this.snapCamera();

    qs("#title-screen").classList.add("hidden");
    qs("#win-screen").classList.add("hidden");
    qs("#fail-screen").classList.add("hidden");
    qs("#ad-screen").classList.add("hidden");
    qs("#hud").classList.remove("hidden");
    if (!fromShot || this.shotMode !== "tip") qs("#tip-banner").classList.add("hidden");
    qs("#peek-badge").classList.toggle("hidden", !this.peeking);
    this.syncHud();
    document.body.dataset.ready = "1";
    if (!fromShot) {
      track(retry ? "level_retry" : "level_start", { level: cfg.id, chapter: cfg.chapter });
    }
    if (!fromShot && this.levelId === 1) this.beginFingerCue(false);
    if (fromShot && this.shotMode === "clear") {
      document.body.dataset.view = "clear";
      this.playTime = 22.4;
      this.steps = 48;
      this.win();
    } else if (fromShot && this.shotMode === "tip") {
      document.body.dataset.view = "tip";
    } else if (fromShot && (this.shotMode === "feedback" || this.shotMode === "feedbackpeek")) {
      document.body.dataset.view = "feedback";
      if (this.shotMode === "feedbackpeek") {
        this.peeking = true;
        this.peekT = 99;
        this.snapCamera();
      } else {
        this.cam.scale = this.playScale() * 0.82;
      }
    } else if (fromShot && this.shotMode === "finger") {
      document.body.dataset.view = "shot";
    } else if (fromShot && this.shotMode === "hud") {
      document.body.dataset.view = "hud";
    } else if (fromShot) {
      document.body.dataset.view = "shot";
    } else {
      document.body.dataset.view = this.peeking ? "peek" : "walk";
    }
  }

  private paintFeedbackTrail(wide: boolean, cap = 0): void {
    const path = feedbackPath(this.maze, this.hasKey);
    const n = cap > 0 ? Math.min(path.length - 1, cap) : Math.min(path.length - 2, wide ? 12 : 8);
    const ids = path.slice(0, Math.max(2, n + 1));
    for (const id of ids) markCell(this.feedback, id);
    const c = this.maze.cells[ids[ids.length - 1]!]!;
    const prev = this.maze.cells[ids[Math.max(0, ids.length - 2)]!]!;
    this.player.x = c.x;
    this.player.y = c.y;
    this.player.facing = Math.atan2(c.y - prev.y, c.x - prev.x);
    this.lastCell = c.id;
    this.cam.x = c.x;
    this.cam.y = c.y;
    this.syncProxHud();
  }

  private showShotPathPreview(): void {
    const path = feedbackPath(this.maze, this.hasKey);
    const ids = path.slice(0, Math.min(7, path.length));
    this.preview = {
      pts: ids.map((id) => ({ x: this.maze.cells[id]!.x, y: this.maze.cells[id]!.y })),
      ok: true,
    };
    this.previewT = 99;
  }

  private snapCamera(): void {
    if (this.peeking || !usesVisionDisc(this.levelId)) {
      const fit = fitPeekScale(this.maze, this.viewW(), this.viewH());
      this.cam.x = fit.x;
      this.cam.y = fit.y;
      this.cam.scale = fit.scale;
    } else {
      this.cam.x = this.player.x;
      this.cam.y = this.player.y;
      this.cam.scale = this.playScale();
    }
  }

  private viewW(): number {
    return this.canvas.clientWidth || this.canvas.width / this.dpr;
  }
  private viewH(): number {
    return this.canvas.clientHeight || this.canvas.height / this.dpr;
  }

  private goTitle(): void {
    this.screen = "title";
    this.peeking = false;
    this.progress = loadProgress();
    qs("#title-screen").classList.remove("hidden");
    qs("#win-screen").classList.add("hidden");
    qs("#fail-screen").classList.add("hidden");
    qs("#ad-screen").classList.add("hidden");
    qs("#hud").classList.add("hidden");
    qs("#peek-badge").classList.add("hidden");
    qs("#tip-banner").classList.add("hidden");
    qs("#dead-banner").classList.add("hidden");
    this.hideFinger();
    this.buildLevelRow();
    this.renderTitleArt();
  }

  private onPeek(): void {
    if (this.screen !== "play" || this.escorting) return;
    if (!usesVisionDisc(this.levelId)) return;
    if (this.peeking) {
      this.peeking = false;
      qs("#peek-badge").classList.add("hidden");
      return;
    }
    if (this.peeksLeft <= 0) {
      this.openAd("peek");
      return;
    }
    this.peeksLeft -= 1;
    this.peekT = 4.2;
    this.peeking = true;
    this.peekSeen = true;
    this.peekGuard = performance.now() + 450;
    qs("#peek-badge").classList.remove("hidden");
    if (!this.shotMode) track("monitor_use", { level: this.levelId, remaining: this.peeksLeft });
    this.syncHud();
  }

  private dismissTip(): void {
    qs("#tip-banner").classList.add("hidden");
    this.stuckT = 0;
    this.tipCooldown = true;
  }

  private tryTap(cx: number, cy: number): void {
    if (this.escorting) return;
    const world = this.screenToWorld(cx, cy);
    if (this.levelId > 1 && this.hearts > 0 && punchHole(this.maze, world)) {
      this.hearts -= 1;
      this.holeFlash = world;
      this.holeFlashT = 0.7;
      this.stuckT = 0;
      this.loopT = 0;
      rumble(this.progress.vib, VIBE.medium);
      playSfx("hole", this.progress.sfx);
      if (!this.shotMode) track("repair_use", { level: this.levelId, remaining: this.hearts });
      this.toast("开了一个检修口");
      this.syncHud();
      return;
    }
    if (this.hearts <= 0 && this.nearWall(world)) {
      this.openAd("heart");
      return;
    }
    if (this.onApproachPath(world)) {
      this.toast("走进平面图，点格子走路或点墙壁开检修口");
      return;
    }
    this.tryTapMove(world);
  }

  private nearWall(p: { x: number; y: number }): boolean {
    const r = this.maze.wallHalf + 0.18;
    for (const s of this.maze.segments) {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const hx = s.a.x + dx * t;
      const hy = s.a.y + dy * t;
      if (Math.hypot(p.x - hx, p.y - hy) < r) return true;
    }
    return false;
  }

  private tryTapMove(world: { x: number; y: number }): void {
    const id = cellAt(this.maze, world);
    const c = this.maze.cells[id];
    if (!c || dist(world, c) > this.maze.cellSize * 0.58) {
      this.preview = { pts: [this.player, world], ok: false };
      this.previewT = 0.45;
      playSfx("ui", this.progress.sfx);
      rumble(this.progress.vib, VIBE.ui);
      return;
    }
    const from = cellAt(this.maze, this.player);
    const locked = this.maze.locked;
    const path = cellPathFrom(this.maze, from, (n) => n === id, locked);
    const pts = (path ?? [from, id]).map((cid) => ({ x: this.maze.cells[cid]!.x, y: this.maze.cells[cid]!.y }));
    if (!path) {
      this.preview = { pts, ok: false };
      this.previewT = 0.7;
      playSfx("dead", this.progress.sfx);
      rumble(this.progress.vib, VIBE.dead);
      this.microCue("过不去");
      return;
    }
    this.captureUndo();
    this.preview = { pts, ok: true };
    this.previewT = 1.6;
    this.autoRoute = pts.slice(1);
    this.autoI = 0;
    if (!this.shotMode) track("path_tap", { level: this.levelId, hops: pts.length });
  }

  private captureUndo(): void {
    this.undoSnap = {
      x: this.player.x,
      y: this.player.y,
      facing: this.player.facing,
      trail: this.feedback.trail.slice(),
      visited: [...this.feedback.visited],
      lastCell: this.lastCell,
      steps: this.steps,
      cellId: this.feedback.cellId,
      lastHops: this.feedback.lastHops,
      lastValue: this.feedback.lastValue,
    };
  }

  private undoMove(): void {
    const s = this.undoSnap;
    if (!s || this.screen !== "play" || this.escorting) return;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.facing = s.facing;
    this.feedback.trail = s.trail.slice();
    this.feedback.visited = new Set(s.visited);
    this.feedback.cellId = s.cellId;
    this.feedback.lastHops = s.lastHops;
    this.feedback.lastValue = s.lastValue;
    this.lastCell = s.lastCell;
    this.steps = s.steps;
    this.autoRoute = null;
    this.preview = null;
    this.undoSnap = null;
    this.syncHud();
    rumble(this.progress.vib, VIBE.ui);
  }

  private showLoopTip(): void {
    qs("#tip-text").textContent = "换条路试试";
    qs("#tip-banner").classList.remove("hidden");
  }

  private microCue(msg: string): void {
    const el = qs("#micro-cue");
    el.textContent = msg;
    el.classList.remove("hidden");
    this.cueT = 0.7;
  }

  private onApproachPath(p: Vec2): boolean {
    return (
      Math.abs(p.x - this.maze.start.x) < this.maze.cellSize * 0.55 &&
      p.y > this.maze.outerR - this.maze.cellSize * 0.35
    );
  }

  private screenToWorld(cx: number, cy: number): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    const x = cx - r.left;
    const y = cy - r.top;
    return {
      x: (x - this.viewW() * 0.5) / this.cam.scale + this.cam.x,
      y: (y - this.viewH() * 0.5) / this.cam.scale + this.cam.y,
    };
  }

  private openAd(kind: AdKind): void {
    this.adKind = kind;
    this.screen = "ad";
    this.adWatching = false;
    this.adT = 0;
    const titles: Record<AdKind, [string, string]> = {
      peek: ["监控次数用完了", "看视频可恢复 1 次监控（激励广告占位）"],
      heart: ["检修次数用完了", "看视频可恢复 1 次检修，用来开检修口"],
      revive: ["被偷宠贼抓住了", "看视频原地复活（偷宠贼会跑远一点）"],
    };
    qs("#ad-title").textContent = titles[kind][0]!;
    qs("#ad-sub").textContent = titles[kind][1]!;
    qs("#ad-screen").classList.remove("hidden");
    qs("#ad-progress").classList.add("hidden");
    qs("#ad-status").textContent = "";
    qs("#btn-watch-ad").classList.remove("hidden");
    if (!this.shotMode) track("ad_reward_offer", { kind, level: this.levelId });
  }

  private closeAd(): void {
    qs("#ad-screen").classList.add("hidden");
    this.screen = "play";
    this.adWatching = false;
  }

  private watchAd(): void {
    if (this.adWatching) return;
    this.adWatching = true;
    this.adT = 0;
    qs("#ad-progress").classList.remove("hidden");
    qs("#ad-status").textContent = "广告播放中…（浏览器模拟约 1 秒）";
    qs("#btn-watch-ad").classList.add("hidden");
    const scene = this.adKind as RewardedScene;
    void showRewardedVideo(scene, this.levelId).then((result) => {
      if (this.screen !== "ad") return;
      if (result === "success") this.finishAd();
      else {
        this.adWatching = false;
        qs("#ad-status").textContent = result === "cancel" ? "未看完，没有奖励" : "播放失败，请再试";
        qs("#btn-watch-ad").classList.remove("hidden");
      }
    });
  }

  private toggleSfx(): void {
    this.progress.sfx = !this.progress.sfx;
    saveProgress(this.progress);
    this.syncToggles();
    playSfx(this.progress.sfx ? "toggleOn" : "toggleOff", true);
    if (!this.shotMode) track("settings_sfx_toggle", { on: this.progress.sfx });
  }
  private toggleVib(): void {
    this.progress.vib = !this.progress.vib;
    saveProgress(this.progress);
    this.syncToggles();
    playSfx(this.progress.vib ? "toggleOn" : "toggleOff", this.progress.sfx);
    rumble(this.progress.vib, VIBE.ui);
    if (!this.shotMode) track("settings_vibe_toggle", { on: this.progress.vib });
  }
  private syncToggles(): void {
    qs("#btn-sfx").textContent = this.progress.sfx ? "音效开" : "音效关";
    qs("#btn-vib").textContent = this.progress.vib ? "震动开" : "震动关";
    qs("#btn-sfx").classList.toggle("on", this.progress.sfx);
    qs("#btn-vib").classList.toggle("on", this.progress.vib);
  }

  private playScale(): number {
    const m = Math.min(this.viewW(), this.viewH());
    return Math.max(54, m / 7.6);
  }

  private stickVec(): Vec2 {
    if (!this.pointer.active) return { x: 0, y: 0 };
    const dx = this.pointer.x - this.pointer.ox;
    const dy = this.pointer.y - this.pointer.oy;
    const l = Math.hypot(dx, dy);
    if (l < 8) return { x: 0, y: 0 };
    const s = Math.min(1, l / STICK_R);
    return { x: (dx / l) * s, y: (dy / l) * s };
  }

  private keyVec(): Vec2 {
    let x = 0;
    let y = 0;
    if (this.keys.has("a")) x -= 1;
    if (this.keys.has("d")) x += 1;
    if (this.keys.has("w")) y -= 1;
    if (this.keys.has("s")) y += 1;
    const l = Math.hypot(x, y);
    return l ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  private loop(ts: number): void {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (ts - (this.lastTs || ts)) / 1000);
    this.lastTs = ts;
    this.time += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) qs("#toast").classList.add("hidden");
    }
    if (this.holeFlashT > 0) {
      this.holeFlashT -= dt;
      if (this.holeFlashT <= 0) this.holeFlash = null;
    }
    if (this.screen === "ad" && this.adWatching) {
      this.adT += dt;
      const p = Math.min(1, this.adT / 1);
      (qs("#ad-fill") as HTMLDivElement).style.width = `${p * 100}%`;
    }
    if (this.screen === "play") this.update(dt);
    if (this.screen === "replay") this.updateReplay(dt);
    this.layoutFinger();
    this.draw();
  }

  private finishAd(): void {
    if (this.adKind === "peek") this.peeksLeft += 1;
    if (this.adKind === "heart") this.hearts += 1;
    if (this.adKind === "revive" && this.chaser && this.maze) {
      this.chaser.x = this.maze.chaserSpawn.x;
      this.chaser.y = this.maze.chaserSpawn.y;
      this.chaser.mode = "patrol";
      qs("#fail-screen").classList.add("hidden");
    }
    this.syncHud();
    this.toast(
      this.adKind === "revive" ? "复活了，小心偷宠贼" : this.adKind === "peek" ? "监控 +1" : "检修 +1",
    );
    this.closeAd();
  }

  private update(dt: number): void {
    if (this.deadT > 0) {
      this.deadT -= dt;
      if (this.deadT <= 0) qs("#dead-banner").classList.add("hidden");
    }
    if (this.proxPulse > 0) {
      this.proxPulse -= dt;
      if (this.proxPulse <= 0) qs("#prox-wrap").classList.remove("hot", "cold");
    }
    if (this.trailPulse > 0) this.trailPulse = Math.max(0, this.trailPulse - dt * 3.2);
    if (this.previewT > 0) {
      this.previewT -= dt;
      if (this.previewT <= 0 && !this.autoRoute) this.preview = null;
    }
    if (this.cueT > 0) {
      this.cueT -= dt;
      if (this.cueT <= 0) qs("#micro-cue").classList.add("hidden");
    }
    if (this.hugT > 0) this.hugT = Math.max(0, this.hugT - dt);
    if (this.fingerT > 0) {
      this.fingerT -= dt;
      if (this.fingerT <= 0) this.hideFinger();
    }
    if (this.clearPulse > 0) this.clearPulse = Math.max(0, this.clearPulse - dt * 1.4);
    this.stepParticles(dt);
    if (this.escorting) {
      this.updateEscort(dt);
      return;
    }

    if (this.peeking) {
      this.peekT -= dt;
      if (this.peekT <= 0) {
        this.peeking = false;
        qs("#peek-badge").classList.add("hidden");
      }
    }

    let vx = 0;
    let vy = 0;
    if (!this.peeking) {
      const s = this.stickVec();
      const k = this.keyVec();
      vx = s.x || k.x;
      vy = s.y || k.y;
      if (s.x || s.y) {
        vx = s.x;
        vy = s.y;
      }
      if (Math.hypot(vx, vy) > 0.08) {
        this.autoRoute = null;
      } else if (this.autoRoute && this.autoI < this.autoRoute.length) {
        const t = this.autoRoute[this.autoI]!;
        const d = dist(this.player, t);
        if (d < 0.1) this.autoI += 1;
        else {
          vx = (t.x - this.player.x) / d;
          vy = (t.y - this.player.y) / d;
        }
        if (this.autoI >= this.autoRoute.length) this.autoRoute = null;
      }
    }

    const moving = Math.hypot(vx, vy) > 0.08;
    if (moving) {
      this.player.facing = Math.atan2(vy, vx);
      const want = collideMove(this.maze, this.player, PLAYER_RADIUS, vx * SPEED * dt, vy * SPEED * dt);
      const next = inPlayableFloor(this.maze, want) ? want : this.player;
      const moved = dist(this.player, next);
      if (moved < 0.002 && Math.hypot(vx, vy) > 0.4 && this.time - this.lastBump > 0.35) {
        this.lastBump = this.time;
        rumble(this.progress.vib, VIBE.ui);
        playSfx("bump", this.progress.sfx);
      }
      this.player.x = next.x;
      this.player.y = next.y;
      this.stepAcc += moved;
      while (this.stepAcc >= 1) {
        this.stepAcc -= 1;
        this.steps += 1;
      }
      qs("#step-count").textContent = String(this.steps);
    }

    this.playTime += dt;
    qs("#time-count").textContent = this.fmtTime(this.playTime);

    if (this.maze.keyPos && !this.hasKey && dist(this.player, this.maze.keyPos) < 0.5) {
      this.hasKey = true;
      this.maze.locked = false;
      setHasKey(this.feedback, true);
      playSfx("key", this.progress.sfx);
      rumble(this.progress.vib, VIBE.medium);
      this.toast("拿到值班钥匙，笼子开了");
      this.syncHud();
    }

    const inCourt =
      Math.max(Math.abs(this.player.x), Math.abs(this.player.y)) < this.maze.hedge - 0.08;
    if (inCourt) {
      if (this.maze.config.needsKey && !this.hasKey) {
        if (this.toastTimer <= 0) this.toast("先找到值班钥匙再开笼");
      } else this.beginRescue();
    }

    if (this.chaser && !this.peeking) {
      updateChaser(this.maze, this.chaser, this.player, dt);
      if (dist(this.chaser, this.player) < 0.42) this.fail("thief");
    }

    const cell = cellAt(this.maze, this.player);
    const goalD = dist(this.player, { x: 0, y: 0 });
    if (cell !== this.lastCell) {
      if (!this.autoRoute) this.captureUndo();
      const ev = markCell(this.feedback, cell);
      this.applyVisit(ev);
      this.recentCells.push(cell);
      if (this.recentCells.length > 10) this.recentCells.shift();
      playSfx("step", this.progress.sfx);
      rumble(this.progress.vib, VIBE.step);
      const now = this.time;
      if (!this.shotMode && now - this.lastMoveTrack > 0.45) {
        this.lastMoveTrack = now;
        track("move_step", { level: this.levelId, cell });
      }
      this.trailPulse = 1;
      if (ev.closer) this.loopT = 0;
    }
    const uniqueRecent = new Set(this.recentCells).size;
    if (cell !== this.lastCell || goalD < this.bestGoal - 0.35) {
      this.stuckT = 0;
      this.lastCell = cell;
      this.bestGoal = Math.min(this.bestGoal, goalD);
    } else {
      this.stuckT += dt;
      if (this.recentCells.length >= 6 && uniqueRecent <= 4) this.loopT += dt;
      else this.loopT = Math.max(0, this.loopT - dt);
      if (this.loopT > 7 && !this.tipCooldown && qs("#tip-banner").classList.contains("hidden")) {
        this.showLoopTip();
      } else if (
        this.stuckT > 22 &&
        this.levelId >= 2 &&
        this.levelId <= 10 &&
        !this.tipCooldown &&
        qs("#tip-banner").classList.contains("hidden")
      ) {
        qs("#tip-text").textContent = "好像绕晕了？点墙壁开「检修口」——花一次检修从墙根钻过去。";
        qs("#tip-banner").classList.remove("hidden");
      }
    }

    if (this.levelId <= 5 && !this.escorting) {
      const hops = this.feedback ? currentHops(this.feedback) : 99;
      const limit = this.levelId <= 2 ? 50 : 62;
      if (this.playTime > limit && hops > 2) this.fail("almost");
    }

    const peekCam = fitPeekScale(this.maze, this.viewW(), this.viewH());
    const follow = usesVisionDisc(this.levelId) && !this.peeking;
    const targetScale = follow ? this.playScale() : peekCam.scale;
    const tx = follow ? this.player.x : peekCam.x;
    const ty = follow ? this.player.y : peekCam.y;
    const k = 1 - Math.exp(-dt * (this.peeking ? 4.5 : 8));
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    this.cam.scale = lerp(this.cam.scale, targetScale, k);
  }

  private stars(): number {
    const cfg = this.maze.config;
    let s = 1;
    if (this.steps <= cfg.parSteps * 1.35 && this.playTime <= cfg.parTime * 1.4) s = 2;
    if (this.steps <= cfg.parSteps && this.playTime <= cfg.parTime) s = 3;
    return s;
  }

  private beginRescue(): void {
    if (this.escorting || this.screen === "win") return;
    this.hasKey = true;
    this.maze.locked = false;
    this.peeking = false;
    qs("#peek-badge").classList.add("hidden");
    qs("#tip-banner").classList.add("hidden");
    if (this.shotMode === "clear") {
      this.win();
      return;
    }
    this.escorting = true;
    this.animalPos = { x: 0, y: 0 };
    this.animalFacing = Math.PI / 2;
    const path = shortestPath(this.maze, { x: 0, y: 0 }, (p) => dist(p, this.maze.start) < 0.48, false);
    this.escortPath = path?.points?.length ? path.points : [this.maze.start];
    this.escortI = 0;
    this.escortT = 0;
    this.hugT = 0.7;
    this.toast(`抱紧${this.maze.config.animal.name}了！`);
    this.burstParticles();
    this.burstParticles();
    this.clearPulse = 1;
    playSfx("rescue", this.progress.sfx);
    rumble(this.progress.vib, VIBE.clear);
  }

  private updateEscort(dt: number): void {
    const pts = this.escortPath;
    if (!pts || pts.length < 2) {
      this.animalPos = { ...(pts?.[0] ?? this.maze.start) };
      this.win();
      return;
    }
    this.escortT += dt * 3.8;
    while (this.escortI < pts.length - 1) {
      const a = pts[this.escortI]!;
      const b = pts[this.escortI + 1]!;
      const seg = Math.max(0.04, dist(a, b));
      if (this.escortT < seg) {
        const t = this.escortT / seg;
        this.animalPos = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
        this.animalFacing = Math.atan2(b.y - a.y, b.x - a.x);
        break;
      }
      this.escortT -= seg;
      this.escortI += 1;
    }
    if (this.escortI >= pts.length - 1) {
      this.animalPos = { ...pts[pts.length - 1]! };
      this.win();
      return;
    }
    const peekCam = fitPeekScale(this.maze, this.viewW(), this.viewH());
    const k = 1 - Math.exp(-dt * 5);
    this.cam.x = lerp(this.cam.x, peekCam.x, k);
    this.cam.y = lerp(this.cam.y, peekCam.y, k);
    this.cam.scale = lerp(this.cam.scale, peekCam.scale, k);
  }

  private win(): void {
    if (this.screen === "win") return;
    this.escorting = false;
    this.screen = "win";
    const stars = this.stars();
    const prev = this.progress.bestStars[this.levelId - 1] ?? 0;
    const prevTime = this.progress.bestTime[this.levelId - 1] ?? 0;
    const prevSteps = this.progress.bestSteps[this.levelId - 1] ?? 0;
    this.progress = markCleared(this.levelId, this.steps, this.playTime, stars);
    const newBest = prevTime === 0 || this.playTime < prevTime || this.steps < (prevSteps || 9999);
    playSfx("rescue", this.progress.sfx);
    rumble(this.progress.vib, VIBE.clear);
    this.hugT = Math.max(this.hugT, 0.45);
    this.clearPulse = 1;
    this.burstParticles();
    this.burstParticles();
    qs("#win-screen").classList.add("pop");
    qs("#win-title").textContent = `救出了${this.maze.config.animal.name}！`;
    qs("#win-sub").textContent = this.levelId >= LEVEL_COUNT ? "全部小伙伴都安全了" : this.maze.config.title;
    qs("#win-time").textContent = this.fmtTime(this.playTime);
    qs("#win-steps").textContent = String(this.steps);
    qs("#win-stars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    qs("#win-best").classList.toggle("hidden", !newBest && prev > 0);
    qs("#btn-next").textContent = this.levelId >= LEVEL_COUNT ? "回院子" : "下一关";
    qs("#win-screen").classList.remove("hidden");
    qs("#peek-badge").classList.add("hidden");
    qs("#tip-banner").classList.add("hidden");
    const interstitial = emitClear(this.levelId);
    if (!this.shotMode) {
      track("level_clear", { level: this.levelId, stars, steps: this.steps });
      if (interstitial) {
        track("ad_interstitial_stub", { level: this.levelId });
        void showInterstitial(this.levelId);
        this.toast("章节插屏占位（浏览器模拟）");
      }
    }
  }

  private fail(kind: "thief" | "almost"): void {
    if (this.screen !== "play" || this.escorting) return;
    this.hideFinger();
    this.failKind = kind;
    this.replayPts = (this.feedback?.trail ?? [])
      .map((id) => this.maze.cells[id])
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ x: c.x, y: c.y }));
    if (this.replayPts.length < 2) {
      this.replayPts = [
        { x: this.maze.start.x, y: this.maze.start.y },
        { x: this.player.x, y: this.player.y },
      ];
    }
    this.replayT = 0;
    this.screen = "replay";
    this.autoRoute = null;
    if (!this.shotMode) track("level_fail", { level: this.levelId, kind });
    playSfx(kind === "thief" ? "catch" : "dead", this.progress.sfx);
    rumble(this.progress.vib, kind === "thief" ? VIBE.medium : VIBE.dead);
  }

  private updateReplay(dt: number): void {
    this.replayT += dt;
    if (this.replayT >= 0.8) this.showFailPanel();
  }

  private replayGhost(): { x: number; y: number; facing: number } | null {
    if (this.screen !== "replay" || this.replayPts.length < 2) return null;
    const pts = this.replayPts;
    const t = Math.min(1, this.replayT / 0.8) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(t));
    const u = t - i;
    const a = pts[i]!;
    const b = pts[i + 1]!;
    return {
      x: lerp(a.x, b.x, u),
      y: lerp(a.y, b.y, u),
      facing: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  private showFailPanel(): void {
    if (this.screen === "fail") return;
    this.screen = "fail";
    const thief = this.failKind === "thief";
    qs("#fail-kicker").textContent = thief ? "糟了" : "差一点";
    qs("#fail-title").textContent = "再试一次";
    qs("#fail-reason").textContent = thief
      ? "被偷宠贼拦住了。"
      : "这条路还可以再顺一点。";
    qs("#btn-fail-ad").classList.toggle("hidden", !thief || this.levelId < 11);
    qs("#fail-screen").classList.remove("hidden");
    if (thief) emitDeath(this.levelId);
  }

  private fmtTime(t: number): string {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t * 10) % 10);
    return `${m}:${String(s).padStart(2, "0")}.${cs}`;
  }

  private syncHud(): void {
    const cfg = this.maze.config;
    qs("#level-label").textContent = `第${cfg.id}关 · ${cfg.title}`;
    qs("#step-count").textContent = String(this.steps);
    qs("#peek-count").textContent = String(this.peeksLeft);
    const charges = "▣".repeat(this.hearts) + "□".repeat(Math.max(0, 3 - this.hearts));
    qs("#heart-count").textContent = charges;
    qs("#charge-stat").setAttribute("aria-label", `检修口剩余 ${this.hearts} 次`);
    qs("#btn-peek").setAttribute("aria-label", `监控剩余 ${this.peeksLeft} 次`);
    const teach = this.levelId === 1 && this.shotMode !== "hud";
    qs("#charge-stat").classList.toggle("hidden", teach);
    qs("#btn-peek").classList.toggle("hidden", teach);
    qs("#btn-undo").classList.toggle("hidden", teach);
    qs("#stick-hint").textContent = teach ? "点格子走到隔离间" : "点格子走路 · 拖动手势或 WASD";
    const keyStat = qs("#key-stat");
    if (!cfg.needsKey) keyStat.classList.add("hidden");
    else {
      keyStat.classList.remove("hidden");
      qs("#key-count").textContent = this.hasKey ? "已拿到" : "寻找中";
    }
    this.syncProxHud();
  }

  private applyVisit(ev: { closer: boolean; farther: boolean; deadEnd: boolean }): void {
    this.syncProxHud();
    const wrap = qs("#prox-wrap");
    wrap.classList.remove("hot", "cold");
    if (ev.closer) {
      wrap.classList.add("hot");
      this.proxPulse = 0.35;
      this.trailMood = 1;
      playSfx("closer", this.progress.sfx);
      this.microCue("靠近了");
    } else if (ev.farther) {
      wrap.classList.add("cold");
      this.proxPulse = 0.28;
      this.trailMood = -0.7;
      playSfx("farther", this.progress.sfx);
    }
    if (ev.deadEnd) {
      this.deadT = 1.15;
      qs("#dead-banner").classList.remove("hidden");
      rumble(this.progress.vib, VIBE.dead);
      playSfx("dead", this.progress.sfx);
    }
  }

  private syncProxHud(): void {
    if (!this.feedback) return;
    const pct = Math.round(this.feedback.lastValue * 100);
    qs("#prox-pct").textContent = `${pct}%`;
    qs("#prox-phase").textContent = currentPhase(this.feedback) === "key" ? "值班钥匙" : "隔离间";
    (qs("#prox-fill") as HTMLDivElement).style.width = `${pct}%`;
    qs("#prox-wrap").setAttribute("aria-valuenow", String(pct));
    qs("#prox-wrap").setAttribute(
      "aria-label",
      `接近 ${currentPhase(this.feedback) === "key" ? "值班钥匙" : "隔离间"} ${pct}%`,
    );
  }

  private toast(msg: string): void {
    const el = qs("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    this.toastTimer = 2.1;
  }

  private openLegal(kind: LegalKind): void {
    const page = LEGAL[kind];
    qs("#legal-kicker").textContent = page.kicker;
    qs("#legal-title").textContent = page.title;
    qs("#legal-body").textContent = page.body;
    qs("#legal-screen").classList.remove("hidden");
  }

  private closeLegal(): void {
    qs("#legal-screen").classList.add("hidden");
  }

  private beginFingerCue(hold: boolean): void {
    const path = feedbackPath(this.maze, this.hasKey);
    const id = path[Math.min(2, Math.max(1, path.length - 1))];
    if (id == null) return;
    const c = this.maze.cells[id]!;
    this.fingerTarget = { x: c.x, y: c.y };
    this.fingerT = hold ? 99 : 2.8;
    this.preview = {
      pts: path.slice(0, Math.min(4, path.length)).map((cid) => ({
        x: this.maze.cells[cid]!.x,
        y: this.maze.cells[cid]!.y,
      })),
      ok: true,
    };
    this.previewT = hold ? 99 : 2.8;
    qs("#finger-cue").classList.remove("hidden");
    this.layoutFinger();
  }

  private hideFinger(): void {
    this.fingerT = 0;
    this.fingerTarget = null;
    qs("#finger-cue").classList.add("hidden");
  }

  private worldToScreen(p: { x: number; y: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + this.viewW() * 0.5 + (p.x - this.cam.x) * this.cam.scale,
      y: r.top + this.viewH() * 0.5 + (p.y - this.cam.y) * this.cam.scale,
    };
  }

  private layoutFinger(): void {
    if (!this.fingerTarget) return;
    const s = this.worldToScreen(this.fingerTarget);
    const el = qs("#finger-cue");
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
  }

  private showStick(on: boolean): void {
    const base = qs("#stick-base");
    if (!on) {
      base.classList.add("hidden");
      return;
    }
    base.classList.remove("hidden");
    this.placeStick();
  }

  private placeStick(): void {
    const base = qs("#stick-base");
    const nub = qs("#stick-nub");
    base.style.left = `${this.pointer.ox}px`;
    base.style.top = `${this.pointer.oy}px`;
    const v = this.stickVec();
    nub.style.transform = `translate(${v.x * STICK_R}px, ${v.y * STICK_R}px)`;
  }

  private resize(): void {
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private draw(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const w = this.viewW();
    const h = this.viewH();
    if (this.screen === "title") {
      this.ctx.fillStyle = "#c8eadb";
      this.ctx.fillRect(0, 0, w, h);
      return;
    }
    if (!this.maze) {
      this.ctx.fillStyle = "#c8eadb";
      this.ctx.fillRect(0, 0, w, h);
      return;
    }
    drawWorld(this.ctx, w, h, {
      maze: this.maze,
      player: this.player,
      chaser: this.chaser,
      cam: this.cam,
      time: this.time,
      peeking: this.peeking,
      hasKey: this.hasKey,
      holeFlash: this.holeFlash,
      animalPos: this.animalPos,
      animalFacing: this.animalFacing,
      trail: this.feedback?.trail,
      visionMask: usesVisionDisc(this.levelId) && !this.peeking && !this.escorting,
      visionRadius: playVisionRadius(this.levelId),
      trailMood: this.trailMood,
      trailPulse: this.trailPulse,
      preview: this.preview,
      goalMark: this.goalMark(),
      chevron: this.junctionChevron(),
      particles: this.particles.map((p) => ({ x: p.x, y: p.y, r: p.r, a: Math.max(0, p.life) })),
      clearPulse: this.clearPulse,
      hugScale: this.hugT > 0 ? 1 + this.hugT * 0.75 : 1,
      ghost: this.replayGhost(),
    });
  }

  private goalMark(): { x: number; y: number } | null {
    const goal = this.maze.config.needsKey && !this.hasKey && this.maze.keyPos ? this.maze.keyPos : { x: 0, y: 0 };
    const hops = this.feedback ? currentHops(this.feedback) : 99;
    const r = playVisionRadius(this.levelId);
    if (!usesVisionDisc(this.levelId) || dist(this.player, goal) < r + 0.35 || this.peeking || (this.peekSeen && hops <= 5)) return goal;
    return null;
  }

  private junctionChevron(): { x: number; y: number; ang: number } | null {
    if (this.levelId < 2 || this.levelId > 5 || this.peeking) return null;
    const from = cellAt(this.maze, this.player);
    const locked = this.maze.locked;
    const goal = this.maze.config.needsKey && !this.hasKey
      ? (id: number) => this.maze.keyPos !== null && id === cellAt(this.maze, this.maze.keyPos)
      : (id: number) => this.maze.cells[id]!.courtyard;
    const path = cellPathFrom(this.maze, from, goal, locked);
    if (!path || path.length < 3) return null;
    const a = this.maze.cells[path[1]!]!;
    const b = this.maze.cells[path[2]!]!;
    return { x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  private burstParticles(): void {
    const o = this.animalPos ?? { x: 0, y: 0 };
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      this.particles.push({
        x: o.x,
        y: o.y,
        vx: Math.cos(a) * (1.2 + Math.random()),
        vy: Math.sin(a) * (1.2 + Math.random()),
        r: 0.06 + Math.random() * 0.08,
        life: 1,
      });
    }
  }

  private stepParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.9;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private renderTitleArt(): void {
    const g = qs("#title-art");
    g.innerHTML = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "-80 -80 160 160");
    svg.innerHTML = `
      <rect x="-54" y="-54" width="108" height="108" rx="18" fill="#eefbf4" stroke="#2b6b5e" stroke-width="3.2"/>
      <rect x="-22" y="-22" width="44" height="44" rx="10" fill="#b6f0d4" stroke="#2b6b5e" stroke-width="2.2"/>
      <path d="M22 0h32M-54 18h18v-18h16M18 54v-20h-16v-16" fill="none" stroke="#2b6b5e" stroke-width="3.2" stroke-linecap="round"/>
      <ellipse cx="0" cy="2" rx="10" ry="8" fill="#f4f0ea" stroke="#24302c" stroke-width="1.6"/>
      <ellipse cx="-7" cy="-10" rx="3.2" ry="9" fill="#f4f0ea" stroke="#24302c" stroke-width="1.4" transform="rotate(-18 -7 -10)"/>
      <ellipse cx="7" cy="-10" rx="3.2" ry="9" fill="#f4f0ea" stroke="#24302c" stroke-width="1.4" transform="rotate(18 7 -10)"/>
      <ellipse cx="-7" cy="-10" rx="1.4" ry="5" fill="#f4b6c4" transform="rotate(-18 -7 -10)"/>
      <ellipse cx="7" cy="-10" rx="1.4" ry="5" fill="#f4b6c4" transform="rotate(18 7 -10)"/>
      <circle cx="-3.2" cy="0" r="1.3" fill="#24302c"/>
      <circle cx="3.2" cy="0" r="1.3" fill="#24302c"/>
      <ellipse cx="0" cy="4.2" rx="2" ry="1.5" fill="#c45a5a"/>
      <ellipse cx="0" cy="46" rx="9" ry="7.5" fill="#3d9a82" stroke="#24302c" stroke-width="1.6"/>
      <rect x="-6.5" y="36" width="13" height="9" rx="4" fill="#1f5c52" stroke="#24302c" stroke-width="1.2"/>
      <rect x="-3.5" y="40" width="5" height="4" rx="1.2" fill="#163f39"/>
      <circle cx="-2.2" cy="47.5" r="1.15" fill="#24302c"/>
      <circle cx="2.2" cy="47.5" r="1.15" fill="#24302c"/>
      <circle cx="5.5" cy="44.5" r="1.8" fill="#e8c547" stroke="#24302c" stroke-width="0.8"/>
    `;
    g.appendChild(svg);
  }
}

function qs(sel: string): HTMLElement {
  const el = document.querySelector(sel);
  if (!el) throw new Error(sel);
  return el as HTMLElement;
}
