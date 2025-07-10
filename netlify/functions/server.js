const serverless = require("serverless-http");
const express = require("express");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const path = require("path");

const app = express();

// ビューエンジンの設定
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../../views"));

// 静的ファイルの設定
app.use(express.static(path.join(__dirname, "../../public")));

// レイアウト機能の設定
const expressLayouts = require("express-ejs-layouts");
app.use(expressLayouts);
app.set("layout", "layout");

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// セッション設定
app.use(
  session({
    secret: "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000, // 24時間
    }),
    cookie: {
      secure: false, // HTTPSの場合はtrueに
      maxAge: 86400000, // 24時間
    },
  })
);

// ルート設定
app.use("/auth", require("../../routes/auth"));
app.use("/api/users", require("../../routes/users"));
app.use("/agencies", require("../../routes/agencies"));
app.use("/sales", require("../../routes/sales"));
app.use("/groups", require("../../routes/groups"));
app.use("/materials", require("../../routes/materials"));

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

// Netlify Functions用のハンドラー
const handler = serverless(app);

module.exports.handler = async (event, context) => {
  // データベース接続の設定
  const result = await handler(event, context);
  return result;
};
