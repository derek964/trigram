import { track } from "../analytics";
import {
  GO_LEVELS,
  isLevelUnlocked,
  loadClearedExplore,
  markExploreCleared,
} from "./levels";
import { createState, enemyNode, moveTo, neighbors, type GoState } from "./logic";
import type { NodeId } from "./graph";
import {
  dangerNodes,
  feedbackKind,
  previewNodes,
} from "./feedback";
import { UndoStack } from "./history";
import {
  HINTS_PER_LEVEL,
  adReviveHintPlaceholder,
  nextHintHop,
} from "./hint";
import {
  type IsoLayout,
  type FogPaint,
  computeIsoLayout,
  drawCamp,
  drawCage,
  drawFeedbackRing,
  drawFloor,
  drawMazeBoard,
  drawNodeLabel,
  drawSprite,
  ensureSprites,
  isoDepth,
  isoProject,
  pickIsoNode,
} from "./present";
import { boardExtents, boardFromGraph, type MazeBoard } from "./maze-grid";
import { computeFog, mergeExplored } from "./fog";
import { facingBetween, type Facing } from "./vision";
import { HOP_SEC, easeInOut, idleBob, lerp, phaseFromId, walkBob } from "./anim";
import { forceChaseEnabled } from "./qa-flags";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Hint highlight only — feedback hex live in present.drawFeedbackRing (locked). */
const HINT = "#E8B84A";

/** Hide leftover Theseus / wait chrome while Hitman GO is the active mode. */
function setChaseChromeVisible(visible: boolean): void {
  const chase = document.getElementById("chase-screen");
  if (chase) {
    chase.classList.add("hidden");
    chase.setAttribute("aria-hidden", visible ? "false" : "true");
    chase.querySelectorAll<HTMLElement>(".chase-wait-btn, [data-theseus-wait]").forEach((b) => {
      b.style.display = visible ? "" : "none";
    });
    // Belt-and-suspenders: any leftover 「等待」 label
    if (!visible) {
      chase.querySelectorAll("button").forEach((b) => {
        if ((b.textContent ?? "").includes("等待")) (b as HTMLElement).style.display = "none";
      });
    }
  }
  const btn = document.getElementById("btn-chase");
  if (btn) {
    if (visible) btn.classList.remove("go-hide-chase");
    else btn.classList.add("go-hide-chase");
  }
  document.body.classList.toggle("go-mode-open", !visible);
}

export class GoMode {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ui!: {
    level: HTMLElement;
    count: HTMLElement;
    tip: HTMLElement;
    toast: HTMLElement;
    menu: HTMLElement;
    grid: HTMLElement;
    lost: HTMLElement;
    win: HTMLElement;
    undo: HTMLButtonElement;
    hint: HTMLButtonElement;
    hintMeter: HTMLElement;
    adHook: HTMLElement;
  };
  private state!: GoState;
  private levelIdx = 0;
  private active = false;
  private dpr = 1;
  private layout: IsoLayout = { ox: 0, oy: 0, scale: 1, nodeR: 22 };
  private mazeBoard: MazeBoard | null = null;
  private exploredWalls = new Set<string>();
  private fogVisible = new Set<NodeId>();
  private fogVisibleWalls = new Set<string>();
  private clearedExplore = loadClearedExplore();
  private history = new UndoStack();
  /** Presentation facing for hunter (logic has no player facing). */
  private playerFacing: Facing = "S";
  private facingHistory: Facing[] = [];
  private wallsHistory: Set<string>[] = [];
  private hintsLeft = HINTS_PER_LEVEL;
  private hintNode: NodeId | null = null;
  /** Presentation clock (sec) — drives idle bob. */
  private time = 0;
  /** 0→1 hop progress; 1 = settled at logic nodes. */
  private animT = 1;
  /** Visual from-nodes for the current hop (null when settled). */
  private prevVisual: { player: NodeId; enemies: Record<string, NodeId> } | null = null;
  /** Fire once hop settles (win/lost overlays). */
  private pendingEnd: (() => void) | null = null;
  private looping = false;

