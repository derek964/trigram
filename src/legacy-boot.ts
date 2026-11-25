import { ChaseMode } from "./chase/chase-ui";
import { Game } from "./game/game";
import { GoMode } from "./go/go-ui";

/** Older playtest modes. Not used by the default page. */
export function bootLegacy(mode: string, qp: URLSearchParams): void {
  document.body.classList.remove("walk-mode");
  const canvas = document.querySelector<HTMLCanvasElement>("#game");
  if (!canvas) throw new Error("missing canvas");
  const game = new Game(canvas);
  const chase = new ChaseMode();
  const go = new GoMode();
  if (mode === "chase") {
    chase.open(Number(qp.get("level") ?? "0") || undefined);
  } else if (mode === "go") {
    const startBtn = document.querySelector<HTMLButtonElement>("#btn-start");
    if (startBtn) startBtn.onclick = () => go.open();
    const levelIdx = Math.max(0, Number(qp.get("level") ?? "1") - 1) || 0;
    go.open(levelIdx);
  } else {
    document.getElementById("title-screen")?.classList.remove("hidden");
  }
  Object.assign(window, { __saveAnimals: game, __chase: chase, __go: go });
}
