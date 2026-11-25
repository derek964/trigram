import { track } from "../analytics";
import { AD_PACING } from "../game/ad-config";
import { onLevelClear, pacing, savePacing } from "../game/ad-pacing";
import { showInterstitial, showRewardedVideo, type RewardedScene } from "../game/ad-service";
import { playSfx, rumble, VIBE } from "../game/audio";
import { ChaseView3D, type AnimalType, type Frame } from "./view3d";
import { CHASE_LEVELS } from "./levels";
import {
  analyze,
  key as stateKey,
  step as cellStep,
  thiefPlan,
  thiefStep,
  WAIT,
  type Analysis,
  type ThiefHop,
  blockOf,
  dangerCells,
  walkableCells,
  floorDist,
  initial,
  move,
  parse,
  safeNext,
  solve,
  type Board,
  type Dir,
  type State,
} from "./logic";

const SAVE = "save-animals-chase-v1";
const KIND_IDS: AnimalType[] = ["pup", "cat", "rabbit", "fox", "panda", "chick"];
const ANIMAL_NAME: Record<string, string> = { pup: "小狗", cat: "小猫", rabbit: "小兔", fox: "小狐狸", panda: "熊猫", chick: "小鸡" };
const BLOCK_TEXT: Record<string, string> = {
  wall: "那边是墙",
  queue: "队伍挡住了路 —— 可以点「撤回」",
  thief: "抓宠贼站在那里",
  "cage-closed": "还有小动物没救出来，南门先不开",
};

interface Save {
  cleared: Record<number, number>; // level -> best steps
}

