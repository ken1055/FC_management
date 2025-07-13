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

// ID修正機能（PostgreSQL対応）
function fixUserIds(callback) {
  console.log("ユーザーID修正開始...");

  // 現在のユーザーを取得（adminとagencyのみ、emailでソート）
  db.all(
    "SELECT id, email, role, agency_id FROM users WHERE role IN ('admin', 'agency') ORDER BY role, email",
    [],
    (err, users) => {
      if (err) return callback(err);

      if (users.length === 0) return callback(null);

      // データベースタイプを判定
      const isPostgres =
        process.env.DATABASE_URL &&
        (process.env.RAILWAY_ENVIRONMENT_NAME ||
          process.env.NODE_ENV === "production");

      if (isPostgres) {
        // PostgreSQL用の修正処理
        fixUserIdsPostgres(users, callback);
      } else {
        // SQLite用の修正処理
        fixUserIdsSQLite(users, callback);
      }
    }
  );
}

// PostgreSQL用のID修正処理
function fixUserIdsPostgres(users, callback) {
  console.log("PostgreSQL環境でのユーザーID修正を実行中...");

  // 新しいIDマッピングを作成
  const idMapping = {};
  users.forEach((user, index) => {
    idMapping[user.id] = index + 1;
  });

  // トランザクション開始
  db.serialize(() => {
    let completed = 0;
    const totalOperations = users.length;

    users.forEach((user, index) => {
      const newId = index + 1;
      if (user.id === newId) {
        completed++;
        if (completed === totalOperations) {
          console.log("ユーザーID修正完了（変更不要）");
          callback(null);
        }
        return;
      }

      // 一時的に負のIDに変更して競合を回避
      const tempId = -user.id;

      db.run(
        "UPDATE users SET id = ? WHERE id = ?",
        [tempId, user.id],
        (err) => {
          if (err) {
            console.error("一時ID更新エラー:", err);
            return callback(err);
          }

          // 関連テーブルも一時IDに更新
          Promise.all([
            new Promise((resolve) => {
              db.run(
                "UPDATE group_admin SET admin_id = ? WHERE admin_id = ?",
                [tempId, user.id],
                () => resolve()
              );
            }),
          ]).then(() => {
            // 最終的なIDに更新
            db.run(
              "UPDATE users SET id = ? WHERE id = ?",
              [newId, tempId],
              (err) => {
                if (err) {
                  console.error("最終ID更新エラー:", err);
                  return callback(err);
                }

                // 関連テーブルを最終IDに更新
                Promise.all([
                  new Promise((resolve) => {
                    db.run(
                      "UPDATE group_admin SET admin_id = ? WHERE admin_id = ?",
                      [newId, tempId],
                      () => resolve()
                    );
                  }),
                ]).then(() => {
                  completed++;
                  console.log(
                    `ユーザーID修正: ${user.id} → ${newId} (${user.email})`
                  );

                  if (completed === totalOperations) {
                    console.log("ユーザーID修正完了（PostgreSQL）");
                    callback(null);
                  }
                });
              }
            );
          });
        }
      );
    });
  });
}

// SQLite用のID修正処理
function fixUserIdsSQLite(users, callback) {
  console.log("SQLite環境でのユーザーID修正を実行中...");

  // 一時テーブルを作成
  db.run(
    "CREATE TEMP TABLE temp_users AS SELECT * FROM users WHERE role IN ('admin', 'agency')",
    (err) => {
      if (err) return callback(err);

      // 元のユーザーデータを削除
      db.run("DELETE FROM users WHERE role IN ('admin', 'agency')", (err) => {
        if (err) return callback(err);

        // 新しいIDで再挿入
        let completed = 0;
        users.forEach((user, index) => {
          const newId = index + 1;
          db.run(
            "INSERT INTO users (id, email, password, role, agency_id) SELECT ?, email, password, role, agency_id FROM temp_users WHERE id = ?",
            [newId, user.id],
            (err) => {
              if (err) console.error("ユーザーID修正エラー:", err);

              // 関連テーブルのadmin_idも更新
              db.run(
                "UPDATE group_admin SET admin_id = ? WHERE admin_id = (SELECT id FROM temp_users WHERE id = ?)",
                [newId, user.id],
                () => {
                  completed++;
                  console.log(
                    `ユーザーID修正: ${user.id} → ${newId} (${user.email})`
                  );

                  if (completed === users.length) {
                    // 一時テーブルを削除
                    db.run("DROP TABLE temp_users", () => {
                      // シーケンステーブルをリセット
                      db.run(
                        "UPDATE sqlite_sequence SET seq = ? WHERE name = 'users'",
                        [users.length],
                        () => {
                          console.log("ユーザーID修正完了（SQLite）");
                          callback(null);
                        }
                      );
                    });
                  }
                }
              );
            }
          );
        });
      });
    }
  );
}