  constructor() {
    this.root = el("section", "go-mode hidden");
    this.root.id = "go-screen";
    this.canvas = el("canvas", "go-canvas");
    this.build();
    document.querySelector("#app")!.appendChild(this.root);
    this.bind();
    ensureSprites(() => {
      if (this.active) this.draw();
    });
    this.startLoop();
  }

  private startLoop(): void {
    if (this.looping) return;
    this.looping = true;
    requestAnimationFrame((t) => this.loop(t, t));
  }

  private loop(t: number, last: number): void {
    const dt = Math.min(0.05, (t - last) / 1000);
    this.time += dt;
    if (this.animT < 1) {
      this.animT = Math.min(1, this.animT + dt / HOP_SEC);
      if (this.animT >= 1) {
        this.animT = 1;
        this.prevVisual = null;
        const end = this.pendingEnd;
        this.pendingEnd = null;
        end?.();
      }
    }
    if (this.active) this.draw();
    requestAnimationFrame((n) => this.loop(n, t));
  }

  /** Snap visuals to logic state (load / undo / no hop). */
  private settleVisual(): void {
    this.animT = 1;
    this.prevVisual = null;
    this.pendingEnd = null;
  }

  private hopping(): boolean {
    return this.animT < 1;
  }


  open(level?: number): void {
    this.active = true;
    this.root.classList.remove("hidden");
    document.getElementById("title-screen")?.classList.add("hidden");
    setChaseChromeVisible(false);
    const idx = typeof level === "number" && level >= 0 && level < GO_LEVELS.length ? level : 0;
    this.load(idx);
    track("go_open", { level: idx + 1 });
    this.resize();
    this.draw();
  }

  close(): void {
    this.active = false;
    this.root.classList.add("hidden");
    document.body.classList.remove("go-mode-open");
    document.getElementById("title-screen")?.classList.remove("hidden");
    // Chase title CTA stays retired (P1 merge); chase-screen only via ?mode=chase
    document.getElementById("chase-screen")?.classList.add("hidden");
    document.getElementById("btn-chase")?.classList.add("go-hide-chase");
  }

  private build(): void {
    const top = el("div", "go-top");
    const level = el("div", "level-chip", "猎人森林 1");
    const count = el("div", "objective-chip", "步数 0");
    const home = el("button", "ghost icon", "关卡") as HTMLButtonElement;
    home.type = "button";
    home.onclick = () => this.openMenu();
    top.append(level, count, home);

    const tip = el("div", "go-tip", "");
    const toast = el("div", "toast hidden");

    const lost = el("div", "go-lost hidden");
    // Placeholder only — this.state is assigned in load(); never read it in build().
    lost.append(el("span", "go-lost-msg", "被绑架者发现了"));
    const undoLost = el("button", "primary", "撤回一步") as HTMLButtonElement;
    undoLost.type = "button";
    undoLost.onclick = () => this.undo();
    const retry = el("button", "ghost", "重开本关") as HTMLButtonElement;
    retry.type = "button";
    retry.onclick = () => this.load(this.levelIdx);
    lost.append(undoLost, retry);

    const win = el("div", "go-win hidden");
    win.append(el("span", "", "护送到营地！"));
    const next = el("button", "primary", "下一关") as HTMLButtonElement;
    next.type = "button";
    next.onclick = () => this.load((this.levelIdx + 1) % GO_LEVELS.length);
    const again = el("button", "ghost", "再玩一次") as HTMLButtonElement;
    again.type = "button";
    again.onclick = () => this.load(this.levelIdx);
    win.append(next, again);

    const stage = el("div", "go-stage");
    stage.append(this.canvas, tip, toast, lost, win);

    const dock = el("div", "go-dock");
    const mk = (txt: string, fn: () => void): HTMLButtonElement => {
      const b = el("button", "ghost dock-btn", txt) as HTMLButtonElement;
      b.type = "button";
      b.onclick = fn;
      return b;
    };
    const undoBtn = mk("撤回", () => this.undo());
    const hintBtn = mk("提示", () => this.useHint());
    const hintMeter = el("div", "go-hint-meter", "");
    const adHook = el("div", "go-ad-hook hidden");
    const adMsg = el("span", "", "提示已用完");
    const adBtn = el("button", "ghost dock-btn", "看广告再得提示") as HTMLButtonElement;
    adBtn.type = "button";
    adBtn.onclick = () => this.adReviveHint();
    adHook.append(adMsg, adBtn);
    dock.append(
      undoBtn,
      hintBtn,
      mk("重开", () => this.load(this.levelIdx)),
      mk("下一关", () => this.load((this.levelIdx + 1) % GO_LEVELS.length)),
      mk("退出", () => this.close()),
    );
    dock.append(hintMeter, adHook);

    const menu = el("div", "overlay go-overlay hidden");
    const mp = el("div", "panel");
    mp.append(
      el("p", "kicker", "Hitman GO 式 · P0"),
      el("h2", "", "猎人森林"),
      el("p", "lead", "真迷宫摸索 · 探索无绑少步／追击绑贴笼。Fog R=2（教学 R=3）。邻接#35504A · 预告#314F5D · 危险#7F3629。同 S 先探索再追击。"),
    );
    const grid = el("div", "go-grid");
    const back = mk("回到标题", () => this.close());
    back.className = "ghost";
    mp.append(grid, back);
    menu.append(mp);

    this.ui = {
      level,
      count,
      tip,
      toast,
      menu,
      grid,
      lost,
      win,
      undo: undoBtn,
      hint: hintBtn,
      hintMeter,
      adHook,
    };
    this.root.append(top, stage, dock, menu);
    this.fillMenu();
  }

