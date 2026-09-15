import { ANALYTICS_VIEW, clearEvents, onAnalytics, recentEvents, type AnalyticsEvent } from "./analytics";

function qs(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(sel);
  return el;
}

function fmt(ev: AnalyticsEvent): string {
  const when = new Date(ev.t).toLocaleTimeString("zh-CN", { hour12: false });
  const keys = Object.keys(ev.props);
  const props = keys.length
    ? " " + keys.map((k) => `${k}=${String(ev.props[k])}`).join(" ")
    : "";
  return `${when}  ${ev.event}${props}`;
}

function render(list: AnalyticsEvent[]): void {
  const ol = qs("#debug-log");
  const empty = qs("#debug-empty");
  ol.innerHTML = "";
  const rows = list.slice().reverse();
  empty.classList.toggle("hidden", rows.length > 0);
  for (const ev of rows) {
    if (ev.event === "__clear") continue;
    const li = document.createElement("li");
    li.textContent = fmt(ev);
    ol.appendChild(li);
  }
}

function showPanel(): void {
  qs("#debug-panel").classList.remove("hidden");
  render(recentEvents(ANALYTICS_VIEW));
}

function hidePanel(): void {
  qs("#debug-panel").classList.add("hidden");
}

function bindLongPress(el: Element | null, ms: number, fn: () => void): void {
  if (!el) return;
  let timer = 0;
  const start = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
  const cancel = () => window.clearTimeout(timer);
  el.addEventListener("pointerdown", start);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
}

/** Hidden by default. Open with `?debug=1` or a 0.65s long-press on the logo. */
export function mountDebugPanel(): void {
  const panel = document.querySelector("#debug-panel");
  if (!panel) return;
  qs("#btn-debug-clear").onclick = () => {
    clearEvents();
    render([]);
  };
  qs("#btn-debug-close").onclick = () => hidePanel();
  bindLongPress(document.querySelector(".brand"), 650, showPanel);
  bindLongPress(document.querySelector("#title-art"), 650, showPanel);
  bindLongPress(document.querySelector("#title-screen h1"), 650, showPanel);
  onAnalytics((_ev, all) => {
    if (!qs("#debug-panel").classList.contains("hidden")) render(all);
  });
  const params = new URLSearchParams(location.search);
  if (params.get("debug") === "1" || params.get("shot") === "debug") showPanel();
}
