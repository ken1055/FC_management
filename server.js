// 環境変数を読み込み（Vercel最適化）
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const session = require("express-session");
const MemoryStore = require("memorystore")(session);
const path = require("path");
const sessionMonitor = require("./middleware/session-monitor");

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
      res.locals.title = res.locals.title || "FC店舗管理システム";
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
    res.locals.title = res.locals.title || "FC店舗管理システム";
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
    if (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV) {
      throw new Error("本番環境では必ずSESSION_SECRETを設定してください");
    }
  }

  const useSupabaseStore = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY;
  let store;
  if (useSupabaseStore) {
    const SupabaseSessionStore = require("./config/session-store");
    store = new SupabaseSessionStore({ tableName: "user_sessions" });
    console.log("セッションストア: SupabaseSessionStore を使用");
  } else {
    store = new MemoryStore({
      checkPeriod: 900000,
      max: 500,
      ttl: 7 * 24 * 60 * 60 * 1000,
      dispose: (key) => {
        sessionMonitor.onSessionDestroy(key, "ttl_expired");
      },
      stale: false,
    });
    console.log("セッションストア: MemoryStore を使用");
  }

  app.use(
    session({
      secret: sessionSecret || "emergency-fallback-secret-key-for-vercel",
      resave: true,
      saveUninitialized: false,
      store,
      cookie: {
        secure: process.env.NODE_ENV === "production" && !process.env.DISABLE_HTTPS,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
      },
      name: "sessionId",
      rolling: true,
    })
  );
  console.log("セッション設定完了");

  // セッション監視ミドルウェアの追加
  app.use(sessionMonitor.middleware());
  console.log("セッション監視開始");
} catch (error) {
  console.error("セッション設定エラー:", error);
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV) {
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
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
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
    <p>環境: ${isVercel ? "Vercel" : "Railway"}</p>
    <p>Node.js: ${process.version}</p>
    <p>SESSION_SECRET: ${process.env.SESSION_SECRET ? "設定済み" : "未設定"}</p>
  `);
});

// Railway専用デバッグエンドポイント
app.get("/debug", (req, res) => {
  try {
    const viewsPath = path.join(__dirname, "views");
    const fs = require("fs");

    // viewsディレクトリの内容を確認
    let viewFiles = [];
    try {
      viewFiles = fs.readdirSync(viewsPath);
    } catch (err) {
      viewFiles = [`Error reading views: ${err.message}`];
    }

    // 環境変数の状態
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      SESSION_SECRET: process.env.SESSION_SECRET ? "設定済み" : "未設定",
      ADMIN_PROMOTION_PASS: process.env.ADMIN_PROMOTION_PASS
        ? "設定済み"
        : "未設定",
    };

    res.send(`
      <h1>Railway デバッグ情報</h1>
      <h2>基本情報</h2>
      <ul>
        <li>時刻: ${new Date().toISOString()}</li>
        <li>Node.js: ${process.version}</li>
        <li>プラットフォーム: ${process.platform}</li>
        <li>作業ディレクトリ: ${process.cwd()}</li>
        <li>レイアウト無効化: ${disableLayouts}</li>
      </ul>
      
      <h2>環境変数</h2>
      <pre>${JSON.stringify(envInfo, null, 2)}</pre>
      
      <h2>Viewsディレクトリ</h2>
      <p>パス: ${viewsPath}</p>
      <ul>
        ${viewFiles.map((file) => `<li>${file}</li>`).join("")}
      </ul>
      
      <h2>テストリンク</h2>
      <ul>
        <li><a href="/health">ヘルスチェック</a></li>
        <li><a href="/test">テストページ</a></li>
        <li><a href="/auth/login">ログインページ</a></li>
        <li><a href="/agencies/list">代理店一覧（要認証）</a></li>
      </ul>
    `);
  } catch (error) {
    res.status(500).send(`
      <h1>デバッグエラー</h1>
      <p>エラー: ${error.message}</p>
      <p>スタック: ${error.stack}</p>
    `);
  }
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

// Vercel + Supabase専用ルート読み込み
console.log("Vercel + Supabase環境: 全ルート読み込み");

// 全ルートを読み込み
app.use("/auth", require("./routes/auth"));
app.use("/sales", require("./routes/sales"));
app.use("/stores", require("./routes/agencies"));
app.use("/agencies", require("./routes/agencies"));
app.use("/customers", require("./routes/customers"));
app.use("/users", require("./routes/users"));
app.use("/groups", require("./routes/groups"));
app.use("/settings", require("./routes/settings"));
app.use("/royalty", require("./routes/royalty"));

console.log("Vercel + Supabase全ルート読み込み完了");

// 店舗統計情報API
app.get("/api/store/statistics", async (req, res) => {
  console.log("=== 統計情報API呼び出し ===");
  console.log("セッション:", req.session?.user);
  console.log("リクエストヘッダー:", req.headers);

  if (!req.session || !req.session.user) {
    console.log("認証エラー: セッションまたはユーザーなし");
    return res.status(403).json({ error: "Unauthorized - No session" });
  }

  // 管理者とagencyロールの両方に対応
  if (!["admin", "agency"].includes(req.session.user.role)) {
    console.log("認証エラー: 権限不足 - ロール:", req.session.user.role);
    return res.status(403).json({ error: "Unauthorized - Invalid role" });
  }

  let storeId;
  if (req.session.user.role === "agency") {
    storeId = req.session.user.store_id;
    console.log("店舗ユーザー - 店舗ID:", storeId);
  } else if (req.session.user.role === "admin") {
    // 管理者の場合、クエリパラメータから店舗IDを取得するか、全店舗統計を返す
    storeId = req.query.store_id ? parseInt(req.query.store_id) : null;
    console.log("管理者ユーザー - 指定店舗ID:", storeId);
  }

  if (req.session.user.role === "agency" && !storeId) {
    console.log("店舗IDエラー: 店舗ユーザーなのに店舗ID未設定");
    return res
      .status(400)
      .json({ error: "Store ID not found for agency user" });
  }

  // Supabase接続を取得
  const { getSupabaseClient } = require("./config/supabase");
  const db = getSupabaseClient();

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  console.log("現在日時:", { currentYear, currentMonth });
  console.log("Supabaseクライアント:", !!db);

  if (storeId) {
    // 特定店舗の統計を取得（Supabase）
    await handleStoreStatistics(storeId);
  } else {
    // 管理者用：全店舗統計を取得（Supabase）
    await handleGlobalStatistics();
  }

  // 特定店舗の統計を取得する関数（Supabase）
  async function handleStoreStatistics(storeId) {
    try {
      console.log("特定店舗統計取得開始 - storeId:", storeId);

      // 顧客数を取得
      const { data: customerData, error: customerError } = await db
        .from("customers")
        .select("id", { count: "exact" })
        .eq("store_id", storeId);

      if (customerError) {
        console.error("顧客数取得エラー:", customerError);
        return res
          .status(500)
          .json({ error: "Failed to fetch customer count" });
      }

      const customerCount = customerData?.length || 0;
      console.log("顧客数結果:", customerCount);

      // 当月の売上を取得（正しい月末日を計算）
      const startDate = `${currentYear}-${String(currentMonth).padStart(
        2,
        "0"
      )}-01`;
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate(); // 月末日を正確に取得
      const endDate = `${currentYear}-${String(currentMonth).padStart(
        2,
        "0"
      )}-${String(lastDayOfMonth).padStart(2, "0")}`;

      console.log("日付範囲:", { startDate, endDate, lastDayOfMonth });

      const { data: salesData, error: salesError } = await db
        .from("customer_transactions")
        .select("amount")
        .eq("store_id", storeId)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate);

      if (salesError) {
        console.error("売上取得エラー:", salesError);
        return res.status(500).json({ error: "Failed to fetch sales data" });
      }

      const currentMonthSales =
        salesData?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
      console.log("売上結果:", currentMonthSales);

      const response = {
        customerCount,
        currentMonthSales,
        year: currentYear,
        month: currentMonth,
        storeId: storeId,
      };

      console.log("特定店舗統計最終レスポンス:", response);
      res.json(response);
    } catch (error) {
      console.error("特定店舗統計処理エラー:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // 全店舗統計を取得する関数（Supabase）
  async function handleGlobalStatistics() {
    try {
      console.log("全店舗統計取得開始");

      // 全顧客数を取得
      const { data: customerData, error: customerError } = await db
        .from("customers")
        .select("id", { count: "exact" });

      if (customerError) {
        console.error("全店舗顧客数取得エラー:", customerError);
        return res
          .status(500)
          .json({ error: "Failed to fetch customer count" });
      }

      const customerCount = customerData?.length || 0;
      console.log("全店舗顧客数結果:", customerCount);

      // 当月の全店舗売上を取得（正しい月末日を計算）
      const startDate = `${currentYear}-${String(currentMonth).padStart(
        2,
        "0"
      )}-01`;
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate(); // 月末日を正確に取得
      const endDate = `${currentYear}-${String(currentMonth).padStart(
        2,
        "0"
      )}-${String(lastDayOfMonth).padStart(2, "0")}`;

      console.log("全店舗日付範囲:", { startDate, endDate, lastDayOfMonth });

      const { data: salesData, error: salesError } = await db
        .from("customer_transactions")
        .select("amount")
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate);

      if (salesError) {
        console.error("全店舗売上取得エラー:", salesError);
        return res.status(500).json({ error: "Failed to fetch sales data" });
      }

      const currentMonthSales =
        salesData?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
      console.log("全店舗売上結果:", currentMonthSales);

      const response = {
        customerCount,
        currentMonthSales,
        year: currentYear,
        month: currentMonth,
        storeId: null,
        isGlobal: true,
      };

      console.log("全店舗統計最終レスポンス:", response);
      res.json(response);
    } catch (error) {
      console.error("全店舗統計処理エラー:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// メインページ（簡素化・安全化）- 最優先でルート定義
app.get("/", (req, res) => {
  console.log("=== メインページリクエスト ===");
  console.log("時刻:", new Date().toISOString());
  console.log("ユーザーエージェント:", req.headers["user-agent"]);
  console.log("リクエストパス:", req.path);
  console.log("リクエストURL:", req.url);
  console.log("Vercel環境:", isVercel);
  console.log("セッション存在:", !!req.session);
  console.log("セッションID:", req.sessionID);
  console.log("セッション内容:", JSON.stringify(req.session, null, 2));
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
          title: "FC本部管理者ダッシュボード",
        });
      } else {
        return res.render("admin_index", {
          session: req.session,
          title: "FC本部管理者ダッシュボード",
        });
      }
    } else {
      console.log("店舗ダッシュボードをレンダリング");
      if (disableLayouts) {
        return res.render("store_index_standalone", {
          session: req.session,
          title: "FC店舗ダッシュボード",
        });
      } else {
        return res.render("index", {
          session: req.session,
          title: "FC店舗管理システム",
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

// Vercel環境専用設定
console.log("Vercel + Supabase環境で動作中");

// タイムアウト設定（30秒）
app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.log("Request timeout - 30秒制限");
      res.status(408).send(`
        <h1>Request Timeout</h1>
        <p>処理に時間がかかりすぎています。</p>
        <p>時刻: ${new Date().toISOString()}</p>
        <a href="/emergency">緊急確認ページ</a>
        <a href="/auth/login">ログイン画面</a>
      `);
    }
  }, 30000); // 30秒

  res.on("finish", () => {
    clearTimeout(timeout);
  });

  res.on("close", () => {
    clearTimeout(timeout);
  });

  next();
});

console.log("=== サーバー設定完了 ===");

// Vercel用のエクスポート
module.exports = app;
