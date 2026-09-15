# 拯救小动物 · 微信小游戏上线清单（个人主体）

本仓库是 **Vite + Canvas 2D 网页原型**。真正上微信请申请 **小游戏**（不要做成小程序 web-view）。

**主体：个人，不是企业。** 本清单不会替你注册微信账号，也不填写真实 AppID。

### 个人主体要点（先读）

| | 个人小游戏 |
| --- | --- |
| 基础发布（审核通过后上线） | **可以** |
| 公众平台 → **统计 / 数据分析**（DAU、来源、停留） | **可以** |
| 自定义埋点 `wx.reportAnalytics` | **可以**（须先在后台登记事件名） |
| **流量主 / 激励视频 / 插屏** | **可能被限制。** 先在公众平台「流量主」页核对当期规则，**不要默认 IAA 能出钱**。代码里的看视频只是 mock / 占位。 |
| 虚拟支付 / IAP | **通常不可用。** 本游戏按 IAA 优先，本来也不做内购，这点可接受。 |
| 软著 | 游戏类目 **多半仍要**，个人主体也不豁免。这是你自己跑的流程。 |
| 本原型 `?debug=1` | **与是否开通主体无关。** 没有 AppID 也能核对 `app_launch` / `level_start` 等事件。 |

---

## 开通前就能做完（现在仓库里已具备）

- [x] 关卡、手感、音效/震动、埋点 `track()`、`?debug=1` 面板
- [x] IAA **服务层**：`src/game/ad-service.ts`（网页 1 秒 mock；有 `wx` 且单位 ID 不是占位符时走 `createRewardedVideoAd` / `createInterstitialAd`）
- [x] 广告位占位：`src/game/ad-config.ts` 的 `REWARD_AD_UNIT_ID`、`INTERSTITIAL_AD_UNIT_ID`
- [x] 插屏关卡：仅 **L10 / L15 / L20 / L25 / L30** 过关请求插屏；**L1–9 永不请求**
- [x] 激励视频：监控用尽、检修用尽、L11+ 偷宠贼失败复活
- [x] 隐私政策 / 用户协议 / 适龄 8+ 文案（标题页入口，个人开发者占位）
- [x] `wechat-minigame/` 开发者工具占位工程（`appid: wxYOUR_APPID`）
- [ ] 你本人：软件著作权（游戏类目通常仍要，个人主体也不豁免）
- [ ] 你本人：隐私政策换成真实姓名 + 邮箱后再提交审核

浏览器里测 mock 广告：玩到监控次数用尽点「看视频」，或改代码 `setAdMock({ result: "cancel" })` 跑 `npm test`。

---

## 1. 小游戏 vs 小程序

| | 微信小游戏 | 微信小程序 |
| --- | --- | --- |
| 适合 | 关卡、触摸、Canvas、IAA | 工具、内容、表单 |
| 本项目 | **走小游戏** | 不要把本游戏塞进小程序 web-view |

类目：游戏 → 休闲 / 益智。名称「拯救小动物」需与软著一致。

## 2. 开通路径（个人小游戏）

按这个顺序，不要跳：

1. **注册** — 微信公众平台 → 注册 **小游戏** → 主体选 **个人**（不要选企业、不要当小程序做）。
2. **拿到 AppID** — 公众平台首页 / 开发管理里复制 AppID，粘进 `wechat-minigame/project.config.json` 的 `appid`（现在是占位 `wxYOUR_APPID`）。
3. **看数据** — 公众平台左侧 **统计**（有的后台叫「数据分析」）：DAU、来源、停留。这是平台标准报表，个人主体可用。
4. **自定义埋点** — 统计 / 数据 → **自定义分析**，把 `src/analytics.ts` 里的 `TRACKED_EVENTS` 逐条登记。真机才会走 `wx.reportAnalytics`（网页原型走 `reportToWeChat` 空桥 + `?debug=1` 面板）。
5. **流量主（可选、可能没有）** — 打开「流量主」，看个人主体能不能建激励视频 / 插屏。能开通再把广告位 ID 贴进 `src/game/ad-config.ts`；不能就保持 `wxYOUR_*` 占位，游戏继续用 mock，**先当免费游戏发**。
6. **软著 + 隐私** — 游戏类目准备软著；标题页隐私/协议换成你的实名和邮箱后再提审。

没有 AppID 时：打开网页 `?debug=1`（或长按标题 Logo）即可验埋点，不必等注册。有 AppID 后用微信开发者工具打开 `wechat-minigame/`（见该目录 README）。

## 3. 广告怎么接（代码已经按此形状写好）

网页：`showRewardedVideo` / `showInterstitial` 约 1 秒后按 mock 结果 resolve（`success` / `fail` / `cancel`）。

微信：`wx.createRewardedVideoAd({ adUnitId })`、`wx.createInterstitialAd({ adUnitId })`。

锁定规则：

- L1–9：不请求插屏
- L10 / L15 / L20 / L25 / L30 过关：插屏
- L11+ 被偷宠贼抓住：激励复活
- 监控 / 检修用尽：激励补次数（L2+）

## 4. Vite 网页 → 微信小游戏

1. 主画布对应 `#game`。
2. HUD 目前是 DOM → Canvas 或极薄原生组件。
3. `localStorage` → `wx.setStorageSync`（`src/wx-api.ts` 已做分支）。
4. WebAudio → InnerAudioContext；`navigator.vibrate` → `wx.vibrateShort`（`vibrateNative` 已做分支）。
5. 触摸 → `wx.onTouchStart/Move/End`。
6. 不要把 `dist/` 当小游戏包直接上传。

## 5. 上线前再验

- [ ] `npm test` 全绿
- [ ] `?debug=1` 能看到 `app_launch` → `level_start`
- [ ] 标题页能打开隐私 / 协议 / 适龄
- [ ] mock 激励：成功发奖、取消不发奖
- [ ] L1 全亮、L2 圆盘+墙轮廓
