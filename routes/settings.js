const express = require("express");
const router = express.Router();
const db = require("../db");

// 権限チェック関数
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect("/login");
    }
    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).send("アクセス権限がありません");
    }
    next();
  };
}

// 設定一覧表示
router.get("/", requireRole(["admin"]), (req, res) => {
  // 公式ラインURLを取得
  db.get(
    "SELECT value FROM settings WHERE key_name = ?",
    ["official_line_url"],
    (err, row) => {
      if (err) {
        console.error("設定取得エラー:", err);
        return res.status(500).send("設定取得エラー");
      }

      const officialLineUrl = row ? row.value : "";

      res.render("settings/index", {
        session: req.session,
        title: "システム設定",
        officialLineUrl,
      });
    }
  );
});

// 公式LINE URL設定
router.post("/official-line", requireRole(["admin"]), (req, res) => {
  const { url } = req.body;

  console.log("=== 公式LINE URL設定保存 ===");
  console.log("受信したURL:", url);
  console.log("管理者:", req.session?.user?.email);

  // URLの妥当性チェック（簡単な形式チェック）
  if (url && !url.match(/^https?:\/\/.+/)) {
    console.log("URL形式エラー:", url);
    return res.status(400).send("有効なURLを入力してください");
  }

  const isPostgres = !!process.env.DATABASE_URL;
  console.log("データベース環境:", isPostgres ? "PostgreSQL" : "SQLite");

  if (isPostgres) {
    // PostgreSQL用のUPSERT
    console.log("PostgreSQL用クエリ実行中...");
    db.run(
      `INSERT INTO settings (key_name, value, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP) 
       ON CONFLICT (key_name) 
       DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      ["official_line_url", url || null],
      (err) => {
        if (err) {
          console.error("PostgreSQL設定保存エラー:", err);
          return res.status(500).send("設定保存エラー");
        }
        console.log("PostgreSQL設定保存成功:", url);
        res.redirect("/settings?success=1");
      }
    );
  } else {
    // SQLite用のUPSERT
    console.log("SQLite用クエリ実行中...");
    db.run(
      `INSERT OR REPLACE INTO settings (key_name, value, updated_at) 
       VALUES (?, ?, datetime('now'))`,
      ["official_line_url", url || null],
      (err) => {
        if (err) {
          console.error("SQLite設定保存エラー:", err);
          return res.status(500).send("設定保存エラー");
        }
        console.log("SQLite設定保存成功:", url);
        res.redirect("/settings?success=1");
      }
    );
  }
});

// 公式LINE URL取得API（代理店用）
router.get("/api/official-line-url", (req, res) => {
  console.log("=== 公式LINE URL API呼び出し ===");
  console.log("リクエスト元:", req.headers["user-agent"]);
  console.log("セッション情報:", req.session?.user?.role);

  db.get(
    "SELECT value FROM settings WHERE key_name = ?",
    ["official_line_url"],
    (err, row) => {
      if (err) {
        console.error("設定取得エラー:", err);
        return res.status(500).json({ error: "設定取得エラー" });
      }

      console.log("データベース取得結果:", row);
      const url = row ? row.value : null;
      console.log("返送するURL:", url);

      res.json({
        url: url,
      });
    }
  );
});

module.exports = router;