  private fillMenu(): void {
    this.ui.grid.innerHTML = "";
    this.clearedExplore = loadClearedExplore();
    GO_LEVELS.forEach((lv, i) => {
      const b = el("button", "go-lv", "") as HTMLButtonElement;
      b.type = "button";
      const force = forceChaseEnabled();
      const unlocked = force || isLevelUnlocked(lv, this.clearedExplore);
      const tags: string[] = [lv.mode === "explore" ? "探索" : "追击", `S${lv.S}`];
      if (lv.enemies?.length) {
        const kinds = new Set((lv.enemies ?? []).map((e) => e.kind));
        if (kinds.has("static")) tags.push("E0");
        if (kinds.has("polyline")) tags.push("E1");
        if (kinds.has("ring")) tags.push("E2");
      }
      if (lv.rescue) tags.push("救");
      if (force && lv.mode === "chase" && !isLevelUnlocked(lv, this.clearedExplore)) tags.push("QA");
      const lock = unlocked ? "" : " · 锁";
      b.innerHTML = `<b>${lv.id}</b><span>${lv.name} · ${tags.join("+")}${lock}</span>`;
      if (!unlocked) {
        b.disabled = true;
        b.style.opacity = "0.45";
        b.title = "先通关同边长探索关";
      } else {
        b.onclick = () => {
          this.ui.menu.classList.add("hidden");
          this.load(i);
        };
      }
      this.ui.grid.append(b);
    });
  }

  private openMenu(): void {
    if (this.ui.menu.classList.contains("hidden")) this.fillMenu();
    this.ui.menu.classList.toggle("hidden");
  }

  private load(idx: number): void {
    this.levelIdx = idx;
    const lv = GO_LEVELS[idx]!;
    this.clearedExplore = loadClearedExplore();
    const force = forceChaseEnabled();
    if (!force && !isLevelUnlocked(lv, this.clearedExplore)) {
      this.flash("先通关同边长探索关再开追击");
      this.openMenu();
      return;
    }
    this.state = createState(lv.graph, lv.start, {
      enemies: lv.enemies ?? [],
      rescue: lv.rescue ?? null,
      visionR: lv.visionR,
      fogBowSafe: true,
    });
    this.exploredWalls = new Set();
    this.playerFacing = "S";
    this.facingHistory = [];
    this.wallsHistory = [];
    this.refreshFog(true);
    this.history.clear();
    this.hintsLeft = HINTS_PER_LEVEL;
    this.hintNode = null;
    const modeTag = lv.mode === "explore" ? "探索" : "追击";
    this.ui.level.textContent = `猎人森林 ${lv.id} · ${modeTag} · S${lv.S}`;
    this.ui.tip.textContent = force && lv.mode === "chase" && !isLevelUnlocked(lv, this.clearedExplore)
      ? `${lv.hint} · QA forceChase`
      : lv.hint;
    if (force && lv.mode === "chase" && !isLevelUnlocked(lv, this.clearedExplore)) {
      this.flash("QA · forceChase 跳过探索锁");
    }
    this.ui.menu.classList.add("hidden");
    this.ui.lost.classList.add("hidden");
    this.ui.win.classList.add("hidden");
    this.ui.adHook.classList.add("hidden");
    setChaseChromeVisible(false);
    this.settleVisual();
    this.refreshHud();
    this.resize();
    this.draw();
  }

