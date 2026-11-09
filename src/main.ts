import "./style.css";
import { track } from "./analytics";
import { mountDebugPanel } from "./debug-panel";
import { WalkMode } from "./walk/play";

const qp = new URLSearchParams(location.search);
const mode = qp.get("mode");

track("app_launch", { v: mode === "go" || mode === "chase" || mode === "shelter" ? "legacy" : "freewalk-maze" });
mountDebugPanel();

void boot();

async function boot(): Promise<void> {
  if (mode === "go" || mode === "chase" || mode === "shelter") {
    const { bootLegacy } = await import("./legacy-boot");
    bootLegacy(mode, qp);
    return;
  }
  document.body.classList.add("walk-mode");
  const walk = new WalkMode();
  walk.open();
  Object.assign(window, { __walk: walk });
}
