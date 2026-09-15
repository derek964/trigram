/**
 * Placeholder entry for 微信开发者工具.
 * This is NOT the playable game — play the Vite prototype at the repo root until AppID exists.
 * After 开通: paste AppID in project.config.json, port src/game onto wx.createCanvas (see README).
 */
const info = {
  title: "拯救小动物",
  appid: "wxYOUR_APPID",
  rewardAdUnitId: "wxYOUR_REWARD_AD_UNIT_ID",
  interstitialAdUnitId: "wxYOUR_INTERSTITIAL_AD_UNIT_ID",
};

console.log("[拯救小动物] 小游戏占位入口", info);

const sys = typeof wx !== "undefined" && wx.getSystemInfoSync ? wx.getSystemInfoSync() : { windowWidth: 375, windowHeight: 667 };
const canvas = typeof wx !== "undefined" && wx.createCanvas ? wx.createCanvas() : null;
if (canvas) {
  canvas.width = sys.windowWidth;
  canvas.height = sys.windowHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#c8eadb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1f6b5a";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("拯救小动物", canvas.width / 2, canvas.height / 2 - 16);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#4a7a6c";
  ctx.fillText("粘贴 AppID 后，把网页原型迁到 wx canvas", canvas.width / 2, canvas.height / 2 + 14);
}
