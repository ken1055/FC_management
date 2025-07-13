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

// ID整合性チェック機能（管理者のみ）
function checkUserIdIntegrity(callback) {
  db.all("SELECT id, email FROM admins ORDER BY email", [], (err, admins) => {
    if (err) return callback(err, null);

    const issues = [];
    let expectedId = 1;

    admins.forEach((admin, index) => {
      if (admin.id !== expectedId) {
        issues.push({
          currentId: admin.id,
          expectedId: expectedId,
          email: admin.email,
          role: "admin",
        });
      }
      expectedId++;
    });

    callback(null, {
      totalUsers: admins.length,
      issues: issues,
      isIntegrityOk: issues.length === 0,
    });
  });
}

// ID修正機能（PostgreSQL対応・管理者のみ）
function fixUserIds(callback) {
  console.log("管理者ID修正開始...");

  // 現在の管理者を取得（emailでソート）
  db.all("SELECT id, email FROM admins ORDER BY email", [], (err, admins) => {
    if (err) return callback(err);

    if (admins.length === 0) {
      console.log("修正対象の管理者がありません");
      return callback(null);
    }

    // 修正が必要かチェック
    let needsFixing = false;
    console.log(`取得した管理者数: ${admins.length}`);
    admins.forEach((admin, index) => {
      const expectedId = index + 1;
      if (admin.id !== expectedId) {
        console.log(
          `修正が必要: ID=${admin.id} → 期待値=${expectedId} (${admin.email})`
        );
        needsFixing = true;
      }
    });

    if (!needsFixing) {
      console.log("管理者ID修正は不要です（すべて正常）");
      return callback(null);
    }

    // データベースタイプを判定
    // 実際のデータベース接続を確認してタイプを決定
    const forceSQLite = process.env.FORCE_SQLITE === "true";
    const hasPostgresUrl = !!process.env.DATABASE_URL;
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME;

    // SQLiteを明示的に指定するか、PostgreSQL関連の環境変数がない場合はSQLite
    const isPostgres = !forceSQLite && (hasPostgresUrl || isRailway);

    console.log("管理者ID修正 - データベースタイプ判定:", {
      DATABASE_URL: hasPostgresUrl,
      RAILWAY_ENVIRONMENT_NAME: isRailway,
      NODE_ENV: process.env.NODE_ENV,
      FORCE_SQLITE: process.env.FORCE_SQLITE,
      isPostgres: isPostgres,
    });

    if (isPostgres) {
      // PostgreSQL用の修正処理
      fixUserIdsPostgres(admins, callback);
    } else {
      // SQLite用の修正処理
      fixUserIdsSQLite(admins, callback);
    }
  });
}

