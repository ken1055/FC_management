const express = require("express");
const router = express.Router();
const db = require("../db");
const crypto = require("crypto");

// パスワードハッシュ化関数
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

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
  console.log("=== ユーザー管理ページアクセス ===");
  console.log("ユーザー:", req.session.user);

  // シンプルなユーザー一覧表示（ID整合性チェックを無効化）
  db.all(
    "SELECT id, email, role FROM users WHERE role IN ('admin') ORDER BY id",
    [],
    (err, users) => {
      if (err) {
        console.error("ユーザー一覧取得エラー:", err);
        return res.status(500).send("DBエラー: " + err.message);
      }

      console.log("取得したユーザー数:", users.length);

      // 管理者数を集計
      const admins = users.filter((u) => u.role === "admin");

      // 成功・エラーメッセージを取得
      const success = req.query.success;
      const error = req.query.error;

      try {
        res.render("users_list", {
          users,
          admins,
          integrityInfo: {
            isIntegrityOk: true,
            issues: [],
            totalUsers: users.length,
          }, // ダミーデータ
          autoFixMessage: null,
          success: success,
          error: error,
          session: req.session,
          title: "管理者アカウント管理",
        });
      } catch (renderError) {
        console.error("レンダリングエラー:", renderError);
        res.status(500).send("レンダリングエラー: " + renderError.message);
      }
    }
  );
});

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

      // 本番環境ではパスワードをハッシュ化
      const hashedPassword =
        process.env.NODE_ENV === "production"
          ? hashPassword(password)
          : password;

      db.run(
        "INSERT INTO users (email, password, role) VALUES (?, ?, 'admin')",
        [email, hashedPassword, "admin"],
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

// 新規ユーザー作成（管理者のみ）
router.post("/create", requireRole(["admin"]), (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "全ての項目を入力してください",
    });
  }

  if (password.length < 4) {
    return res.status(400).json({
      success: false,
      message: "パスワードは4文字以上で入力してください",
    });
  }

  // 本番環境ではパスワードをハッシュ化
  const hashedPassword =
    process.env.NODE_ENV === "production" ? hashPassword(password) : password;

  db.run(
    "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
    [email, hashedPassword, role],
    function (err) {
      if (err) {
        console.error("ユーザー作成エラー:", err);

        // PostgreSQL固有のエラーハンドリング
        if (err.code === "23505" && err.constraint === "users_email_key") {
          return res
            .status(400)
            .send(
              `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
            );
        }

        return res.status(500).send(`ユーザー作成エラー: ${err.message}`);
      }

      res.json({
        success: true,
        message: "ユーザーが正常に作成されました",
        userId: this.lastID,
      });
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
