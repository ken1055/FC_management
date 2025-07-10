const app = require("../server");

// Vercel Functions用のログ
console.log("API Function starting...");
console.log("Timestamp:", new Date().toISOString());

// エラーハンドリングの追加
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Vercel Functions向けの明示的なハンドラー（デバッグ用）
console.log("=== Vercel Function Handler Ready ===");

module.exports = app;
