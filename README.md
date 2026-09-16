# 拯救小动物

微信小游戏 **「拯救小动物」** — night-shift volunteer on a pet-shelter floor-plan. Enter at the south gate, free the animal in the **隔离间**, and watch it pathfind out.

**Vite + TypeScript + Canvas 2D**, plus a `wechat-minigame/` scaffold for 微信开发者工具. Progress is stored in `localStorage` under `save-animals-shelter-v1`. Source: [https://github.com/derek964/trigram](https://github.com/derek964/trigram).

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4521?v=shelter-prelaunch-1`.

```bash
npm test
```

Demo: [https://onyx-cipher-3bdv.here.now/?v=shelter-prelaunch-1](https://onyx-cipher-3bdv.here.now/?v=shelter-prelaunch-1)

**WeChat placeholders (no AppID yet):** `wechat-minigame/project.config.json` uses `wxYOUR_APPID`. Ad unit IDs in `src/game/ad-config.ts` are `wxYOUR_REWARD_AD_UNIT_ID` and `wxYOUR_INTERSTITIAL_AD_UNIT_ID` — IDs starting `wxYOUR_` never call a live SDK. Launch notes: [`docs/wechat-launch-checklist.md`](docs/wechat-launch-checklist.md).

## Play

**L1 is full-bright** (no vision disc): tap an **adjacent** floor cell to walk one step, or drag / WASD; hug the animal out. Distant taps do not auto-pathfind. Teaching finger + one-step path preview stay on L1.

**L2 turns on the circular disc** with **soft fog** and **wall silhouettes** outside it, plus the junction chevron (mint direction triangle) and one-step tap preview.

**L3+ is circular vision only:** the lit disc around the volunteer is visible; everything outside is **fully black** (no wall silhouette, no faint maze outline). Teaching arrows are gone — no junction chevron, no finger cue, no path-preview ribbon. Adjacent-only taps, 检修 wall-select, timer/fail, and 偷宠贼 are unchanged. Mint HUD, coral trail, thin walls.

WeChat launch notes for a **personal** 小游戏 account (开通前 vs 有 AppID 之后、流量主限制、软著): [`docs/wechat-launch-checklist.md`](docs/wechat-launch-checklist.md). Scaffold for 微信开发者工具: `wechat-minigame/` (`appid` placeholder `wxYOUR_APPID`). Ad unit placeholders: `src/game/ad-config.ts`.

Analytics debug: open `?debug=1` **or long-press the title logo / HUD brand ~0.65s**. The panel lists the last 20 events (`app_launch`, `level_start`, …) plus **清空**. Events also sit in `localStorage` key `save-animals-analytics-v1`. In `npm run dev`, they print as `console.debug("[analytics]", …)`. No WeChat backend is required.

Title-screen **隐私政策 / 用户协议 / 适龄 8+** are in-game sheets (personal-developer placeholders). Swap in your real name and email before store review.

- **夜巡 L1–10** — L1 teaches move + rescue; L2 adds soft fog + silhouette; L3+ is hard circular FOV (black outside the disc) and adds bait. Hard curve returns from L6+
- **钥匙串 L11–20** — pick up the **值班钥匙**, then open the cage
- **防盗夜 L21–30** — same maze plus a **偷宠贼** with line-of-sight chase
- **监控** — L2+ limited full-map peek; later uses are a rewarded-ad placeholder. Seeing the goal is never gated behind an ad (L1 is fully lit; L2 keeps wall silhouettes under fog; L3+ hides the maze outside the disc until you peek).
- **检修口** — from L2, tap **检修** to enter wall-select, then tap a highlighted wall. Floor taps only walk. Cancel by tapping 检修 again; a charge is spent only after the hole opens.
- **撤销** — free one-step undo (L2+), on the bottom bar
- **看视频** — IAA stub restores 监控 / 检修 / revive. No interstitial on L1–5 (or L1–9); chapter-end only at L10 / L20 / L30
- **音效 / 震动 / 重开** — in the **暂停** menu (not always-visible top buttons). Toggles persist in `localStorage` (both **on** by default). HUD clicks play a short UI tick + light vibe; steps only tick on **cell enter**. 音效关 mutes WebAudio beeps; 震动关 disables `navigator.vibrate`.

On a clear, a hug/scale bump + particles, then the animal walks itself to the south gate.

- **接近** — compact top-bar objective (值班钥匙, then 隔离间) plus remaining-time countdown when a level has a hard limit. Camera follows the volunteer in the playfield under that chrome, not under a stacked HUD.
- **足迹** — a continuous ribbon through walked cell centers. No decorative zone nameplates (猫房 / 医务 / 犬舍).
- **时间** — L1–5 never fail on the clock (stars can still use par time). L6+ show `剩余 MM:SS`, warn in the last 10 seconds, and fail with「时间到了，还差×格。」The clock pauses during tips, the pause menu, and ads. Thief catches still say so.

Query params for captures: `?shot=peek&level=N`, `?shot=walk&level=1` (L1 no fog), `?shot=walk&level=2` (soft disc + silhouette), `?shot=walk&level=3` (hard black FOV), `?shot=path&level=1`, `?shot=hud&level=2`, `?shot=finger&level=1`, `?shot=key&level=11`, `?shot=chaser&level=21`, `?shot=tip&level=1`, `?shot=clear&level=1`.

Stills: `/previews/l01_nofog_rescue.png`, `/previews/l02_vision_disc.png`, `/previews/l02_hud_jiejin_jianxiu.png`, `/previews/l01_path_preview_line.png`, `/previews/l01_floor_no_zones.png`, `/previews/debug_analytics_panel.png` (`?debug=1` 埋点面板).

## Pattern encoding

The generator is **not** “bigger grid only”. L1 is a 9×9 one-turn tutorial; L2–3 are 11×11; the hard 15×15 curve returns from L6. Each `generateMaze` reject-samples up to 900 seeds until `assertWinding` + `assertPatterns` pass.

| Pattern | Levels | How it is encoded |
| --- | --- | --- |
| **A teach a turn** | L1 | `gridN=9`, braid `0.02`, `trimLongDeadEnds(≤2)`. ≥1 turn, longest dead-end ≤3. No away-is-near. Short hop floor so a new player can clear in ~20–40s. |
| **B long bait** | L2–3 | `gridN=11`. Reject unless a dead-end is **≥ ~30%** of the shortest hop count (and no 1-cell stubs). |
| **C away-is-near** | L2–30 | Reject unless the shortest path has a degree≥3 junction whose **next hop moves away from the origin**. |
| **D see-then-reach** | L4–10 | `gridN=13` then **15 from L6**. Prefer E/W isolation door. You see 隔离间 early, but the graph is still far. |
| **E key opposite door** | L11–20 | `gridN=15`, E/W door bias. **值班钥匙** is sampled on the opposite half from the isolation mouth. |
| **F 偷宠贼** | L21–30 | `gridN=15`, LOS chase. Hop floor stays high. |

Shared constraints on every seed: square odd grid, exactly one isolation door (**never south**), no south highway into 隔离间, `minCellHops` / `minGeoSteps`, `maxAlignedInward ≤ 2`, clear corridor width (`cellSize` 1.22, `wallWidth` 0.38 collision, `MIN_CORRIDOR` 0.82). Drawn walls are thinner (`WALL_DRAW_WIDTH` 0.16) than the old ~0.50 slab stack.

## 偷宠贼 AI

Chapter 3 only. Same move speed as the player (`SPEED`).

1. **Patrol** — pick a random cell center on the walkable graph; follow `shortestPath`.
2. **Chase** — if the vision cone (~82°) and a wall-aware ray hit the player, repath every 0.18s toward the player.
3. **Lost** — after LOS breaks, keep pursuing for ~1.35s, then return to patrol.
4. **Fail** — touching the player opens the revive IAA stub. Spawn is on the far side of the maze so L21 is not a start-kill.

Static solvability is gated (south gate → key if needed → center). Chase is a skill check, not a lock.

## Tests

```bash
npm test
npm run sim:levels
```

`npm test` is the CI gate for **structure**, ads, audio/haptic, and analytics:

- All 30 levels: start → 隔离间 is solvable; key levels start → 值班钥匙 → 隔离间; no south highway; isolation door is never on the south wall; patterns A–F; min path / detour (`minCellHops`, `minGeoSteps`, turns).
- Mock IAA bus + **ad service**: L1–9 clear never requests interstitial; L10 / L15 / L20 / L25 / L30 emit `interstitial`; rewarded mock can succeed / fail / cancel; death on L11+ emits `revive_offer`.
- Audio/haptic: unmuted SFX stubs fire; mute is a no-op; rumble respects the vibe flag; every HUD button id has `onUi` wiring.
- Analytics: `track()` buffers + optional `wx.reportAnalytics` stub; required event names must appear in `game.ts` / `main.ts`.
- 防盗夜: 隐藏草 exists, breaks LOS, and a sitting player in open LOS can still be caught.

`npm run sim:levels` is the **fake-player** gate (headless, no browser). It writes `docs/sim-report.md`:

1. Optimal shortest-path agent clears all 30 (key-before-cage on L11–30). Thief is frozen for this pass.
2. Greedy-human agent (center-biased DFS) reports `n_extra` vs optimal; on L21–30 the thief is live and deaths are counted.
3. Thief catch + 隐藏草 LOS checks must pass on L21–30 or the command exits 1.

### What humans still blind-test

Automation does not cover analog-stick feel, 检修口 tap targeting, 监控 camera lerp, the escort ceremony, or a real WeChat rewarded-ad SDK. Play L1 / L11 / L21 on a phone once per visual rebuild. Open `?debug=1` to confirm analytics without 公众平台.

## Build

`vite.config.ts` sets `base: './'` so hashed assets load from a here.now (or any) site root.

```bash
npm run build
npm run preview
```

Pack `dist/` with `index.html` at the archive root:

```bash
tar -C dist -czf save-animals-dist.tar.gz .
```

## Later (not this pass)

- Multi-animal ordering puzzles
- Dynamic closing-door timer
- Real WeChat rewarded-ad SDK after AppID + 流量主 (the service already calls `createRewardedVideoAd` when unit IDs are real)