// PostgreSQL用のID修正処理（管理者のみ）
function fixUserIdsPostgres(admins, callback) {
  console.log("PostgreSQL環境での管理者ID修正を実行中...");

  if (admins.length === 0) {
    console.log("修正対象の管理者がありません");
    return callback(null);
  }

  // 修正が必要な管理者のみ処理
  console.log("PostgreSQL環境で管理者ID修正を実行します");

  // 一時テーブルを作成してID修正を行う（PostgreSQL/SQLite共通の安全な方法）
  db.run("CREATE TEMP TABLE temp_admins AS SELECT * FROM admins", (err) => {
    if (err) {
      console.error("一時テーブル作成エラー:", err);
      return callback(err);
    }

    console.log("一時テーブル作成成功");

    // PostgreSQL用: 外部キー制約を一時的に無効化
    console.log("PostgreSQL: 管理者用外部キー制約を一時的に無効化中...");
    db.run("SET session_replication_role = replica;", (err) => {
      if (err) {
        console.error("外部キー制約無効化エラー:", err);
        // エラーでも続行（SQLiteとの互換性のため）
      } else {
        console.log("外部キー制約無効化完了");
      }

      // 元の管理者データを削除
      db.run("DELETE FROM admins", (err) => {
        if (err) {
          console.error("管理者データ削除エラー:", err);
          // 制約を再有効化してからエラーを返す
          db.run("SET session_replication_role = DEFAULT;", () => {
            return callback(err);
          });
          return;
        }

        console.log("管理者データ削除完了");

        // 新しいIDで再挿入
        let completed = 0;
        let hasError = false;

        admins.forEach((admin, index) => {
          if (hasError) return;

          const newId = index + 1;
          console.log(`管理者ID修正: ${admin.id} → ${newId} (${admin.email})`);

          db.run(
            "INSERT INTO admins (id, email, password, created_at) SELECT ?, email, password, created_at FROM temp_admins WHERE id = ?",
            [newId, admin.id],
            function (err) {
              if (err) {
                console.error("管理者ID修正エラー:", err);
                hasError = true;
                return callback(err);
              }

              console.log(
                `管理者 ${admin.email} のID修正完了: ${admin.id} → ${newId}`
              );

              // 関連テーブルのadmin_idも更新
              db.run(
                "UPDATE group_admin SET admin_id = ? WHERE admin_id = (SELECT id FROM temp_admins WHERE id = ?)",
                [newId, admin.id],
                (err) => {
                  if (err) {
                    console.error("group_admin テーブル更新エラー:", err);
                    hasError = true;
                    return callback(err);
                  }

                  console.log(
                    `group_admin テーブル更新完了: ${admin.id} → ${newId}`
                  );

                  completed++;
                  console.log(
                    `管理者ID修正完了: ${admin.id} → ${newId} (${admin.email}) [${completed}/${admins.length}]`
                  );

                  if (completed === admins.length && !hasError) {
                    // 一時テーブルを削除
                    db.run("DROP TABLE temp_admins", (err) => {
                      if (err) {
                        console.error("一時テーブル削除エラー:", err);
                      } else {
                        console.log("一時テーブル削除完了");
                      }

                      // PostgreSQL用: 外部キー制約を再有効化
                      console.log(
                        "PostgreSQL: 管理者用外部キー制約を再有効化中..."
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
                          resetPostgreSQLAdminSequence(admins.length, () => {
                            console.log("管理者ID修正完了（PostgreSQL）");
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
  });

  // PostgreSQL用のシーケンスリセット関数
  function resetPostgreSQLAdminSequence(maxId, callback) {
    console.log("PostgreSQL管理者シーケンスリセット試行中...");
    console.log("設定する最大ID:", maxId);

    // 複数のシーケンスリセット方法を試行
    const resetMethods = [
      // 方法1: 現在の最大IDを取得してシーケンスをリセット
      () => {
        db.get(
          "SELECT COALESCE(MAX(id), 0) as max_id FROM admins",
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
              "SELECT setval((SELECT pg_get_serial_sequence('admins', 'id')), ?, true)",
              [currentMaxId],
              (err) => {
                if (err) {
                  console.log(
                    "管理者シーケンスリセット方法1失敗:",
                    err.message
                  );
                  tryMethod2();
                } else {
                  console.log(
                    `管理者シーケンスリセット方法1成功: ${currentMaxId}`
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
          "SELECT COALESCE(MAX(id), 0) as max_id FROM admins",
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
              "SELECT setval('admins_id_seq', ?, true)",
              [currentMaxId],
              (err) => {
                if (err) {
                  console.log(
                    "管理者シーケンスリセット方法2失敗:",
                    err.message
                  );
                  tryMethod3();
                } else {
                  console.log(
                    `管理者シーケンスリセット方法2成功: ${currentMaxId}`
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
        db.run("SELECT setval('admins_id_seq', ?, true)", [maxId], (err) => {
          if (err) {
            console.log("管理者シーケンスリセット方法3失敗:", err.message);
            tryMethod4();
          } else {
            console.log(`管理者シーケンスリセット方法3成功: ${maxId}`);
            callback();
          }
        });
      },
      // 方法4: SQLiteのシーケンステーブル更新（互換性のため）
      () => {
        db.run(
          "UPDATE sqlite_sequence SET seq = ? WHERE name = 'admins'",
          [maxId],
          (err) => {
            if (err) {
              console.log("管理者シーケンスリセット方法4失敗:", err.message);
            } else {
              console.log(`管理者シーケンスリセット方法4成功: ${maxId}`);
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

// SQLite用のID修正処理（管理者のみ）
function fixUserIdsSQLite(admins, callback) {
  console.log("SQLite環境での管理者ID修正を実行中...");

  if (admins.length === 0) {
    console.log("修正対象の管理者がありません");
    return callback(null);
  }

  // 修正が必要な管理者のみ処理
  console.log("SQLite環境で管理者ID修正を実行します");

  // 一時テーブルを作成
  db.run("CREATE TEMP TABLE temp_admins AS SELECT * FROM admins", (err) => {
    if (err) {
      console.error("一時テーブル作成エラー:", err);
      return callback(err);
    }

    console.log("一時テーブル作成成功");

    // 元の管理者データを削除
    db.run("DELETE FROM admins", (err) => {
      if (err) {
        console.error("管理者データ削除エラー:", err);
        return callback(err);
      }

      console.log("管理者データ削除完了");

      // 新しいIDで再挿入
      let completed = 0;
      let hasError = false;

      admins.forEach((admin, index) => {
        if (hasError) return;

        const newId = index + 1;
        console.log(`管理者ID修正: ${admin.id} → ${newId} (${admin.email})`);

        db.run(
          "INSERT INTO admins (id, email, password, created_at) SELECT ?, email, password, created_at FROM temp_admins WHERE id = ?",
          [newId, admin.id],
          function (err) {
            if (err) {
              console.error("管理者ID修正エラー:", err);
              hasError = true;
              return callback(err);
            }

            console.log(
              `管理者 ${admin.email} のID修正完了: ${admin.id} → ${newId}`
            );

            // 関連テーブルのadmin_idも更新
            db.run(
              "UPDATE group_admin SET admin_id = ? WHERE admin_id = (SELECT id FROM temp_admins WHERE id = ?)",
              [newId, admin.id],
              (err) => {
                if (err) {
                  console.error("group_admin テーブル更新エラー:", err);
                  hasError = true;
                  return callback(err);
                }

                console.log(
                  `group_admin テーブル更新完了: ${admin.id} → ${newId}`
                );

                completed++;
                console.log(
                  `管理者ID修正完了: ${admin.id} → ${newId} (${admin.email}) [${completed}/${admins.length}]`
                );

                if (completed === admins.length && !hasError) {
                  // 一時テーブルを削除
                  db.run("DROP TABLE temp_admins", (err) => {
                    if (err) {
                      console.error("一時テーブル削除エラー:", err);
                    } else {
                      console.log("一時テーブル削除完了");
                    }

                    // SQLite環境でのみシーケンステーブルをリセット
                    const forceSQLite = process.env.FORCE_SQLITE === "true";
                    if (forceSQLite) {
                      db.run(
                        "UPDATE sqlite_sequence SET seq = ? WHERE name = 'admins'",
                        [admins.length],
                        (err) => {
                          if (err) {
                            console.error("シーケンスリセットエラー:", err);
                          } else {
                            console.log(
                              `管理者シーケンスを${admins.length}にリセット`
                            );
                          }
                          console.log("管理者ID修正完了（SQLite）");
                          callback(null);
                        }
                      );
                    } else {
                      console.log("管理者ID修正完了（SQLite）");
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
  });
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

    console.log("整合性チェック結果:", integrityInfo);

    // 管理者アカウントのID修正処理を無効化
    console.log("=== 管理者アカウントID修正処理は無効化されています ===");
    console.log("ID整合性の問題があっても自動修正は行いません");

    // 整合性チェック結果を表示するが、修正は行わない
    renderUsersList(req, res, integrityInfo);
  });
});

// ユーザー一覧画面の描画関数
function renderUsersList(req, res, integrityInfo, autoFixMessage = null) {
  db.all(
    "SELECT id, email, created_at FROM admins ORDER BY id",
    [],
    (err, admins) => {
      if (err) {
        console.error("管理者一覧取得エラー:", err);
        return res.status(500).send("DBエラー: " + err.message);
      }

      console.log("管理者一覧取得完了:", admins.length, "件");

      // 成功・エラーメッセージを取得
      const success = req.query.success;
      const error = req.query.error;

      try {
        res.render("users_list", {
          users: admins, // 管理者データをusersとして渡す（テンプレート互換性のため）
          admins: admins,
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

  db.get("SELECT COUNT(*) as cnt FROM admins", [], (err, row) => {
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
      process.env.NODE_ENV === "production" ? hashPassword(password) : password;

    console.log("管理者アカウント作成:", { email, role: "admin" });

    db.run(
      "INSERT INTO admins (email, password) VALUES (?, ?)",
      [email, hashedPassword],
      function (err) {
        if (err) {
          console.error("管理者アカウント作成エラー:", err);

          // PostgreSQL固有のエラーハンドリング
          if (err.code === "23505" && err.constraint === "admins_email_key") {
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
  });
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

  // 管理者アカウントの場合はadminsテーブルに挿入
  if (role === "admin") {
    db.run(
      "INSERT INTO admins (email, password) VALUES (?, ?)",
      [email, hashedPassword],
      function (err) {
        if (err) {
          console.error("管理者作成エラー:", err);

          // PostgreSQL固有のエラーハンドリング
          if (err.code === "23505" && err.constraint === "admins_email_key") {
            return res
              .status(400)
              .send(
                `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
              );
          }

          return res.status(500).send(`管理者作成エラー: ${err.message}`);
        }

        res.json({
          success: true,
          message: "管理者が正常に作成されました",
          userId: this.lastID,
        });
      }
    );
  } else {
    // 代理店アカウントの場合はusersテーブルに挿入
    db.run(
      "INSERT INTO users (email, password, agency_id) VALUES (?, ?, ?)",
      [email, hashedPassword, null], // agency_idはnull
      function (err) {
        if (err) {
          console.error("代理店ユーザー作成エラー:", err);

          // PostgreSQL固有のエラーハンドリング
          if (err.code === "23505" && err.constraint === "users_email_key") {
            return res
              .status(400)
              .send(
                `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
              );
          }

          return res
            .status(500)
            .send(`代理店ユーザー作成エラー: ${err.message}`);
        }

        res.json({
          success: true,
          message: "代理店ユーザーが正常に作成されました",
          userId: this.lastID,
        });
      }
    );
  }
});

// Webインターフェースでのアカウント削除
router.post("/delete/:id", requireRole(["admin"]), (req, res) => {
  const adminId = req.params.id;

  // 自分自身を削除しようとしていないかチェック
  if (req.session.user.id == adminId) {
    return res.redirect(
      "/api/users/list?error=" +
        encodeURIComponent("自分自身のアカウントは削除できません")
    );
  }

  // 管理者情報を取得
  db.get("SELECT * FROM admins WHERE id = ?", [adminId], (err, admin) => {
    if (err) return res.status(500).send("DBエラー");
    if (!admin)
      return res.redirect(
        "/api/users/list?error=" +
          encodeURIComponent("指定された管理者が見つかりません")
      );

    db.run("DELETE FROM admins WHERE id = ?", [adminId], function (err) {
      if (err) return res.status(500).send("削除エラー");

      console.log(`管理者削除完了: ${admin.email} (ID: ${adminId})`);
      console.log("=== 管理者削除後のID自動修正処理は無効化されています ===");

      // ID修正処理を無効化し、削除完了メッセージのみ表示
      res.redirect(
        "/api/users/list?success=" +
          encodeURIComponent(`${admin.email} のアカウントを削除しました`)
      );
    });
  });
});

// API: アカウント削除（従来の機能を維持）
router.delete("/:id", (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).send("DBエラー");
    res.send("削除完了");
  });
});

module.exports = router;
