// Vercel API Route - メインアプリケーションのプロキシ（修正版）
console.log("=== API Route 開始 ===");
console.log("Timestamp:", new Date().toISOString());
console.log("Environment:", {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

try {
  console.log("server.js を読み込み中...");
  const app = require("../server");
  console.log("server.js 読み込み完了");
  
  if (!app) {
    throw new Error("server.js からアプリケーションが返されませんでした");
  }
  
  console.log("API Route 設定完了");
  module.exports = app;
} catch (error) {
  console.error("=== API Route エラー ===");
  console.error("Error:", error);
  console.error("Stack:", error.stack);
  
  // 緊急フォールバック
  const express = require("express");
  const fallbackApp = express();
  
  fallbackApp.get("*", (req, res) => {
    res.status(500).json({
      error: "Server initialization failed",
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack
    });
  });
  
  module.exports = fallbackApp;
}
