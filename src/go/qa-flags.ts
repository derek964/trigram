/**
 * Dev/QA query flags. Not player-facing progression cheats in production UX —
 * forceChase only bypasses same-S explore unlock so 测试 can verify chase
 * without grinding explore.
 *
 *   ?mode=go&level=2&forceChase=1
 */
export function forceChaseEnabled(search = typeof location !== "undefined" ? location.search : ""): boolean {
  try {
    const v = new URLSearchParams(search).get("forceChase");
    return v === "1" || v === "true" || v === "yes";
  } catch {
    return false;
  }
}