// 管理者アカウント一覧表示（管理者のみ）
router.get("/list", requireRole(["admin"]), (req, res) => {
  console.log("=== ユーザー管理ページアクセス ===");
  console.log("ユーザー:", req.session.user);

  // ユーザーIDの整合性をチェック
  checkUserIdIntegrity((err, integrityInfo) => {
    // エラーが発生した場合はデフォルト値を設定
    if (err || !integrityInfo) {
      console.error("ユーザーID整合性チェックエラー:", err);
      integrityInfo = {
        totalUsers: 0,
        issues: [],
        isIntegrityOk: true,
      };
    }

    // ID整合性に問題がある場合は自動修正
    if (!integrityInfo.isIntegrityOk && integrityInfo.issues.length > 0) {
      console.log("ユーザーID整合性の問題を発見、自動修正を実行...");
      fixUserIds((fixErr) => {
        if (fixErr) {
          console.error("ユーザーID自動修正エラー:", fixErr);
          // エラーがあっても画面表示は続行
          renderUsersList(req, res, integrityInfo);
        } else {
          console.log("ユーザーID自動修正完了");
          // 修正完了後、再度整合性チェック
          checkUserIdIntegrity((recheckErr, updatedIntegrityInfo) => {
            const finalIntegrityInfo = recheckErr
              ? integrityInfo
              : updatedIntegrityInfo;
            renderUsersList(
              req,
              res,
              finalIntegrityInfo,
              "ユーザーIDの連番を自動修正しました"
            );
          });
        }
      });
    } else {
      renderUsersList(req, res, integrityInfo);
    }
  });
});

// ユーザー一覧画面の描画関数
function renderUsersList(req, res, integrityInfo, autoFixMessage = null) {
  db.all(
    "SELECT id, email, role FROM users WHERE role IN ('admin') ORDER BY id",
    [],
    (err, users) => {
      if (err) {
        console.error("ユーザー一覧取得エラー:", err);
        return res.status(500).send("DBエラー: " + err.message);
      }

      console.log("ユーザー一覧取得完了:", users.length, "件");

      // 管理者数を集計
      const admins = users.filter((u) => u.role === "admin");

      // 成功・エラーメッセージを取得
      const success = req.query.success;
      const error = req.query.error;

      try {
        res.render("users_list", {
          users,
          admins,
          integrityInfo,
          autoFixMessage,
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

      // 本番環境ではパスワードをハッシュ化
      const hashedPassword =
        process.env.NODE_ENV === "production"
          ? hashPassword(password)
          : password;

      console.log("管理者アカウント作成:", { email, role: "admin" });

      db.run(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, hashedPassword, "admin"],
        function (err) {
          if (err) {
            console.error("管理者アカウント作成エラー:", err);

            // PostgreSQL固有のエラーハンドリング
            if (err.code === "23505" && err.constraint === "users_email_key") {
              return res.render("users_form", {
                user: null,
                error: `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`,
                session: req.session,
                title: "新規管理者アカウント作成",
              });
            }

            return res.render("users_form", {
              user: null,
              error: `アカウント作成に失敗しました: ${err.message}`,
              session: req.session,
              title: "新規管理者アカウント作成",
            });
          }

          console.log("管理者アカウント作成成功:", email);
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

        console.log(`ユーザー削除完了: ${user.email} (ID: ${userId})`);

        // 削除後にID整合性をチェックし、必要に応じて自動修正
        checkUserIdIntegrity((checkErr, integrityInfo) => {
          if (checkErr) {
            console.error("削除後のID整合性チェックエラー:", checkErr);
            return res.redirect(
              "/api/users/list?success=" +
                encodeURIComponent(`${user.email} のアカウントを削除しました`)
            );
          }

          if (!integrityInfo.isIntegrityOk && integrityInfo.issues.length > 0) {
            console.log("削除後のID整合性問題を発見、自動修正を実行...");
            fixUserIds((fixErr) => {
              if (fixErr) {
                console.error("削除後のID自動修正エラー:", fixErr);
                return res.redirect(
                  "/api/users/list?success=" +
                    encodeURIComponent(
                      `${user.email} のアカウントを削除しました`
                    )
                );
              }

              console.log("削除後のID自動修正完了");
              res.redirect(
                "/api/users/list?success=" +
                  encodeURIComponent(
                    `${user.email} のアカウントを削除し、IDの連番を自動修正しました`
                  )
              );
            });
          } else {
            res.redirect(
              "/api/users/list?success=" +
                encodeURIComponent(`${user.email} のアカウントを削除しました`)
            );
          }
        });
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
