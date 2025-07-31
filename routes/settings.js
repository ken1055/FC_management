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
    "SELECT key_value FROM settings WHERE key_name = ?",
    ["official_line_url"],
    (err, row) => {
      if (err) {
        console.error("設定取得エラー:", err);
        return res.status(500).send("設定取得エラー");
      }

      const officialLineUrl = row ? row.key_value : "";

      res.render("settings/index", {
        session: req.session,
        title: "システム設定",
        officialLineUrl,
      });
    }
  );
});

// 公式ラインURL設定
router.post("/official-line", requireRole(["admin"]), (req, res) => {
  const { url } = req.body;

  // URLの妥当性チェック（簡単な形式チェック）
  if (url && !url.match(/^https?:\/\/.+/)) {
    return res.status(400).send("有効なURLを入力してください");
  }

  const isPostgres = !!process.env.DATABASE_URL;

  if (isPostgres) {
    // PostgreSQL用のUPSERT
    db.run(
      `INSERT INTO settings (key_name, key_value, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP) 
       ON CONFLICT (key_name) 
       DO UPDATE SET key_value = $2, updated_at = CURRENT_TIMESTAMP`,
      ["official_line_url", url || null],
      (err) => {
        if (err) {
          console.error("設定保存エラー:", err);
          return res.status(500).send("設定保存エラー");
        }
        res.redirect("/settings?success=1");
      }
    );
  } else {
    // SQLite用のUPSERT
    db.run(
      `INSERT OR REPLACE INTO settings (key_name, key_value, updated_at) 
       VALUES (?, ?, datetime('now'))`,
      ["official_line_url", url || null],
      (err) => {
        if (err) {
          console.error("設定保存エラー:", err);
          return res.status(500).send("設定保存エラー");
        }
        res.redirect("/settings?success=1");
      }
    );
  }
});

// 公式ラインURL取得API（代理店用）
router.get("/api/official-line-url", (req, res) => {
  db.get(
    "SELECT key_value FROM settings WHERE key_name = ?",
    ["official_line_url"],
    (err, row) => {
      if (err) {
        console.error("設定取得エラー:", err);
        return res.status(500).json({ error: "設定取得エラー" });
      }

      res.json({
        url: row ? row.key_value : null,
      });
    }
  );
});

module.exports = router;
