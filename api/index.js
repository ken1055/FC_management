// Vercel API Route - メインアプリケーションのプロキシ（改良版）
console.log("=== API Route 開始 ===");
console.log("Timestamp:", new Date().toISOString());
console.log("Environment:", {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

// より安全なアプリケーション読み込み
const timeoutMs = 10000; // 10秒でタイムアウト
let appObject = null;

try {
  console.log("server.js を読み込み中...");

  // データベース初期化を待つ
  const db = require("../db");
  if (!db) {
    throw new Error("データベースモジュールの読み込みに失敗");
  }

  // サーバーアプリケーションを読み込み
  appObject = require("../server");
  console.log("server.js 読み込み完了");

  if (!appObject) {
    throw new Error("server.js からアプリケーションが返されませんでした");
  }

  console.log("API Route 設定完了");
} catch (error) {
  console.error("=== API Route 初期化エラー ===");
  console.error("Error:", error.message);
  console.error("Type:", error.name);

  // スタックトレースは開発環境でのみ出力
  if (process.env.NODE_ENV !== "production") {
    console.error("Stack:", error.stack);
  }
}

// アプリケーションが正しく読み込まれているかチェック
if (appObject) {
  module.exports = appObject;
} else {
  // 緊急フォールバック - より詳細なエラー情報を提供
  const express = require("express");
  const fallbackApp = express();

  // JSON ミドルウェアを追加
  fallbackApp.use(express.json());
  fallbackApp.use(express.urlencoded({ extended: true }));

  fallbackApp.get("*", (req, res) => {
    res.status(500).json({
      success: false,
      error: "Server initialization failed",
      message:
        "サーバーの初期化に失敗しました。システム管理者にお問い合わせください。",
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
    });
  });

  fallbackApp.post("*", (req, res) => {
    res.status(500).json({
      success: false,
      error: "Server initialization failed",
      message:
        "サーバーの初期化に失敗しました。システム管理者にお問い合わせください。",
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
    });
  });

  console.error("緊急フォールバックアプリケーションが起動されました");
  module.exports = fallbackApp;
}
