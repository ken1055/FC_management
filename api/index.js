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

// サーバーを読み込む前にログ出力
console.log("Loading server...");

try {
  const app = require("../server");

  // キャッシュ無効化ミドルウェアを最初に追加
  app.use((req, res, next) => {
    // すべてのレスポンスに強力なキャッシュ無効化ヘッダーを設定
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
    });
  });

  module.exports = fallbackApp;
}
