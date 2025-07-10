const express = require("express");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const path = require("path");

const app = express();

// Vercel環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const port = process.env.PORT || 3000;

console.log("Environment:", {
  isVercel,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

// ビューエンジンの設定
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 静的ファイルの設定（Vercel対応）
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: isVercel ? "1d" : 0,
  })
);

// レイアウト機能の設定
const expressLayouts = require("express-ejs-layouts");
app.use(expressLayouts);
app.set("layout", "layout");

// ミドルウェア設定
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// セッション設定（Vercel最適化）
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default-secret-key-for-development",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000, // 24時間
    }),
    cookie: {
      secure: false, // Vercelで問題が起きる場合は一時的にfalse
      maxAge: 86400000, // 24時間
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// セキュリティヘッダー
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// リクエストログ
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ヘルスチェック用エンドポイント（最優先）
app.get("/health", (req, res) => {
  console.log("Health check requested");
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: isVercel ? "vercel" : "local",
    nodeVersion: process.version,
    platform: process.platform,
  });
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
        <a href="/">メインページ</a>
    </body>
    </html>
  `);
});

// ルート設定（エラーハンドリング強化）
try {
  console.log("Loading routes...");
  app.use("/auth", require("./routes/auth"));
  app.use("/api/users", require("./routes/users"));
  app.use("/agencies", require("./routes/agencies"));
  app.use("/sales", require("./routes/sales"));
  app.use("/groups", require("./routes/groups"));
  app.use("/materials", require("./routes/materials"));
  console.log("All routes loaded successfully");
} catch (error) {
  console.error("Error loading routes:", error);
  // ルート読み込みエラーでもアプリを停止させない
}

// メインページ（簡素化）
app.get("/", (req, res) => {
  console.log("Main page requested");
  try {
    // セッションチェックを簡素化
    if (!req.session || !req.session.user) {
      console.log("No session, redirecting to login");
      return res.redirect("/auth/login");
    }

    console.log("User found in session:", req.session.user.role);

    if (req.session.user.role === "admin") {
      return res.render("admin_index", {
        session: req.session,
        title: "管理者ダッシュボード",
      });
    } else {
      return res.render("index", {
        session: req.session,
        title: "代理店管理システム",
      });
    }
  } catch (error) {
    console.error("Error in main route:", error);
    res.status(500).send("サーバーエラーが発生しました: " + error.message);
  }
});

// 404エラーハンドリング
app.use((req, res) => {
  console.log("404 for path:", req.path);
  try {
    res.status(404).render("404", {
      session: req.session || {},
      title: "ページが見つかりません",
    });
  } catch (error) {
    console.error("Error rendering 404:", error);
    res.status(404).send("ページが見つかりません");
  }
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error("Application Error:", err);
  try {
    res.status(500).render("500", {
      session: req.session || {},
      title: "サーバーエラー",
      error: process.env.NODE_ENV === "development" ? err : null,
    });
  } catch (renderError) {
    console.error("Error rendering error page:", renderError);
    res.status(500).send("サーバーエラーが発生しました: " + err.message);
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

// Vercel用のエクスポート
module.exports = app;