  /** Recompute visible set from player; optionally seed explored. */
  private refreshFog(seedExplored: boolean): void {
    const frame = computeFog(this.state.graph, this.state.player, this.state.visionR);
    this.fogVisible = frame.visible;
    this.fogVisibleWalls = frame.visibleWalls;
    if (seedExplored) {
      this.state.explored = new Set(frame.visible);
      this.exploredWalls = new Set(frame.visibleWalls);
    } else {
      mergeExplored(this.state.explored, this.exploredWalls, frame);
    }
  }

  private fogPaint(): FogPaint {
    return {
      visibleFloors: this.fogVisible,
      exploredFloors: this.state.explored,
      visibleWalls: this.fogVisibleWalls,
      exploredWalls: this.exploredWalls,
    };
  }

  private isLit(id: NodeId): boolean {
    return this.fogVisible.has(id) || this.state.explored.has(id);
  }

  private refreshHud(): void {
    const lv = GO_LEVELS[this.levelIdx]!;
    const parts = [`步数 ${this.state.steps}`];
    if (lv.mode === "explore") parts.push("探索");
    else parts.push("追击");
    if (this.state.enemies.length) parts.push(`哨 ${this.state.enemies.length}`);
    if (this.state.required.length) {
      parts.push(`救 ${this.state.carried.length}/${this.state.required.length}`);
    }
    this.ui.count.textContent = parts.join(" · ");
    this.ui.undo.disabled = !this.history.canUndo;
    this.ui.hint.disabled = this.hintsLeft <= 0 || this.state.status !== "play";
    this.ui.hintMeter.textContent = `提示 ${this.hintsLeft}/${HINTS_PER_LEVEL}`;
    if (this.hintsLeft <= 0) this.ui.adHook.classList.remove("hidden");
    else this.ui.adHook.classList.add("hidden");
  }

