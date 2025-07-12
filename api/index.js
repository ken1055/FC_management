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

// 高速初期化フラグ
const FAST_MODE = true;

// サーバーを読み込む前にログ出力
console.log("Loading server...", { FAST_MODE });

try {
  const app = require("../server");

  // 高速キャッシュ無効化ミドルウェア
  if (FAST_MODE) {
    app.use((req, res, next) => {
      res.set({
        "Cache-Control":
          "private, no-cache, no-store, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      });
      next();
    });
  } else {
    // 詳細なキャッシュ無効化（通常モード）
    app.use((req, res, next) => {
      res.set({
        "Cache-Control":
          "private, no-cache, no-store, must-revalidate, max-age=0",
        "CDN-Cache-Control":
          "private, no-cache, no-store, must-revalidate, max-age=0",
        "Vercel-CDN-Cache-Control":
          "private, no-cache, no-store, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        ETag: `"force-reload-v${Date.now()}"`,
        "Last-Modified": "Thu, 01 Jan 1970 00:00:00 GMT",
        Vary: "*",
      });
      next();
    });
  }

  // 早期タイムアウト警告
  app.use((req, res, next) => {
    const startTime = Date.now();

    const timeoutWarning = setTimeout(() => {
      console.warn(
        `⚠️ Request taking too long: ${req.method} ${req.url} (${
          Date.now() - startTime
        }ms)`
      );
    }, 15000); // 15秒で警告

    res.on("finish", () => {
      clearTimeout(timeoutWarning);
      const duration = Date.now() - startTime;
      if (duration > 10000) {
        console.warn(
          `🐌 Slow request: ${req.method} ${req.url} took ${duration}ms`
        );
      }
    });

    next();
  });

  // Vercel Functions向けの明示的なハンドラー（デバッグ用）
  console.log("=== Vercel Function Handler Ready ===");

  module.exports = app;
} catch (error) {
  console.error("Error loading server:", error);

  // フォールバック用の最小限のExpress app
  const express = require("express");
  const fallbackApp = express();

  fallbackApp.get("*", (req, res) => {
    res.status(500).json({
      error: "Server initialization failed",
      message: error.message,
      timestamp: new Date().toISOString(),
      suggestion: "Try accessing /emergency or /auth/login directly",
    });
  });

  module.exports = fallbackApp;
}
