# wechat-minigame（占位工程）

用 **微信开发者工具** 打开**本目录**（不是仓库根目录）。没有 AppID 之前不要上传；`game.js` 只画一句占位文案。**可玩关卡仍是仓库根目录的 Vite 网页**（`npm run dev` / `?v=shelter-prelaunch-1`）。

## 有 AppID 之后怎么打开

1. 安装并登录 [微信开发者工具](https://developers.weixin.qq.com/minigame/dev/devtools/download.html)，项目类型选 **小游戏**。
2. 「导入」→ 选中本文件夹 `wechat-minigame/`。
3. 把 `project.config.json` 的 `"appid": "wxYOUR_APPID"` 换成公众平台里的真实 AppID。
4. 编译预览。此时仍是占位画布，直到把 `src/game/*` 迁到 `wx.createCanvas`（对照表见下）。

## 开通后还要贴的 ID

1. 公众平台复制 AppID → `project.config.json`。
2. 若个人主体能开通流量主：把激励 / 插屏广告位 ID 写入 `../src/game/ad-config.ts`。保持 `wxYOUR_*` 开头则**不会**调用真实 SDK。
3. 将网页原型迁到 canvas：

| 网页原型 | 小游戏 |
| --- | --- |
| `#game` Canvas 2D | `wx.createCanvas()` |
| pointer 事件 | `wx.onTouchStart/Move/End` |
| `localStorage` | `wx.setStorageSync`（见 `src/wx-api.ts`） |
| WebAudio | `InnerAudioContext` |
| `navigator.vibrate` | `wx.vibrateShort` / `vibrateLong` |
| DOM HUD | 画在 canvas 上 |
| `track()` → `reportToWeChat` | 公众平台已登记的 `wx.reportAnalytics` |

`game.js` 只是占位入口，不是完整移植。

清单全文：[`docs/wechat-launch-checklist.md`](../docs/wechat-launch-checklist.md)。
