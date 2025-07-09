const express = require("express");
const router = express.Router();
const db = require("../db");

// 権限チェック機能
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// 役員・管理者アカウント一覧表示（管理者のみ）
router.get("/list", requireRole(["admin"]), (req, res) => {
  db.all(
    "SELECT id, email, role FROM users WHERE role IN ('executive', 'admin') ORDER BY role, email",
    [],
    (err, users) => {
      if (err) return res.status(500).send("DBエラー");

      // 役員・管理者数を集計
      const executives = users.filter((u) => u.role === "executive");
      const admins = users.filter((u) => u.role === "admin");

      res.render("users_list", {
        users,
        executives,
        admins,
        session: req.session,
        title: "役員・管理者アカウント管理",
      });
    }
  );
});

// 新規アカウント作成画面
router.get("/new", requireRole(["admin"]), (req, res) => {
  res.render("users_form", {
    user: null,
    session: req.session,
    title: "新規アカウント作成",
  });
});

// 役員・管理者アカウント追加
router.post("/", requireRole(["admin"]), (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.render("users_form", {
      user: null,
      error: "必須項目が不足しています",
      session: req.session,
      title: "新規アカウント作成",
    });

  db.get(
    "SELECT COUNT(*) as cnt FROM users WHERE role = ?",
    [role],
    (err, row) => {
      if (err) return res.status(500).send("DBエラー");
      if (role === "executive" && row.cnt >= 1)
        return res.render("users_form", {
          user: null,
          error: "役員アカウントは1つまでです",
          session: req.session,
          title: "新規アカウント作成",
        });
      if (role === "admin" && row.cnt >= 4)
        return res.render("users_form", {
          user: null,
          error: "管理者アカウントは4つまでです",
          session: req.session,
          title: "新規アカウント作成",
        });

      db.run(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, password, role],
        function (err) {
          if (err)
            return res.render("users_form", {
              user: null,
              error:
                "アカウント作成に失敗しました（メールアドレスの重複の可能性があります）",
              session: req.session,
              title: "新規アカウント作成",
            });
          res.redirect("/api/users/list");
        }
      );
    }
  );
});

// Webインターフェースでのアカウント削除
router.post("/delete/:id", requireRole(["admin"]), (req, res) => {
  const userId = req.params.id;

  // 自分自身を削除しようとしていないかチェック
  if (req.session.user.id == userId) {
    return res.redirect(
      "/api/users/list?error=" +
        encodeURIComponent("自分自身のアカウントは削除できません")
    );
  }

  // ユーザー情報を取得して役員・管理者かチェック
  db.get(
    "SELECT * FROM users WHERE id = ? AND role IN ('executive', 'admin')",
    [userId],
    (err, user) => {
      if (err) return res.status(500).send("DBエラー");
      if (!user)
        return res.redirect(
          "/api/users/list?error=" +
            encodeURIComponent("指定されたユーザーが見つかりません")
        );

      db.run("DELETE FROM users WHERE id = ?", [userId], function (err) {
        if (err) return res.status(500).send("削除エラー");
        res.redirect(
          "/api/users/list?success=" +
            encodeURIComponent(`${user.email} のアカウントを削除しました`)
        );
      });
    }
  );
});

// API: アカウント削除（従来の機能を維持）
router.delete("/:id", (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).send("DBエラー");
    res.send("削除完了");
  });
});

module.exports = router;