  private bind(): void {
    window.addEventListener("resize", () => {
      if (this.active) {
        this.resize();
        this.draw();
      }
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!this.active || this.state.status !== "play") return;
      const id = this.pick(e.clientX, e.clientY);
      if (!id) return;
      this.tryMove(id);
    });
  }

  private tryMove(to: NodeId): void {
    if (this.state.status !== "play") {
      this.flash("本关已结束 · 可撤回或重开");
      return;
    }
    if (this.hopping()) return; // wait for walk tween to finish
    // Snapshot visual from-nodes before logic mutates
    const fromPlayer = this.state.player;
    const fromEnemies: Record<string, NodeId> = {};
    for (const e of this.state.enemies) fromEnemies[e.id] = enemyNode(e);

    this.history.push(this.state);
    this.facingHistory.push(this.playerFacing);
    this.wallsHistory.push(new Set(this.exploredWalls));
    // Bow §4 uses explored from *before* fog expand so dark unexplored hops are not arrow-killed.
    const r = moveTo(this.state, to);
    if (r.ok) {
      const face = facingBetween(this.state.graph, fromPlayer, to);
      if (face) this.playerFacing = face;
      this.refreshFog(false);
    }
    if (!r.ok) {
      this.history.pop(); // discard snapshot of failed attempt
      this.facingHistory.pop();
      this.wallsHistory.pop();
      const msg =
        r.reason === "wait-forbidden"
          ? "不能原地等待 · 请点相邻节点"
          : r.reason === "not-adjacent"
            ? "只能走到相邻节点"
            : r.reason === "not-playing"
              ? "本关已结束"
              : "无效节点";
      this.flash(msg);
      this.draw();
      return;
    }
    // Consume hint highlight if player followed it (or clear otherwise)
    if (this.hintNode && to === this.hintNode) this.hintNode = null;
    else this.hintNode = null;
    this.refreshHud();
    // Start hop tween: presentation only — logic already at destination
    this.prevVisual = { player: fromPlayer, enemies: fromEnemies };
    this.animT = 0;
    if (r.picked.length) this.flash(`带走了小动物`);
    if (r.caught || r.won) {
      const caught = r.caught;
      const reason = this.state.reason;
      this.pendingEnd = () => {
        if (caught) {
          const msg = this.ui.lost.querySelector(".go-lost-msg");
          if (msg) msg.textContent = reason || "被绑架者发现了";
          this.ui.lost.classList.remove("hidden");
          this.flash(reason || "被绑架者发现了");
        } else {
          const lv = GO_LEVELS[this.levelIdx]!;
          if (lv.mode === "explore") {
            markExploreCleared(lv.id);
            this.clearedExplore = loadClearedExplore();
            this.fillMenu();
          }
          const stepMsg = `护送到营地！· ${this.state.steps} 步`;
          const msgEl = this.ui.win.querySelector("span");
          if (msgEl) msgEl.textContent = stepMsg;
          this.ui.win.classList.remove("hidden");
          this.flash(reason || stepMsg);
        }
      };
    }
    this.draw();
  }

  /** Undo last player step; enemies + animals roll back together. Works after catch/win. */
  private undo(): void {
    if (!this.active) return;
    const prev = this.history.pop();
    if (!prev) {
      this.flash("已经是开局了");
      return;
    }
    this.state = prev;
    this.hintNode = null;
    this.playerFacing = this.facingHistory.pop() ?? "S";
    this.exploredWalls = this.wallsHistory.pop() ?? new Set();
    // Recompute visibility; explored comes from snapshot
    const frame = computeFog(this.state.graph, this.state.player, this.state.visionR);
    this.fogVisible = frame.visible;
    this.fogVisibleWalls = frame.visibleWalls;
    this.settleVisual();
    this.ui.lost.classList.add("hidden");
    this.ui.win.classList.add("hidden");
    this.refreshHud();
    this.draw();
    track("go_undo", { level: this.levelIdx + 1, steps: this.state.steps });
  }

  /** Highlight next optimal adjacent hop; does not auto-move. */
  private useHint(): void {
    if (!this.active) return;
    if (this.state.status !== "play") {
      this.flash("本关已结束");
      return;
    }
    if (this.hintsLeft <= 0) {
      this.ui.adHook.classList.remove("hidden");
      this.flash("提示已用完");
      return;
    }
    const { next, depth } = nextHintHop(this.state);
    this.hintsLeft -= 1;
    if (!next) {
      this.hintNode = null;
      this.refreshHud();
      this.flash(depth < 0 ? "当前无解 · 试试撤回" : "已在终点");
      this.draw();
      return;
    }
    this.hintNode = next;
    this.refreshHud();
    this.flash(`提示：走向 ${next}`);
    this.draw();
    track("go_hint", { level: this.levelIdx + 1, next, left: this.hintsLeft });
  }

  /** Ad-revive placeholder — grants +1 hint, no real SDK. */
  private adReviveHint(): void {
    const r = adReviveHintPlaceholder();
    this.hintsLeft += r.granted;
    this.ui.adHook.classList.add("hidden");
    this.refreshHud();
    this.flash(r.message);
    track("go_hint_ad_placeholder", { level: this.levelIdx + 1 });
  }

  private flash(msg: string): void {
    this.ui.toast.textContent = msg;
    this.ui.toast.classList.remove("hidden");
    window.setTimeout(() => this.ui.toast.classList.add("hidden"), 1000);
  }

  private resize(): void {
    const stage = this.canvas.parentElement!;
    const w = Math.max(280, stage.clientWidth || window.innerWidth);
    const h = Math.max(320, stage.clientHeight || window.innerHeight * 0.55);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  private computeLayout(): void {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    this.mazeBoard = boardFromGraph(this.state.graph, 1);
    this.layout = computeIsoLayout(boardExtents(this.mazeBoard), w, h);
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    return isoProject(x, y, this.layout);
  }

  private pick(clientX: number, clientY: number): NodeId | null {
    return pickIsoNode(
      clientX,
      clientY,
      this.canvas,
      this.dpr,
      this.layout,
      this.state.graph.nodes,
    );
  }

  private draw(): void {
    if (!this.state) return;
    this.computeLayout();
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawFloor(ctx, w, h);

    const L = this.layout;
    const nodeR = L.nodeR;

    // Maze shell: corridor floors + solid wall blocks (no CAD edge lines)
    if (!this.mazeBoard) this.mazeBoard = boardFromGraph(this.state.graph, 1);
    const noPad = new Set<string>([this.state.player, ...this.state.enemies.map((e) => enemyNode(e)).filter(Boolean) as string[]]);
    drawMazeBoard(ctx, this.mazeBoard, L, this.fogPaint(), noPad);

    // Patrol path ghost (dashed) on corridors — non-warn style (product: dash ≠ warn hex)
    for (const e of this.state.enemies) {
      if (e.path.length < 2) continue;
      ctx.strokeStyle = "rgba(49,79,93,0.35)";
      ctx.lineWidth = Math.max(2.5, L.scale * 0.04);
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      for (let i = 0; i < e.path.length; i++) {
        const p = this.state.graph.nodes[e.path[i]!]!;
        const s = this.toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      if (e.kind === "ring") {
        const p0 = this.state.graph.nodes[e.path[0]!]!;
        const s0 = this.toScreen(p0.x, p0.y);
        ctx.lineTo(s0.x, s0.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const neigh = this.state.status === "play" ? new Set(neighbors(this.state)) : new Set<NodeId>();
    const preview = this.state.status === "play" ? new Set(previewNodes(this.state)) : new Set<NodeId>();
    const danger = this.state.status === "play" ? new Set(dangerNodes(this.state)) : new Set<NodeId>();

    // Depth-sort nodes for painter's algorithm
    const nodeIds = Object.keys(this.state.graph.nodes).sort((a, b) => {
      const pa = this.state.graph.nodes[a]!;
      const pb = this.state.graph.nodes[b]!;
      return isoDepth(pa.x, pa.y) - isoDepth(pb.x, pb.y);
    });

    // Platforms + feedback + props (no characters yet)
    for (const id of nodeIds) {
      if (!this.isLit(id) && id !== this.state.player) continue;
      const p = this.state.graph.nodes[id]!;
      const s = this.toScreen(p.x, p.y);
      // No node-pad under any character cell: birth==camp so a camp pad
      // always sat under the hunter and read as a cream/kraft pedestal.
      // Camp tent + cage prop already mark those nodes.
      const kind = feedbackKind(this.state, id, neigh, preview, danger);
      // Danger/preview only when fog-lit (no dark-arrow UI)
      if (kind !== "none" && this.isLit(id)) {
        drawFeedbackRing(ctx, s.x, s.y, nodeR, kind);
      }
      if (this.fogVisible.has(id) || id === this.state.player) {
        if (this.state.animalsLeft[id]) {
          drawCage(ctx, s.x - nodeR * 0.85, s.y - nodeR * 0.1, nodeR * 0.85);
        }
        // Skip labeling CAMP under hunter feet — id still used in logic
        if (id !== this.state.safe) drawNodeLabel(ctx, s.x, s.y, nodeR, id);
      }
    }

    // Hint ring (not a feedback hex)
    if (this.hintNode && this.state.status === "play") {
      const hp = this.state.graph.nodes[this.hintNode];
      if (hp) {
        const s = this.toScreen(hp.x, hp.y);
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, nodeR * 1.55, nodeR * 0.9, 0, 0, Math.PI * 2);
        ctx.strokeStyle = HINT;
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, nodeR * 1.15, nodeR * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = HINT;
        ctx.globalAlpha = 0.32;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Character sprites — depth sorted; world positions may be mid-hop tweens
    type Piece = { depth: number; order: number; draw: () => void };
    const pieces: Piece[] = [];
    const spriteH = Math.max(112, Math.min(160, L.scale * 1.35));
    const f = easeInOut(this.animT);
    const hopping = this.animT < 1;
    const bobAmp = Math.max(2.5, L.scale * 0.035);
    // Idle breathe must be eye-readable on ~120px sprites (was ~3px → FAIL).
    const idleAmp = Math.max(12, spriteH * 0.1);

    const worldAt = (nodeId: NodeId): { x: number; y: number } => {
      const n = this.state.graph.nodes[nodeId]!;
      return { x: n.x, y: n.y };
    };
    const lerpNode = (fromId: NodeId | undefined, toId: NodeId): { x: number; y: number } => {
      const to = worldAt(toId);
      if (!fromId || fromId === toId || !hopping) return to;
      const from = worldAt(fromId);
      return { x: lerp(from.x, to.x, f), y: lerp(from.y, to.y, f) };
    };

    // Waiting animals — idle breathe / ear twitch (presentation only)
    for (const [node, animalId] of Object.entries(this.state.animalsLeft)) {
      if (!this.fogVisible.has(node)) continue;
      const p = this.state.graph.nodes[node]!;
      const s = this.toScreen(p.x, p.y);
      const bob = idleBob(this.time, phaseFromId(animalId || node), idleAmp);
      pieces.push({
        depth: isoDepth(p.x, p.y),
        order: 0,
        draw: () =>
          drawSprite(
            ctx,
            "rabbit",
            s.x + nodeR * 0.15,
            s.y + nodeR * 0.05 + bob,
            spriteH * 0.85,
          ),
      });
    }
    // Poachers — smooth walk along patrol edge when they advance a beat
    for (const e of this.state.enemies) {
      const toId = enemyNode(e);
      if (!this.fogVisible.has(toId) && !this.isLit(toId)) continue;
      const fromId = this.prevVisual?.enemies[e.id];
      const w = lerpNode(fromId, toId);
      const s = this.toScreen(w.x, w.y);
      const bob = hopping ? -walkBob(this.animT, bobAmp * 1.1) : idleBob(this.time, phaseFromId(e.id), bobAmp * 0.25);
      pieces.push({
        depth: isoDepth(w.x, w.y),
        order: 1,
        draw: () => drawSprite(ctx, "poacher", s.x, s.y + nodeR * 0.05 + bob, spriteH, e.facing),
      });
    }
    // Hunter — tween along edge; carried rabbit follows smoothly
    {
      const toId = this.state.player;
      const fromId = this.prevVisual?.player;
      const w = lerpNode(fromId, toId);
      const ps = this.toScreen(w.x, w.y);
      const bob = hopping ? -walkBob(this.animT, bobAmp * 1.25) : 0;
      pieces.push({
        depth: isoDepth(w.x, w.y),
        order: 2,
        draw: () => {
          drawSprite(ctx, "hunter", ps.x, ps.y + nodeR * 0.05 + bob, spriteH, this.playerFacing);
          if (this.state.carried.length) {
            const carryBob = idleBob(this.time, 1.1, idleAmp * 0.55);
            drawSprite(
              ctx,
              "rabbit",
              ps.x + spriteH * 0.22,
              ps.y - spriteH * 0.35 + bob + carryBob,
              spriteH * 0.42,
              this.playerFacing,
            );
          }
        },
      });
    }
    pieces.sort((a, b) => a.depth - b.depth || a.order - b.order);
    for (const p of pieces) p.draw();

    // Camp flag AFTER sprites — beside birth/camp, never a foot disc
    const campId = this.state.safe;
    if (campId && (this.fogVisible.has(campId) || this.state.player === campId)) {
      const sp = this.state.graph.nodes[campId];
      if (sp) {
        const ss = this.toScreen(sp.x, sp.y);
        drawCamp(ctx, ss.x, ss.y - nodeR * 0.15, nodeR * 1.1);
      }
    }
  }
}
