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

// ID整合性チェック機能
function checkUserIdIntegrity(callback) {
  db.all(
    "SELECT id, email, role, agency_id FROM users WHERE role IN ('admin', 'agency') ORDER BY role, email",
    [],
    (err, users) => {
      if (err) return callback(err, null);

      const issues = [];
      let expectedId = 1;

      users.forEach((user, index) => {
        if (user.id !== expectedId) {
          issues.push({
            currentId: user.id,
            expectedId: expectedId,
            email: user.email,
            role: user.role,
          });
        }
        expectedId++;
      });

      callback(null, {
        totalUsers: users.length,
        issues: issues,
        isIntegrityOk: issues.length === 0,
      });
    }
  );
}

// ID修正機能（オンデマンド）
function fixUserIds(callback) {
  // 現在のユーザーを取得（adminとagencyのみ、emailでソート）
  db.all(
    "SELECT id, email, role, agency_id FROM users WHERE role IN ('admin', 'agency') ORDER BY role, email",
    [],
    (err, users) => {
      if (err) return callback(err);

      if (users.length === 0) return callback(null);

      // 一時テーブルを作成
      db.run(
        "CREATE TEMP TABLE temp_users AS SELECT * FROM users WHERE role IN ('admin', 'agency')",
        (err) => {
          if (err) return callback(err);

          // 元のユーザーデータを削除
          db.run(
            "DELETE FROM users WHERE role IN ('admin', 'agency')",
            (err) => {
              if (err) return callback(err);

              // 新しいIDで再挿入
              let completed = 0;
              users.forEach((user, index) => {
                const newId = index + 1;
                db.run(
                  "INSERT INTO users (id, email, password, role, agency_id) SELECT ?, email, password, role, agency_id FROM temp_users WHERE id = ?",
                  [newId, user.id],
                  (err) => {
                    if (err) console.error("ID修正エラー:", err);
                    completed++;
                    if (completed === users.length) {
                      // 一時テーブルを削除
                      db.run("DROP TABLE temp_users", () => {
                        // シーケンステーブルをリセット
                        db.run(
                          "UPDATE sqlite_sequence SET seq = ? WHERE name = 'users'",
                          [users.length],
                          () => {
                            callback(null);
                          }
                        );
                      });
                    }
                  }
                );
              });
            }
          );
        }
      );
    }
  );
}

// 管理者アカウント一覧表示（管理者のみ）
router.get("/list", requireRole(["admin"]), (req, res) => {
  // ID整合性をチェック
  checkUserIdIntegrity((err, integrityInfo) => {
    if (err) return res.status(500).send("DBエラー");

    // ID整合性に問題がある場合、自動的に修正
    if (!integrityInfo.isIntegrityOk) {
      fixUserIds((fixErr) => {
        if (fixErr) {
          console.error("自動ID修正エラー:", fixErr);
          // エラーがあっても画面は表示
          return renderUsersList(
            req,
            res,
            integrityInfo,
            "自動ID修正でエラーが発生しました"
          );
        }

        // 修正後に再度チェックして画面表示
        checkUserIdIntegrity((recheckErr, newIntegrityInfo) => {
          if (recheckErr) return res.status(500).send("DBエラー");
          return renderUsersList(
            req,
            res,
            newIntegrityInfo,
            "ユーザーIDを自動的に連番に修正しました"
          );
        });
      });
    } else {
      // 問題がない場合は通常表示
      return renderUsersList(req, res, integrityInfo);
    }
  });
});

// ユーザー一覧画面の描画関数
function renderUsersList(req, res, integrityInfo, message = null) {
  db.all(
    "SELECT id, email, role FROM users WHERE role IN ('admin') ORDER BY id",
    [],
    (err, users) => {
      if (err) return res.status(500).send("DBエラー");

      // 管理者数を集計
      const admins = users.filter((u) => u.role === "admin");

      res.render("users_list", {
        users,
        admins,
        integrityInfo,
        autoFixMessage: message,
        session: req.session,
        title: "管理者アカウント管理",
      });
    }
  );
}

// 新規アカウント作成画面
router.get("/new", requireRole(["admin"]), (req, res) => {
  res.render("users_form", {
    user: null,
    session: req.session,
    title: "新規管理者アカウント作成",
  });
});

// 管理者アカウント追加
router.post("/", requireRole(["admin"]), (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.render("users_form", {
      user: null,
      error: "必須項目が不足しています",
      session: req.session,
      title: "新規管理者アカウント作成",
    });

  db.get(
    "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'",
    [],
    (err, row) => {
      if (err) return res.status(500).send("DBエラー");
      if (row.cnt >= 5)
        return res.render("users_form", {
          user: null,
          error: "管理者アカウントは5つまでです",
          session: req.session,
          title: "新規管理者アカウント作成",
        });

      db.run(
        "INSERT INTO users (email, password, role) VALUES (?, ?, 'admin')",
        [email, password],
        function (err) {
          if (err)
            return res.render("users_form", {
              user: null,
              error:
                "アカウント作成に失敗しました（メールアドレスの重複の可能性があります）",
              session: req.session,
              title: "新規管理者アカウント作成",
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

  // ユーザー情報を取得して管理者かチェック
  db.get(
    "SELECT * FROM users WHERE id = ? AND role = 'admin'",
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
