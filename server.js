const express = require("express");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const path = require("path");

const app = express();

// Vercel環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const port = process.env.PORT || 3000;
const disableLayouts = true; // 強制的にレイアウト無効化

console.log("=== サーバー起動 ===");
console.log("Environment:", {
  isVercel,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET ? "設定済み" : "未設定",
  disableLayouts: disableLayouts,
});

// 重要なエラーハンドリング
process.on("uncaughtException", (err) => {
  console.error("=== Uncaught Exception ===");
  console.error(err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("=== Unhandled Rejection ===");
  console.error("Promise:", promise);
  console.error("Reason:", reason);
});

// 基本設定
try {
  console.log("ビューエンジン設定中...");
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  console.log("ビューエンジン設定完了");
} catch (error) {
  console.error("ビューエンジン設定エラー:", error);
}

// 静的ファイル設定（ルートパスでの競合を回避）
try {
  console.log("静的ファイル設定中...");
  app.use(
    "/static",
    express.static(path.join(__dirname, "public"), {
      maxAge: isVercel ? "1d" : 0,
    })
  );
  // アップロードファイル用の設定
  app.use(
    "/uploads",
    express.static(path.join(__dirname, "uploads"), {
      maxAge: isVercel ? "1d" : 0,
    })
  );
  console.log("静的ファイル設定完了");
} catch (error) {
  console.error("静的ファイル設定エラー:", error);
}

// レイアウト設定
if (!disableLayouts) {
  try {
    console.log("レイアウト設定中...");
    const expressLayouts = require("express-ejs-layouts");
    app.use(expressLayouts);
    app.set("layout", "layout");

    // デフォルト変数の設定
    app.use((req, res, next) => {
      res.locals.title = res.locals.title || "代理店管理システム";
      res.locals.session = req.session || {};
      next();
    });

    console.log("レイアウト設定完了");
  } catch (error) {
    console.error("レイアウト設定エラー:", error);
  }
} else {
  console.log("レイアウト機能は無効化されています");

  // レイアウト無効時のデフォルト変数設定
  app.use((req, res, next) => {
    res.locals.title = res.locals.title || "代理店管理システム";
    res.locals.session = req.session || {};
    res.locals.layout = false;
    next();
  });
}

// ミドルウェア設定
try {
  console.log("ミドルウェア設定中...");
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  console.log("ミドルウェア設定完了");
} catch (error) {
  console.error("ミドルウェア設定エラー:", error);
}

// セッション設定
try {
  console.log("セッション設定中...");

  // セッションシークレットの検証
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret === "emergency-fallback-secret-key") {
    console.warn("⚠️  SESSION_SECRETが未設定または危険なデフォルト値です");
    if (process.env.NODE_ENV === "production") {
      throw new Error("本番環境では必ずSESSION_SECRETを設定してください");
    }
  }

  app.use(
    session({
      secret: sessionSecret || "emergency-fallback-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({
        checkPeriod: 86400000, // 24時間
      }),
      cookie: {
        secure:
          process.env.NODE_ENV === "production" && !process.env.DISABLE_HTTPS, // 本番では HTTPS 必須
        maxAge: 86400000, // 24時間
        httpOnly: true,
        sameSite: "lax",
      },
      name: "sessionId", // デフォルトのconnect.sidを変更
    })
  );
  console.log("セッション設定完了");
} catch (error) {
  console.error("セッション設定エラー:", error);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

// セキュリティヘッダー
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "script-src 'self' https://cdn.jsdelivr.net; " +
      "font-src 'self' https://cdn.jsdelivr.net; " +
      "img-src 'self' data: https:; " +
      "frame-src 'none';"
  );
  next();
});

// リクエストログ
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// 緊急時エンドポイント（最優先）
app.get("/emergency", (req, res) => {
  res.send(`
    <h1>緊急確認ページ</h1>
    <p>時刻: ${new Date().toISOString()}</p>
    <p>環境: ${isVercel ? "Vercel" : "Local"}</p>
    <p>Node.js: ${process.version}</p>
    <p>SESSION_SECRET: ${process.env.SESSION_SECRET ? "設定済み" : "未設定"}</p>
  `);
});

// ヘルスチェック用エンドポイント
app.get("/health", (req, res) => {
  console.log("Health check requested");
  try {
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      environment: isVercel ? "vercel" : "local",
      nodeVersion: process.version,
      platform: process.platform,
      sessionSecret: process.env.SESSION_SECRET ? "設定済み" : "未設定",
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({ error: error.message });
  }
});

// シンプルなテストエンドポイント
app.get("/test", (req, res) => {
  console.log("Test endpoint requested");
  res.status(200).send("Server is working!");
});

