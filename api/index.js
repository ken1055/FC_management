const app = require("../server");

// Vercel Functions用のログ
console.log("API Function starting...");

// エラーハンドリングの追加
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

module.exports = app;
