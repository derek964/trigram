import "./style.css";
import { track } from "./analytics";
import { mountDebugPanel } from "./debug-panel";
import { Game } from "./game/game";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("missing canvas");

track("app_launch", { v: "shelter-prelaunch-1" });
const game = new Game(canvas);
mountDebugPanel();
void game;
Object.assign(window, { __saveAnimals: game });