// HTMLテストページ
app.get("/simple", (req, res) => {
  console.log("Simple HTML page requested");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>テスト</title>
    </head>
    <body>
        <h1>Vercelテストページ</h1>
        <p>時刻: ${new Date().toISOString()}</p>
        <p>環境: ${isVercel ? "Vercel" : "Local"}</p>
        <a href="/health">ヘルスチェック</a> | 
        <a href="/test">テスト</a> | 
        <a href="/emergency">緊急確認</a> |
        <a href="/">メインページ</a>
    </body>
    </html>
  `);
});

// ルート設定（エラーハンドリング強化）
console.log("ルート読み込み開始...");
try {
  app.use("/auth", require("./routes/auth"));
  console.log("auth ルート読み込み完了");
} catch (error) {
  console.error("auth ルート読み込みエラー:", error);
}

try {
  app.use("/api/users", require("./routes/users"));
  console.log("users ルート読み込み完了");
} catch (error) {
  console.error("users ルート読み込みエラー:", error);
}

try {
  app.use("/agencies", require("./routes/agencies"));
  console.log("agencies ルート読み込み完了");
} catch (error) {
  console.error("agencies ルート読み込みエラー:", error);
}

try {
  app.use("/sales", require("./routes/sales"));
  console.log("sales ルート読み込み完了");
} catch (error) {
  console.error("sales ルート読み込みエラー:", error);
}

try {
  app.use("/groups", require("./routes/groups"));
  console.log("groups ルート読み完了");
} catch (error) {
  console.error("groups ルート読み込みエラー:", error);
}

try {
  app.use("/materials", require("./routes/materials"));
  console.log("materials ルート読み込み完了");
} catch (error) {
  console.error("materials ルート読み込みエラー:", error);
}

console.log("全ルート読み込み処理完了");

// メインページ（簡素化・安全化）- 最優先でルート定義
app.get("/", (req, res) => {
  console.log("=== メインページリクエスト ===");
  console.log("時刻:", new Date().toISOString());
  console.log("ユーザーエージェント:", req.headers["user-agent"]);
  console.log("リクエストパス:", req.path);
  console.log("リクエストURL:", req.url);
  console.log("Vercel環境:", isVercel);
  console.log("セッション存在:", !!req.session);
  console.log("ユーザー情報:", req.session?.user);

  // 強制的にキャッシュを無効化
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("ETag", ""); // ETagを削除
  res.setHeader("X-Powered-By", "Express-Dynamic");

  // Vercel環境での動作確認用のテスト応答
  if (isVercel && req.query.test === "dynamic") {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>動的レスポンステスト</title></head>
      <body>
        <h1>動的レスポンス確認</h1>
        <p>時刻: ${new Date().toISOString()}</p>
        <p>環境: Vercel</p>
        <p>このページは動的に生成されています</p>
        <a href="/">通常のメインページ</a>
      </body>
      </html>
    `);
  }

  try {
    // セッションチェック
    if (!req.session || !req.session.user) {
      console.log("セッションなし - ログインページにリダイレクト");
      return res.redirect(302, "/auth/login");
    }

    console.log("認証済みユーザー:", req.session.user.role);

    if (req.session.user.role === "admin") {
      console.log("管理者ダッシュボードをレンダリング");
      if (disableLayouts) {
        return res.render("admin_index_standalone", {
          session: req.session,
          title: "管理者ダッシュボード",
        });
      } else {
        return res.render("admin_index", {
          session: req.session,
          title: "管理者ダッシュボード",
        });
      }
    } else {
      console.log("代理店ダッシュボードをレンダリング");
      if (disableLayouts) {
        return res.render("agency_index_standalone", {
          session: req.session,
          title: "代理店ダッシュボード",
        });
      } else {
        return res.render("index", {
          session: req.session,
          title: "代理店管理システム",
        });
      }
    }
  } catch (error) {
    console.error("メインルートエラー:", error);
    res.status(500).send(`
      <h1>メインページエラー</h1>
      <p>時刻: ${new Date().toISOString()}</p>
      <p>エラー: ${error.message}</p>
      <a href="/emergency">緊急確認ページ</a>
      <a href="/auth/login">ログインページ</a>
    `);
  }
});

// 404エラーハンドリング
app.use((req, res) => {
  console.log("404 for path:", req.path);
  try {
    // レイアウトを無効化してエラーページをレンダリング
    res.status(404);
    res.locals.layout = false;
    res.render("404", {
      session: req.session || {},
      title: "ページが見つかりません",
    });
  } catch (error) {
    console.error("Error rendering 404:", error);
    res.status(404).send(`
      <h1>404 - ページが見つかりません</h1>
      <p>パス: ${req.path}</p>
      <a href="/emergency">緊急確認ページ</a>
    `);
  }
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error("=== Application Error ===");
  console.error("Error:", err);
  console.error("Stack:", err.stack);

  try {
    // レイアウトを無効化してエラーページをレンダリング
    res.status(500);
    res.locals.layout = false;
    res.render("500", {
      session: req.session || {},
      title: "サーバーエラー",
      error: process.env.NODE_ENV === "development" ? err : null,
    });
  } catch (renderError) {
    console.error("Error rendering error page:", renderError);
    res.status(500).send(`
      <h1>サーバーエラー</h1>
      <p>エラー: ${err.message}</p>
      <p>レンダリングエラー: ${renderError.message}</p>
      <a href="/emergency">緊急確認ページ</a>
    `);
  }
});

// ローカル環境でのサーバー起動
if (!isVercel) {
  const server = app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました`);
    console.log(`http://localhost:${port} でアクセスできます`);
  });

  // タイムアウト設定
  server.timeout = 30000; // 30秒
} else {
  // Vercel環境用の設定
  console.log("Vercel環境で動作中");

  // リクエストタイムアウトの設定
  app.use((req, res, next) => {
    res.setTimeout(25000, () => {
      console.log("Request timeout");
      res.status(408).send("Request Timeout");
    });
    next();
  });
}

console.log("=== サーバー設定完了 ===");

// Vercel用のエクスポート
module.exports = app;