function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE);
    if (raw) return { ...(JSON.parse(raw) as Partial<Save>), cleared: (JSON.parse(raw) as Partial<Save>).cleared ?? {} };
  } catch {
    /* ignore */
  }
  return { cleared: {} };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class ChaseMode {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private view: ChaseView3D;
  private board!: Board;
  private state!: State;
  private prev: State | null = null;
  private hist: State[] = [];
  private levelIdx = 0;
  private steps = 0;
  private animT = 1;
  private time = 0;
  private hint: number[] = [];
  private facing = -Math.PI / 2;
  private thiefFacing = Math.PI / 2;
  private save = loadSave();
  private minSteps = 0;
  private nearWinOffered = false;
  private bumpT = 0;
  private shakeT = 0;
  private winAnimT = -1;
  private sfx = true;
  private vib = true;
  private ui: Record<string, HTMLElement> = {};
  private active = false;
  private touch: { x: number; y: number } | null = null;

  constructor() {
    this.root = el("section", "chase hidden");
    this.root.id = "chase-screen";
    this.canvas = el("canvas", "chase-canvas");
    this.view = new ChaseView3D(this.canvas);
    this.build();
    document.querySelector("#app")!.appendChild(this.root);
    this.bind();
    try {
      const p = JSON.parse(localStorage.getItem("save-animals-shelter-v1") ?? "{}") as { sfx?: boolean; vib?: boolean };
      this.sfx = p.sfx !== false;
      this.vib = p.vib !== false;
    } catch {
      /* ignore */
    }
    requestAnimationFrame((t) => this.loop(t, t));
  }

  private build(): void {
    const top = el("div", "chase-top");
    this.ui.level = el("div", "level-chip", "追击夜 1");
    this.ui.count = el("div", "objective-chip", "已救 0/1");
    const home = el("button", "ghost icon", "关卡") as HTMLButtonElement;
    home.onclick = () => this.openMenu();
    top.append(this.ui.level, this.ui.count, home);
    this.ui.deprecated = el("div", "chase-deprecated", "已废弃／仅对照");
    this.ui.deprecated.setAttribute("role", "status");
    this.ui.tip = el("div", "chase-tip");
    this.ui.toast = el("div", "toast hidden");
    this.ui.near = el("button", "chase-near hidden", "快到南门了 · 看视频让贼停 1 回合") as HTMLButtonElement;
    this.ui.near.onclick = () => this.reward("freeze");
    const dock = el("div", "chase-dock");
    const mk = (txt: string, fn: () => void, cls = "ghost dock-btn"): HTMLButtonElement => {
      const b = el("button", cls, txt) as HTMLButtonElement;
      b.type = "button";
      b.onclick = fn;
      return b;
    };
    this.ui.undo = mk("撤回", () => this.undo(1));
    dock.append(
      this.ui.undo,
      (() => { const b = mk("等待", () => this.playing() && this.tryMove(WAIT)); b.dataset.theseusWait = "1"; b.classList.add("chase-wait-btn"); return b; })(),
      mk("重开", () => this.restart()),
      mk("提示 ▶", () => this.reward("hint")),
    );
    this.ui.lost = el("div", "chase-lost hidden");
    this.ui.lost.append(el("span", "", "这样已经逃不掉了"));
    const lu = el("button", "primary", "撤回一步") as HTMLButtonElement;
    lu.type = "button";
    lu.onclick = () => this.undo(1);
    this.ui.lost.append(lu);
    const stage = el("div", "chase-stage");
    stage.append(this.canvas, this.ui.tip, this.ui.toast, this.ui.near, this.ui.lost);

    // menu
    this.ui.menu = el("div", "overlay chase-overlay hidden");
    const mp = el("div", "panel");
    mp.append(
      el("p", "kicker", "已废弃／仅对照 · Theseus"),
      el("h2", "", "追击夜"),
      el("p", "lead", "内部对照用，非主玩法。主线请走 Hitman GO（?mode=go）。标题无入口。"),
    );
    this.ui.grid = el("div", "chase-grid");
    const back = mk("回到夜巡（原 30 关）", () => this.close(), "ghost");
    mp.append(this.ui.grid, back);
    this.ui.menu.append(mp);

    // result panel
    this.ui.result = el("div", "overlay chase-overlay hidden");
    const rp = el("div", "panel pop");
    this.ui.rKick = el("p", "kicker");
    this.ui.rTitle = el("h2");
    this.ui.rSub = el("p", "lead");
    this.ui.rRow1 = el("div", "row");
    this.ui.rRow2 = el("div", "row");
    rp.append(this.ui.rKick, this.ui.rTitle, this.ui.rSub, this.ui.rRow1, this.ui.rRow2);
    this.ui.result.append(rp);

    // ad mock
    this.ui.ad = el("div", "overlay chase-overlay hidden");
    const ap = el("div", "panel ad");
    this.ui.adTitle = el("h2", "", "观看视频");
    ap.append(el("p", "kicker", "激励视频占位"), this.ui.adTitle, el("div", "ad-box", "激励视频占位 · 浏览器模拟约 1 秒"));
    this.ui.ad.append(ap);

    this.root.append(top, this.ui.deprecated, stage, dock, this.ui.menu, this.ui.result, this.ui.ad);
  }

  private bind(): void {
    document.addEventListener(
      "keydown",
      (e) => {
        if (!this.active) return;
        const m: Record<string, Dir> = { ArrowUp: 0, w: 0, W: 0, ArrowRight: 1, d: 1, D: 1, ArrowDown: 2, s: 2, S: 2, ArrowLeft: 3, a: 3, A: 3 };
        e.stopPropagation();
        if (e.key === "z" || e.key === "Z" || e.key === "Backspace") return this.undo(1);
        if (e.key === " " && this.playing()) {
          e.preventDefault();
          return this.tryMove(WAIT);
        }
        const d = m[e.key];
        if (d !== undefined && this.playing()) {
          e.preventDefault();
          this.tryMove(d);
        }
      },
      true,
    );
    this.canvas.addEventListener("pointerdown", (e) => {
      this.touch = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !this.board) return;
      this.hover = this.view.pick(e.clientX, e.clientY);
    });
    this.canvas.addEventListener("pointerleave", () => (this.hover = -1));
    this.canvas.addEventListener("pointerup", (e) => {
      if (!this.touch || !this.playing()) return;
      const dx = e.clientX - this.touch.x;
      const dy = e.clientY - this.touch.y;
      this.touch = null;
      if (Math.hypot(dx, dy) > 24) {
        this.tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
        return;
      }
      // tap: step one cell toward the tapped cell
      const cell = this.view.pick(e.clientX, e.clientY);
      if (cell < 0) return;
      const gx = cell % this.board.w;
      const gy = Math.floor(cell / this.board.w);
      const px = this.state.p % this.board.w;
      const py = Math.floor(this.state.p / this.board.w);
      const ddx = gx - px;
      const ddy = gy - py;
      if (ddx === 0 && ddy === 0) return this.tryMove(WAIT); // tap yourself = 等待
      this.tryMove(Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? 1 : 3) : ddy > 0 ? 2 : 0);
    });
  }

  private playing(): boolean {
    return (
      this.active &&
      this.state.status === "play" &&
      this.ui.menu!.classList.contains("hidden") &&
      this.ui.result!.classList.contains("hidden") &&
      this.ui.ad!.classList.contains("hidden")
    );
  }

  open(level?: number): void {
    this.active = true;
    this.root.classList.remove("hidden");
    document.getElementById("go-screen")?.classList.add("hidden");
    document.getElementById("title-screen")?.classList.add("hidden");
    this.ui.deprecated?.classList.remove("hidden");
    if (this.ui.deprecated) this.ui.deprecated.textContent = "已废弃／仅对照";
    this.root.querySelectorAll<HTMLElement>(".chase-wait-btn").forEach((b) => {
      b.style.display = "";
    });
    if (level && level >= 1 && level <= CHASE_LEVELS.length) this.start(level - 1);
    else {
      this.start(this.firstOpen());
      this.openMenu();
    }
    // capture aid: ?mode=chase&level=N&chaseshot=toast shows the wall toast + near-gate banner together
    const mv = new URLSearchParams(location.search).get("chasemoves");
    if (mv) {
      for (const ch of mv) if ("01234".includes(ch)) this.tryMove(Number(ch) as Dir);
      this.animT = 1; // capture aid: land the last move instantly
      this.prev = null;
    }
    if (new URLSearchParams(location.search).get("chaseshot") === "toast") {
      this.ui.near!.classList.remove("hidden");
      this.toast(BLOCK_TEXT.wall!);
      clearTimeout((this.ui.toast as unknown as { _h?: number })._h);
    }
  }

  close(): void {
    this.active = false;
    this.root.classList.add("hidden");
  }

  private firstOpen(): number {
    for (let i = 0; i < CHASE_LEVELS.length; i++) if (!this.save.cleared[i + 1]) return i;
    return 0;
  }

  private openMenu(): void {
    const g = this.ui.grid!;
    g.innerHTML = "";
    CHASE_LEVELS.forEach((L, i) => {
      const b = el("button", "chase-lv" + (this.save.cleared[L.id] ? " done" : ""));
      b.innerHTML = `<b>${L.id}</b><span>${L.name}</span>`;
      b.onclick = () => {
        this.ui.menu!.classList.add("hidden");
        this.start(i);
      };
      g.append(b);
    });
    this.ui.menu!.classList.remove("hidden");
  }

  private start(i: number, retry = false): void {
    this.levelIdx = i;
    const L = CHASE_LEVELS[i]!;
    this.board = parse(L.map);
    this.state = initial(this.board);
    this.prev = null;
    this.hist = [];
    this.steps = 0;
    this.hint = [];
    this.nearWinOffered = false;
    this.winAnimT = -1;
    this.minSteps = solve(this.board, this.state)?.moves.length ?? 0;
    this.followerFacing = [];
    this.analysis = analyze(this.board);
    this.clearLost();
    this.view.setBoard(this.board, this.board.animals.map((_, k) => KIND_IDS[k % KIND_IDS.length] as AnimalType));
    this.ui.level!.textContent = `追击夜 ${L.id} · ${L.name}`;
    this.ui.tip!.textContent = L.hint;
    this.ui.tip!.classList.remove("hidden");
    this.ui.near!.classList.add("hidden");
    this.ui.result!.classList.add("hidden");
    this.sync();
    track(retry ? "level_retry" : "level_start", { mode: "chase", level: L.id });
  }

  private restart(): void {
    this.start(this.levelIdx, true);
  }

  private tryMove(d: Dir): void {
    const why = blockOf(this.board, this.state, d);
    if (why) {
      if (why === "over") return;
      if (why === "queue") {
        const c = cellStep(this.board, this.state.p, d)!;
        const k = this.state.q.indexOf(c);
        const name = ANIMAL_NAME[KIND_IDS[this.state.qa[k]! % KIND_IDS.length]!];
        this.toast(`${name}挡着路，绕一圈让它排到你后面`);
      } else this.toast(BLOCK_TEXT[why] ?? "走不了");
      playSfx("bump", this.sfx);
      rumble(this.vib, VIBE.ui);
      this.bumpT = 0.25;
      return;
    }
    const n = move(this.board, this.state, d)!;
    this.hist.push(this.state);
    this.prev = this.state;
    this.state = n;
    this.animT = 0;
    this.steps++;
    if (d !== WAIT) this.facing = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d]!;
    this.hover = -1;
    if (n.t !== null && this.prev.t !== null && n.t !== this.prev.t) {
      const w = this.board.w;
      this.thiefFacing = Math.atan2(Math.floor(n.t / w) - Math.floor(this.prev.t / w), (n.t % w) - (this.prev.t % w));
    }
    this.hint = this.hint[0] === n.p ? this.hint.slice(1) : [];
    this.ui.tip!.classList.add("hidden");
    const picked = n.left.length < this.prev.left.length;
    playSfx(picked ? "rescue" : "step", this.sfx);
    if (picked) rumble(this.vib, VIBE.ui);
    track("move_step", { mode: "chase", level: this.levelIdx + 1, q: n.q.length });
    this.sync();
    if (n.status === "caught") {
      playSfx("catch", this.sfx);
      rumble(this.vib, 120);
      this.shakeT = 0.35;
      track("level_fail", { mode: "chase", level: this.levelIdx + 1, reason: n.reason, steps: this.steps });
      setTimeout(() => this.showFail(), 450);
    } else if (n.status === "win") {
      this.winAnimT = 0;
      setTimeout(() => this.showWin(), 1600);
    } else {
      this.checkNearWin();
      this.checkLost();
    }
  }

  private isLost(s: State): boolean {
    if (s.status !== "play") return false;
    const k = stateKey(s);
    if (this.analysis.winnable.has(k)) return false;
    return !solve(this.board, s, 60000); // off-graph states (e.g. after a freeze reward)
  }

  private checkLost(): void {
    const s = this.state;
    if (!this.isLost(s)) return;
    // P0: surface lost state within ~1s — banner immediately, toast soon after.
    clearTimeout(this.lostTimer);
    this.ui.lost!.classList.remove("hidden");
    this.ui.undo!.classList.add("pulse");
    this.lostTimer = window.setTimeout(() => {
      if (this.state !== s) return;
      this.toast("这样已经逃不掉了");
      track("level_fail", { mode: "chase", level: this.levelIdx + 1, reason: "lost_warning", steps: this.steps });
    }, 200);
  }

  private clearLost(): void {
    clearTimeout(this.lostTimer);
    this.ui.lost?.classList.add("hidden");
    this.ui.undo?.classList.remove("pulse");
  }

  private checkNearWin(): void {
    const s = this.state;
    if (this.nearWinOffered || s.t === null || s.left.length > 0) return;
    if (floorDist(this.board, s.p, this.board.exit) > AD_PACING.rewarded.nearWinCells) return;
    this.nearWinOffered = true;
    this.ui.near!.classList.remove("hidden");
    track("ad_reward_offer", { mode: "chase", level: this.levelIdx + 1, scene: "freeze_near_win" });
  }

  private undo(n: number): void {
    if (!this.active || !this.ui.ad!.classList.contains("hidden")) return;
    this.clearLost();
    let k = 0;
    while (k < n && this.hist.length) {
      this.state = this.hist.pop()!;
      k++;
    }
    if (!k) return this.toast("已经是开局了");
    this.prev = null;
    this.animT = 1;
    this.steps = Math.max(0, this.steps - k);
    this.hint = [];
    this.winAnimT = -1;
    this.ui.result!.classList.add("hidden");
    playSfx("ui", this.sfx);
    track("level_retry", { mode: "chase", level: this.levelIdx + 1, undo: k });
    this.sync();
  }

  private reward(scene: "undo3" | "freeze" | "hint"): void {
    if (scene === "freeze" && this.board.thief === null) return this.toast("这一关没有抓宠贼");
    if (scene === "hint" && this.state.status !== "play") return;
    this.ui.adTitle!.textContent =
      scene === "undo3" ? "看视频 · 退回 3 步" : scene === "freeze" ? "看视频 · 贼停 1 回合" : "看视频 · 亮出接下来 3 格安全路";
    this.ui.ad!.classList.remove("hidden");
    track("ad_reward_offer", { mode: "chase", level: this.levelIdx + 1, scene });
    void showRewardedVideo(scene as RewardedScene, this.levelIdx + 1).then((r) => {
      this.ui.ad!.classList.add("hidden");
      if (r !== "success") return this.toast("没看完，没有奖励");
      if (scene === "undo3") this.undo(AD_PACING.rewarded.undoSteps);
      else if (scene === "freeze") {
        if (this.state.status === "caught") this.undo(1);
        this.state = { ...this.state, frozen: this.state.frozen + AD_PACING.rewarded.freezeThiefTurns };
        this.ui.near!.classList.add("hidden");
        this.toast("抓宠贼愣住了，下一回合不动");
        this.sync();
      } else {
        this.hint = safeNext(this.board, this.state, AD_PACING.rewarded.hintSafeCells);
        if (!this.hint.length) this.toast("这样走不出去了，先撤回几步");
      }
    });
  }

  private showFail(): void {
    const r = this.ui;
    r.rKick!.textContent = "被抓到了";
    r.rTitle!.textContent = "差一点！";
    r.rSub!.textContent = this.state.reason + "。撤回一步换个走法，或看视频补救。";
    r.rRow1!.innerHTML = "";
    r.rRow2!.innerHTML = "";
    const b = (t: string, cls: string, fn: () => void) => {
      const x = el("button", cls, t) as HTMLButtonElement;
      x.type = "button";
      x.onclick = fn;
      return x;
    };
    r.rRow1!.append(b("撤回一步", "primary", () => this.undo(1)), b("重开", "ghost", () => this.restart()));
    r.rRow2!.append(b("看视频退回 3 步", "ghost", () => this.reward("undo3")));
    if (this.board.thief !== null) r.rRow2!.append(b("看视频让贼停 1 回合", "ghost", () => this.reward("freeze")));
    track("ad_reward_offer", { mode: "chase", level: this.levelIdx + 1, scene: "fail" });
    r.result!.classList.remove("hidden");
  }

  private showWin(): void {
    const L = CHASE_LEVELS[this.levelIdx]!;
    const best = this.save.cleared[L.id];
    if (!best || this.steps < best) this.save.cleared[L.id] = this.steps;
    try {
      localStorage.setItem(SAVE, JSON.stringify(this.save));
    } catch {
      /* ignore */
    }
    const stars = this.steps <= this.minSteps ? 3 : this.steps <= this.minSteps * 1.5 ? 2 : 1;
    const r = this.ui;
    r.rKick!.textContent = "送出南门了";
    r.rTitle!.textContent = `带出 ${this.board.animals.length} 只小动物`;
    r.rSub!.textContent = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}  用了 ${this.steps} 步（最少 ${this.minSteps} 步）`;
    r.rRow1!.innerHTML = "";
    r.rRow2!.innerHTML = "";
    const last = this.levelIdx >= CHASE_LEVELS.length - 1;
    const nx = el("button", "primary", last ? "全部通关 · 回关卡" : "下一关") as HTMLButtonElement;
    nx.onclick = () => (last ? this.openMenu() : this.start(this.levelIdx + 1));
    const mn = el("button", "ghost", "关卡") as HTMLButtonElement;
    mn.onclick = () => this.openMenu();
    r.rRow1!.append(mn, nx);
    r.result!.classList.remove("hidden");
    playSfx("rescue", this.sfx);
    track("level_clear", { mode: "chase", level: L.id, steps: this.steps, stars });
    // interstitial: only after the clear screen, paced by AD_PACING (never L1–10 / first session)
    const ok = onLevelClear(pacing(), L.id, Date.now());
    savePacing();
    if (ok) {
      track("ad_interstitial_stub", { mode: "chase", level: L.id });
      void showInterstitial(L.id);
    }
  }

  private sync(): void {
    const s = this.state;
    const total = this.board.animals.length;
    this.ui.count!.textContent = `已救 ${total - s.left.length}/${total} · ${this.steps} 步${s.frozen ? " · 贼停住" : ""}`;
    (this.ui.undo as HTMLButtonElement).disabled = this.hist.length === 0;
  }

  private toast(msg: string): void {
    const t = this.ui.toast!;
    t.textContent = msg;
    t.classList.remove("hidden");
    this.ui.tip!.classList.add("hidden");
    clearTimeout((t as unknown as { _h?: number })._h);
    (t as unknown as { _h?: number })._h = window.setTimeout(() => t.classList.add("hidden"), 1500);
  }

  // ---------- drawing (three.js, see view3d.ts) ----------
  private followerFacing: number[] = [];
  private analysis!: Analysis;
  private lostTimer = 0;
  private hover = -1;

  private loop(t: number, last: number): void {
    const dt = Math.min(0.05, (t - last) / 1000);
    this.time += dt;
    this.animT = Math.min(1, this.animT + dt / 0.22);
    this.bumpT = Math.max(0, this.bumpT - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.winAnimT >= 0) this.winAnimT += dt;
    if (this.active && this.board) {
      const r = this.canvas.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w !== this.vw || h !== this.vh) {
        this.vw = w;
        this.vh = h;
        this.view.resize(w, h, devicePixelRatio);
      }
      this.view.render(this.frame());
    }
    requestAnimationFrame((n) => this.loop(n, t));
  }
  private vw = 0;
  private vh = 0;

  private cxy(c: number): [number, number] {
    return [(c % this.board.w) + 0.5, Math.floor(c / this.board.w) + 0.5];
  }

  private lerpCell(a: number | undefined, b: number, f: number): [number, number] {
    const [bx, by] = this.cxy(b);
    if (a === undefined || a === b) return [bx, by];
    const [ax, ay] = this.cxy(a);
    const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    return [ax + (bx - ax) * e, ay + (by - ay) * e];
  }

  /** Point `u` cells along the exit line: 0 = gate cell, <0 = past the gate (south), >0 = back along the queue. */
  private alongLine(line: number[], u: number): [number, number] {
    const [ex, ey] = this.cxy(line[0]!);
    if (u <= 0) return [ex, ey - u];
    const i = Math.min(line.length - 1, Math.floor(u));
    const j = Math.min(line.length - 1, i + 1);
    const [ax, ay] = this.cxy(line[i]!);
    const [bx, by] = this.cxy(line[j]!);
    const k = u - i;
    return [ax + (bx - ax) * k, ay + (by - ay) * k];
  }

  private frame(): Frame {
    const s = this.state;
    const p = this.prev && this.animT < 1 ? this.prev : null;
    const f = this.animT;
    const moving = p ? 1 : 0;
    const followers: Frame["followers"] = [];
    let player: Frame["player"];
    if (this.winAnimT >= 0) {
      // exit ceremony: the whole line files out through the gate
      const line = [s.p, ...s.q];
      const adv = this.winAnimT * 3.2;
      const [px, py] = this.alongLine(line, -adv);
      player = { x: px, y: py, facing: Math.PI / 2, moving: 1 };
      s.q.forEach((_, k) => {
        const u = k + 1 - adv;
        const [x, y] = this.alongLine(line, u);
        const [nx, ny] = this.alongLine(line, u - 0.2);
        followers.push({ x, y, facing: Math.atan2(ny - y, nx - x), moving: 1, kind: KIND_IDS[s.qa[k]! % KIND_IDS.length] as AnimalType, gone: u < -1.6 });
      });
      if (adv > 1.6) player.moving = 0;
    } else {
      const [px, py] = this.lerpCell(p?.p, s.p, f);
      player = { x: px, y: py, facing: this.facing, moving };
      s.q.forEach((c, k) => {
        const from = p ? (p.q[k] ?? p.p) : undefined;
        if (from !== undefined && from !== c) {
          const [ax, ay] = this.cxy(from);
          const [bx, by] = this.cxy(c);
          this.followerFacing[k] = Math.atan2(by - ay, bx - ax);
        }
        const [x, y] = this.lerpCell(from, c, f);
        followers.push({ x, y, facing: this.followerFacing[k] ?? Math.PI / 2, moving, kind: KIND_IDS[s.qa[k]! % KIND_IDS.length] as AnimalType });
      });
    }
    let thief: Frame["thief"] = null;
    if (s.t !== null) {
      let pos: [number, number];
      let mv = 0;
      if (p && p.t !== null && p.t !== s.t) {
        const mid = this.midThief(p);
        pos = f < 0.5 ? this.lerpCell(p.t, mid, f * 2) : this.lerpCell(mid, s.t, (f - 0.5) * 2);
        mv = 1;
      } else pos = this.cxy(s.t);
      thief = { x: pos[0], y: pos[1], facing: this.thiefFacing, moving: mv, frozen: s.frozen > 0 };
    }
    return {
      time: this.time,
      player,
      followers,
      cages: s.left.map((k) => ({ cell: this.board.animals[k]!, kind: KIND_IDS[k % KIND_IDS.length] as AnimalType })),
      thief,
      danger: s.status === "play" && this.winAnimT < 0 ? dangerCells(this.board, s, this.analysis.winnable) : [],
      walkable: s.status === "play" && this.winAnimT < 0 ? walkableCells(this.board, s) : [],
      hints: this.hint,
      thiefHops: this.winAnimT < 0 && s.status === "play" ? thiefPlan(this.board, s) : [],
      previewHops: this.previewHops(),
      exitOpen: s.left.length === 0,
      shake: this.shakeT,
      bump: this.bumpT,
    };
  }

  private previewHops(): ThiefHop[] {
    const s = this.state;
    if (this.hover < 0 || s.status !== "play" || s.t === null || this.animT < 1) return [];
    for (const d of [0, 1, 2, 3, 4] as Dir[]) {
      if (cellStep(this.board, s.p, d) !== this.hover || blockOf(this.board, s, d)) continue;
      return thiefPlan(this.board, s, this.hover);
    }
    return [];
  }

  private midThief(p: State): number {
    // first hop under the classic rule (same as logic.thiefStep)
    return thiefStep(this.board, p.t!, this.state.p);
  }

}
