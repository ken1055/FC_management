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
    maxAge: isVercel ? "1y" : 0,
  })
);

// レイアウト機能の設定
const expressLayouts = require("express-ejs-layouts");
app.use(expressLayouts);
app.set("layout", "layout");

// ミドルウェア設定
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Vercel用の追加ヘッダー
app.use((req, res, next) => {
  if (isVercel) {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  }
  next();
});

// セッション設定
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000, // 24時間
    }),
    cookie: {
      secure: isVercel || process.env.NODE_ENV === "production",
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

// デバッグ用ログ（Vercel環境で）
if (isVercel) {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// ルート設定
try {
  app.use("/auth", require("./routes/auth"));
  app.use("/api/users", require("./routes/users"));
  app.use("/agencies", require("./routes/agencies"));
  app.use("/sales", require("./routes/sales"));
  app.use("/groups", require("./routes/groups"));
  app.use("/materials", require("./routes/materials"));
  console.log("All routes loaded successfully");
} catch (error) {
  console.error("Error loading routes:", error);
}

// メインページ
app.get("/", (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/auth/login");
    }

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
    res.status(500).send("サーバーエラーが発生しました");
  }
});

// ヘルスチェック用エンドポイント
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: isVercel ? "vercel" : "local",
    nodeVersion: process.version,
    platform: process.platform,
  });
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
    res.status(500).send("サーバーエラーが発生しました");
  }
});

// ローカル環境でのサーバー起動
if (!isVercel) {
  app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました`);
    console.log(`http://localhost:${port} でアクセスできます`);
  });
}

// Vercel用のエクスポート
module.exports = app;
