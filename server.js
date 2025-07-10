const express = require("express");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const path = require("path");

const app = express();

// Vercel環境の検出
const isVercel = process.env.VERCEL === "1";
const port = process.env.PORT || 3000;

// ビューエンジンの設定
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 静的ファイルの設定
app.use(express.static(path.join(__dirname, "public")));

// レイアウト機能の設定
const expressLayouts = require("express-ejs-layouts");
app.use(expressLayouts);
app.set("layout", "layout");

// ミドルウェア設定
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

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
      secure: isVercel || process.env.NODE_ENV === "production", // Vercelでは自動HTTPS
      maxAge: 86400000, // 24時間
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// セキュリティヘッダー（Vercel用）
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// ルート設定
app.use("/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/agencies", require("./routes/agencies"));
app.use("/sales", require("./routes/sales"));
app.use("/groups", require("./routes/groups"));
app.use("/materials", require("./routes/materials"));

// メインページ
app.get("/", (req, res) => {
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
});

// ヘルスチェック用エンドポイント
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: isVercel ? "vercel" : "local",
  });
});

// 404エラーハンドリング
app.use((req, res) => {
  res.status(404).render("404", {
    session: req.session,
    title: "ページが見つかりません",
  });
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).render("500", {
    session: req.session,
    title: "サーバーエラー",
    error: process.env.NODE_ENV === "development" ? err : null,
  });
});

// Vercel環境では自動的に適切なポートが設定される
if (!isVercel) {
  app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました`);
    console.log(`http://localhost:${port} でアクセスできます`);
  });
}

// Vercel用のエクスポート
module.exports = app;
