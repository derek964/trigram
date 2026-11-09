import "./style.css";
import { track } from "./analytics";
import { mountDebugPanel } from "./debug-panel";
import { Game } from "./game/game";
import { ChaseMode } from "./chase/chase-ui";
import { GoMode } from "./go/go-ui";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("missing canvas");

track("app_launch", { v: "go-p1-merge" });
const game = new Game(canvas);
mountDebugPanel();
void game;
/** Kept for internal ?mode=chase compare only — no title CTA. */
const chase = new ChaseMode();
const go = new GoMode();

const startBtn = document.querySelector<HTMLButtonElement>("#btn-start");
if (startBtn) {
  startBtn.textContent = "开始救援 · 猎人森林";
  startBtn.onclick = () => go.open();
}
// Old shelter continue is not the P1 play path
document.querySelector("#btn-continue")?.classList.add("hidden");
document.querySelector("#btn-continue")?.setAttribute("aria-hidden", "true");

const qp = new URLSearchParams(location.search);
const mode = qp.get("mode");
if (mode === "chase") {
  chase.open(Number(qp.get("level") ?? "0") || undefined);
} else {
  // Default home and ?mode=go → Hitman GO (1-indexed level query)
  const levelIdx = Math.max(0, Number(qp.get("level") ?? "1") - 1) || 0;
  go.open(levelIdx);
}
Object.assign(window, { __saveAnimals: game, __chase: chase, __go: go });
