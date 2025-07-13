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

      if (users.length === 0) {
        console.log("修正対象のユーザーがありません");
        return callback(null);
      }

      // 修正が必要かチェック
      let needsFixing = false;
      console.log(`取得したユーザー数: ${users.length}`);
      users.forEach((user, index) => {
        const expectedId = index + 1;
        if (user.id !== expectedId) {
          console.log(
            `修正が必要: ID=${user.id} → 期待値=${expectedId} (${user.email})`
          );
          needsFixing = true;
        }
      });

      if (!needsFixing) {
        console.log("ユーザーID修正は不要です（すべて正常）");
        return callback(null);
      }

      // データベースタイプを判定
      // 実際のデータベース接続を確認してタイプを決定
      const forceSQLite = process.env.FORCE_SQLITE === "true";
      const hasPostgresUrl = !!process.env.DATABASE_URL;
      const isRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME;

      // SQLiteを明示的に指定するか、PostgreSQL関連の環境変数がない場合はSQLite
      const isPostgres = !forceSQLite && (hasPostgresUrl || isRailway);

      console.log("ユーザーID修正 - データベースタイプ判定:", {
        DATABASE_URL: hasPostgresUrl,
        RAILWAY_ENVIRONMENT_NAME: isRailway,
        NODE_ENV: process.env.NODE_ENV,
        FORCE_SQLITE: process.env.FORCE_SQLITE,
        isPostgres: isPostgres,
      });

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

  if (users.length === 0) {
    console.log("修正対象のユーザーがありません");
    return callback(null);
  }

  // 修正が必要なユーザーのみ処理
  console.log("PostgreSQL環境でユーザーID修正を実行します");

  // 一時テーブルを作成してID修正を行う（PostgreSQL/SQLite共通の安全な方法）
  db.run(
    "CREATE TEMP TABLE temp_users AS SELECT * FROM users WHERE role IN ('admin', 'agency')",
    (err) => {
      if (err) {
        console.error("一時テーブル作成エラー:", err);
        return callback(err);
      }

      console.log("一時テーブル作成成功");

      // PostgreSQL用: 外部キー制約を一時的に無効化
      console.log("PostgreSQL: ユーザー用外部キー制約を一時的に無効化中...");
      db.run("SET session_replication_role = replica;", (err) => {
        if (err) {
          console.error("外部キー制約無効化エラー:", err);
          // エラーでも続行（SQLiteとの互換性のため）
        } else {
          console.log("外部キー制約無効化完了");
        }

        // 元のユーザーデータを削除
        db.run("DELETE FROM users WHERE role IN ('admin', 'agency')", (err) => {
          if (err) {
            console.error("ユーザーデータ削除エラー:", err);
            // 制約を再有効化してからエラーを返す
            db.run("SET session_replication_role = DEFAULT;", () => {
              return callback(err);
            });
            return;
          }

          console.log("ユーザーデータ削除完了");

          // 新しいIDで再挿入
          let completed = 0;
          let hasError = false;

          users.forEach((user, index) => {
            if (hasError) return;

            const newId = index + 1;
            console.log(
              `ユーザーID修正: ${user.id} → ${newId} (${user.email})`
            );

            db.run(
              "INSERT INTO users (id, email, password, role, agency_id) SELECT ?, email, password, role, agency_id FROM temp_users WHERE id = ?",
              [newId, user.id],
              function (err) {
                if (err) {
                  console.error("ユーザーID修正エラー:", err);
                  hasError = true;
                  return callback(err);
                }

                console.log(
                  `ユーザー ${user.email} のID修正完了: ${user.id} → ${newId}`
                );

                // 関連テーブルのadmin_idも更新
                db.run(
                  "UPDATE group_admin SET admin_id = ? WHERE admin_id = (SELECT id FROM temp_users WHERE id = ?)",
                  [newId, user.id],
                  (err) => {
                    if (err) {
                      console.error("group_admin テーブル更新エラー:", err);
                      hasError = true;
                      return callback(err);
                    }

                    console.log(
                      `group_admin テーブル更新完了: ${user.id} → ${newId}`
                    );

                    completed++;
                    console.log(
                      `ユーザーID修正完了: ${user.id} → ${newId} (${user.email}) [${completed}/${users.length}]`
                    );

                    if (completed === users.length && !hasError) {
                      // 一時テーブルを削除
                      db.run("DROP TABLE temp_users", (err) => {
                        if (err) {
                          console.error("一時テーブル削除エラー:", err);
                        } else {
                          console.log("一時テーブル削除完了");
                        }

                        // PostgreSQL用: 外部キー制約を再有効化
                        console.log(
                          "PostgreSQL: ユーザー用外部キー制約を再有効化中..."
                        );
                        db.run(
                          "SET session_replication_role = DEFAULT;",
                          (err) => {
                            if (err) {
                              console.error("外部キー制約再有効化エラー:", err);
                            } else {
                              console.log("外部キー制約再有効化完了");
                            }

                            // PostgreSQL用のシーケンスリセット（試行）
                            resetPostgreSQLUserSequence(users.length, () => {
                              console.log("ユーザーID修正完了（PostgreSQL）");
                              callback(null);
                            });
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
      });
    }
  );

  // PostgreSQL用のシーケンスリセット関数
  function resetPostgreSQLUserSequence(maxId, callback) {
    console.log("PostgreSQLユーザーシーケンスリセット試行中...");
    console.log("設定する最大ID:", maxId);

    // 複数のシーケンスリセット方法を試行
    const resetMethods = [
      // 方法1: 現在の最大IDを取得してシーケンスをリセット
      () => {
        db.get(
          "SELECT COALESCE(MAX(id), 0) as max_id FROM users",
          [],
          (err, row) => {
            if (err) {
              console.log("最大ID取得失敗:", err.message);
              tryMethod2();
              return;
            }

            const currentMaxId = row.max_id;
            console.log("現在の最大ID:", currentMaxId);

            db.run(
              "SELECT setval((SELECT pg_get_serial_sequence('users', 'id')), ?, true)",
              [currentMaxId],
              (err) => {
                if (err) {
                  console.log(
                    "ユーザーシーケンスリセット方法1失敗:",
                    err.message
                  );
                  tryMethod2();
                } else {
                  console.log(
                    `ユーザーシーケンスリセット方法1成功: ${currentMaxId}`
                  );
                  callback();
                }
              }
            );
          }
        );
      },
      // 方法2: 固定シーケンス名で最大IDを使用
      () => {
        db.get(
          "SELECT COALESCE(MAX(id), 0) as max_id FROM users",
          [],
          (err, row) => {
            if (err) {
              console.log("最大ID取得失敗:", err.message);
              tryMethod3();
              return;
            }

            const currentMaxId = row.max_id;
            console.log("現在の最大ID:", currentMaxId);

            db.run(
              "SELECT setval('users_id_seq', ?, true)",
              [currentMaxId],
              (err) => {
                if (err) {
                  console.log(
                    "ユーザーシーケンスリセット方法2失敗:",
                    err.message
                  );
                  tryMethod3();
                } else {
                  console.log(
                    `ユーザーシーケンスリセット方法2成功: ${currentMaxId}`
                  );
                  callback();
                }
              }
            );
          }
        );
      },
      // 方法3: 指定されたmaxIdを使用
      () => {
        db.run("SELECT setval('users_id_seq', ?, true)", [maxId], (err) => {
          if (err) {
            console.log("ユーザーシーケンスリセット方法3失敗:", err.message);
            tryMethod4();
          } else {
            console.log(`ユーザーシーケンスリセット方法3成功: ${maxId}`);
            callback();
          }
        });
      },
      // 方法4: SQLiteのシーケンステーブル更新（互換性のため）
      () => {
        db.run(
          "UPDATE sqlite_sequence SET seq = ? WHERE name = 'users'",
          [maxId],
          (err) => {
            if (err) {
              console.log("ユーザーシーケンスリセット方法4失敗:", err.message);
            } else {
              console.log(`ユーザーシーケンスリセット方法4成功: ${maxId}`);
            }
            // エラーがあってもcallbackを呼ぶ
            callback();
          }
        );
      },
    ];

    const tryMethod1 = resetMethods[0];
    const tryMethod2 = resetMethods[1];
    const tryMethod3 = resetMethods[2];
    const tryMethod4 = resetMethods[3];

    tryMethod1();
  }
}

// SQLite用のID修正処理
function fixUserIdsSQLite(users, callback) {
  console.log("SQLite環境でのユーザーID修正を実行中...");

  if (users.length === 0) {
    console.log("修正対象のユーザーがありません");
    return callback(null);
  }

  // 修正が必要なユーザーのみ処理
  console.log("SQLite環境でユーザーID修正を実行します");

  // 一時テーブルを作成
  db.run(
    "CREATE TEMP TABLE temp_users AS SELECT * FROM users WHERE role IN ('admin', 'agency')",
    (err) => {
      if (err) {
        console.error("一時テーブル作成エラー:", err);
        return callback(err);
      }

      console.log("一時テーブル作成成功");

      // 元のユーザーデータを削除
      db.run("DELETE FROM users WHERE role IN ('admin', 'agency')", (err) => {
        if (err) {
          console.error("ユーザーデータ削除エラー:", err);
          return callback(err);
        }

        console.log("ユーザーデータ削除完了");

        // 新しいIDで再挿入
        let completed = 0;
        let hasError = false;

        users.forEach((user, index) => {
          if (hasError) return;

          const newId = index + 1;
          console.log(`ユーザーID修正: ${user.id} → ${newId} (${user.email})`);

          db.run(
            "INSERT INTO users (id, email, password, role, agency_id) SELECT ?, email, password, role, agency_id FROM temp_users WHERE id = ?",
            [newId, user.id],
            function (err) {
              if (err) {
                console.error("ユーザーID修正エラー:", err);
                hasError = true;
                return callback(err);
              }

              console.log(
                `ユーザー ${user.email} のID修正完了: ${user.id} → ${newId}`
              );

              // 関連テーブルのadmin_idも更新
              db.run(
                "UPDATE group_admin SET admin_id = ? WHERE admin_id = (SELECT id FROM temp_users WHERE id = ?)",
                [newId, user.id],
                (err) => {
                  if (err) {
                    console.error("group_admin テーブル更新エラー:", err);
                    hasError = true;
                    return callback(err);
                  }

                  console.log(
                    `group_admin テーブル更新完了: ${user.id} → ${newId}`
                  );

                  completed++;
                  console.log(
                    `ユーザーID修正完了: ${user.id} → ${newId} (${user.email}) [${completed}/${users.length}]`
                  );

                  if (completed === users.length && !hasError) {
                    // 一時テーブルを削除
                    db.run("DROP TABLE temp_users", (err) => {
                      if (err) {
                        console.error("一時テーブル削除エラー:", err);
                      } else {
                        console.log("一時テーブル削除完了");
                      }

                      // SQLite環境でのみシーケンステーブルをリセット
                      const forceSQLite = process.env.FORCE_SQLITE === "true";
                      if (forceSQLite) {
                        db.run(
                          "UPDATE sqlite_sequence SET seq = ? WHERE name = 'users'",
                          [users.length],
                          (err) => {
                            if (err) {
                              console.error("シーケンスリセットエラー:", err);
                            } else {
                              console.log(
                                `ユーザーシーケンスを${users.length}にリセット`
                              );
                            }
                            console.log("ユーザーID修正完了（SQLite）");
                            callback(null);
                          }
                        );
                      } else {
                        console.log("ユーザーID修正完了（SQLite）");
                        callback(null);
                      }
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

    // 強制修正を無効化し、問題がある場合のみ修正を実行
    if (integrityInfo.issues && integrityInfo.issues.length > 0) {
      console.log("=== ユーザーID修正を実行（問題検出） ===");

      fixUserIds((fixErr) => {
        if (fixErr) {
          console.error("ユーザーID修正エラー:", fixErr);
          // エラーがあっても画面表示は続行
          renderUsersList(req, res, integrityInfo);
        } else {
          console.log("ユーザーID修正完了");
          // 修正完了後、再度整合性チェック
          checkUserIdIntegrity((recheckErr, updatedIntegrityInfo) => {
            const finalIntegrityInfo = recheckErr
              ? integrityInfo
              : updatedIntegrityInfo;
            renderUsersList(
              req,
              res,
              finalIntegrityInfo,
              "ユーザーIDの連番を修正しました"
            );
          });
        }
      });
    } else {
      console.log("=== ユーザーID修正スキップ（問題なし） ===");
      // 問題がない場合は修正をスキップして直接表示
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
