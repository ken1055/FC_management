const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const {
  sendProfileRegistrationNotification,
  sendProfileUpdateNotification,
  sendAgencyRegistrationNotification, // 新規追加
  getAdminEmails,
} = require("../config/email");

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// 代理店登録通知メールテスト（管理者のみ）
router.post(
  "/test-registration-email",
  requireRole(["admin"]),
  async (req, res) => {
    try {
      // 管理者メールアドレス一覧を取得
      const adminEmails = getAdminEmails();

      // テスト用のダミー代理店データ
      const testAgencyData = {
        id: 999,
        name: "テスト代理店株式会社",
        age: 35,
        address: "東京都新宿区テスト町1-2-3 テストビル4階",
        bank_info: "テスト銀行 普通 1234567 テスト代理店",
        experience_years: 8,
        contract_date: "2024-01-01",
        start_date: "2024-01-15",
        email: "test-agency@example.com", // テスト用メールアドレス
      };

      const testAdminUser = {
        email: req.session.user.email,
        id: req.session.user.id,
      };

      // テストメール送信（ユーザーアカウントありの場合）
      const result = await sendAgencyRegistrationNotification(
        testAgencyData,
        testAdminUser,
        true // hasUserAccount = true
      );

      if (result) {
        res.json({
          success: true,
          message: `代理店登録通知テストメールが正常に送信されました。${adminEmails.length}件の管理者メールアドレスに送信しました。`,
          adminEmails: adminEmails,
          testData: {
            agencyName: testAgencyData.name,
            hasUserAccount: true,
          },
        });
      } else {
        res.json({
          success: false,
          message: "メール送信に失敗しました。サーバーログを確認してください。",
          adminEmails: adminEmails,
        });
      }
    } catch (error) {
      console.error("代理店登録通知テストメール送信エラー:", error);
      res.json({
        success: false,
        message: "エラーが発生しました: " + error.message,
      });
    }
  }
);

// メール設定テスト（管理者のみ）
router.post("/test-email", requireRole(["admin"]), async (req, res) => {
  try {
    // 管理者メールアドレス一覧を取得
    const adminEmails = getAdminEmails();

    // テスト用のダミーデータ
    const testAgencyData = {
      id: 999,
      name: "テスト代理店",
      age: 30,
      address: "東京都テスト区テスト町1-1-1",
      bank_info: "テスト銀行 普通 1234567",
      experience_years: 5,
      contract_date: "2024-01-01",
      start_date: "2024-01-15",
    };

    const testUserData = {
      email: req.session.user.email,
      id: req.session.user.id,
    };

    // テストメール送信
    const result = await sendProfileRegistrationNotification(
      testAgencyData,
      testUserData
    );

    if (result) {
      res.json({
        success: true,
        message: `テストメールが正常に送信されました。${adminEmails.length}件の管理者メールアドレスに送信しました。`,
        adminEmails: adminEmails,
      });
    } else {
      res.json({
        success: false,
        message: "メール送信に失敗しました。サーバーログを確認してください。",
        adminEmails: adminEmails,
      });
    }
  } catch (error) {
    console.error("テストメール送信エラー:", error);
    res.json({
      success: false,
      message: "エラーが発生しました: " + error.message,
    });
  }
});

// 代理店一覧取得
router.get("/", (req, res) => {
  db.all("SELECT * FROM stores", [], (err, rows) => {
    if (err) return res.status(500).send("DBエラー");
    res.json(rows);
  });
});

// ID整合性チェック機能（代理店用）
function checkAgencyIdIntegrity(callback) {
  console.log("代理店ID整合性チェック開始...");

  db.all("SELECT id, name FROM stores ORDER BY name", [], (err, stores) => {
    if (err) {
      console.error("代理店ID整合性チェック - DB取得エラー:", err);
      return callback(err, null);
    }

    console.log(`代理店ID整合性チェック - 取得した代理店数: ${stores.length}`);
    console.log(
      "代理店一覧:",
      stores.map((a) => `ID:${a.id} Name:${a.name}`)
    );

    const issues = [];
    let expectedId = 1;

    stores.forEach((agency, index) => {
      console.log(
        `チェック中: ID=${agency.id}, 期待値=${expectedId}, 名前=${agency.name}`
      );

      if (agency.id !== expectedId) {
        const issue = {
          currentId: agency.id,
          expectedId: expectedId,
          name: agency.name,
        };
        issues.push(issue);
        console.log(`ID問題発見:`, issue);
      }
      expectedId++;
    });

    const result = {
      totalAgencies: stores.length,
      issues: issues,
      isIntegrityOk: issues.length === 0,
    };

    console.log("代理店ID整合性チェック結果:", result);
    callback(null, result);
  });
}

// ID修正機能（代理店用・PostgreSQL対応）
function fixAgencyIds(callback) {
  console.log("=== 代理店ID修正開始 ===");
  console.log("現在の環境変数:");
  console.log("- DATABASE_URL:", !!process.env.DATABASE_URL);
  console.log(
    "- RAILWAY_ENVIRONMENT_NAME:",
    process.env.RAILWAY_ENVIRONMENT_NAME
  );
  console.log("- NODE_ENV:", process.env.NODE_ENV);

  // 現在の代理店を取得（nameでソート）
  db.all("SELECT id, name FROM stores ORDER BY name", [], (err, stores) => {
    if (err) {
      console.error("代理店取得エラー:", err);
      return callback(err);
    }

    console.log(`取得した代理店数: ${stores.length}`);
    console.log(
      "代理店一覧:",
      stores.map((a) => `ID:${a.id} Name:${a.name}`)
    );

    if (stores.length === 0) {
      console.log("修正対象の代理店がありません");
      return callback(null);
    }

    // 修正が必要かチェック
    let needsFixing = false;
    stores.forEach((agency, index) => {
      const expectedId = index + 1;
      if (agency.id !== expectedId) {
        console.log(
          `修正が必要: ID=${agency.id} → 期待値=${expectedId} (${agency.name})`
        );
        needsFixing = true;
      }
    });

    if (!needsFixing) {
      console.log("ID修正は不要です（すべて正常）");
      return callback(null);
    }

    // データベースタイプを判定
    // 実際のデータベース接続を確認してタイプを決定
    const forceSQLite = process.env.FORCE_SQLITE === "true";
    const hasPostgresUrl = !!process.env.DATABASE_URL;
    const isRailway = !!process.env.RAILWAY_ENVIRONMENT_NAME;

    // SQLiteを明示的に指定するか、PostgreSQL関連の環境変数がない場合はSQLite
    const isPostgres = !forceSQLite && (hasPostgresUrl || isRailway);

    console.log("データベースタイプ判定結果:", {
      DATABASE_URL: hasPostgresUrl,
      RAILWAY_ENVIRONMENT_NAME: isRailway,
      NODE_ENV: process.env.NODE_ENV,
      FORCE_SQLITE: process.env.FORCE_SQLITE,
      isPostgres: isPostgres,
    });

    if (isPostgres) {
      console.log("PostgreSQL環境での修正を実行");
      // PostgreSQL用の修正処理
      fixAgencyIdsPostgres(stores, callback);
    } else {
      console.log("SQLite環境での修正を実行");
      // SQLite用の修正処理
      fixAgencyIdsSQLite(stores, callback);
    }
  });
}

// PostgreSQL用のID修正処理
function fixAgencyIdsPostgres(stores, callback) {
  console.log("=== PostgreSQL環境でのID修正開始 ===");

  if (stores.length === 0) {
    console.log("修正対象の代理店がありません");
    return callback(null);
  }

  // 修正が必要な代理店のみ処理
  console.log("PostgreSQL環境でID修正を実行します");

  // 一時テーブルを作成してID修正を行う（PostgreSQL/SQLite共通の安全な方法）
  db.run("CREATE TEMP TABLE temp_stores AS SELECT * FROM stores", (err) => {
    if (err) {
      console.error("一時テーブル作成エラー:", err);
      return callback(err);
    }

    console.log("一時テーブル作成成功");

    // PostgreSQL用: 外部キー制約を一時的に無効化
    console.log("PostgreSQL: 外部キー制約を一時的に無効化中...");
    db.run("SET session_replication_role = replica;", (err) => {
      if (err) {
        console.error("外部キー制約無効化エラー:", err);
        // エラーでも続行（SQLiteとの互換性のため）
      } else {
        console.log("外部キー制約無効化完了");
      }

      // 元の代理店データを削除
      db.run("DELETE FROM stores", (err) => {
        if (err) {
          console.error("代理店データ削除エラー:", err);
          // 制約を再有効化してからエラーを返す
          db.run("SET session_replication_role = DEFAULT;", () => {
            return callback(err);
          });
          return;
        }

        console.log("代理店データ削除完了");

        // 新しいIDで再挿入
        let completed = 0;
        let hasError = false;

        stores.forEach((agency, index) => {
          if (hasError) return;

          const newId = index + 1;
          console.log(`代理店ID修正: ${agency.id} → ${newId} (${agency.name})`);

          db.run(
            "INSERT INTO stores (id, name, age, address, bank_info, experience_years, contract_date, start_date) SELECT ?, name, age, address, bank_info, experience_years, contract_date, start_date FROM temp_stores WHERE id = ?",
            [newId, agency.id],
            function (err) {
              if (err) {
                console.error("代理店ID修正エラー:", err);
                hasError = true;
                return callback(err);
              }

              console.log(
                `代理店 ${agency.name} のID修正完了: ${agency.id} → ${newId}`
              );

              // 関連テーブルのstore_idも更新（順次処理）
              updateRelatedTablesSequentiallyPostgres(
                agency.id,
                newId,
                (updateErr) => {
                  if (updateErr) {
                    console.error("関連テーブル更新エラー:", updateErr);
                    hasError = true;
                    return callback(updateErr);
                  }

                  completed++;
                  console.log(
                    `代理店ID修正完了: ${agency.id} → ${newId} (${agency.name}) [${completed}/${stores.length}]`
                  );

                  if (completed === stores.length && !hasError) {
                    // 一時テーブルを削除
                    db.run("DROP TABLE temp_stores", (err) => {
                      if (err) {
                        console.error("一時テーブル削除エラー:", err);
                      } else {
                        console.log("一時テーブル削除完了");
                      }

                      // PostgreSQL用: 外部キー制約を再有効化
                      console.log("PostgreSQL: 外部キー制約を再有効化中...");
                      db.run(
                        "SET session_replication_role = DEFAULT;",
                        (err) => {
                          if (err) {
                            console.error("外部キー制約再有効化エラー:", err);
                          } else {
                            console.log("外部キー制約再有効化完了");
                          }

                          // PostgreSQL用のシーケンスリセット（試行）
                          resetPostgreSQLSequence(stores.length, () => {
                            console.log(
                              "=== 代理店ID修正完了（PostgreSQL） ==="
                            );
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

  // 関連テーブルを順次更新する関数（PostgreSQL用）
  function updateRelatedTablesSequentiallyPostgres(
    originalId,
    newId,
    callback
  ) {
    console.log(`関連テーブル更新開始: ${originalId} → ${newId}`);

    // 1. sales テーブル
    db.run(
      "UPDATE sales SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
      [newId, originalId],
      (err) => {
        if (err) {
          console.error("sales テーブル更新エラー:", err);
          return callback(err);
        }
        console.log(`sales テーブル更新完了: ${originalId} → ${newId}`);

        // 2. materials テーブル
        db.run(
          "UPDATE materials SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
          [newId, originalId],
          (err) => {
            if (err) {
              console.error("materials テーブル更新エラー:", err);
              return callback(err);
            }
            console.log(`materials テーブル更新完了: ${originalId} → ${newId}`);

            // 3. group_members テーブル
            db.run(
              "UPDATE group_members SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
              [newId, originalId],
              (err) => {
                if (err) {
                  console.error("group_members テーブル更新エラー:", err);
                  return callback(err);
                }
                console.log(
                  `group_members テーブル更新完了: ${originalId} → ${newId}`
                );

                // 4. store_products テーブル
                db.run(
                  "UPDATE store_products SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
                  [newId, originalId],
                  (err) => {
                    if (err) {
                      console.error("store_products テーブル更新エラー:", err);
                      return callback(err);
                    }
                    console.log(
                      `store_products テーブル更新完了: ${originalId} → ${newId}`
                    );

                    // 5. users テーブル
                    db.run(
                      "UPDATE users SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
                      [newId, originalId],
                      (err) => {
                        if (err) {
                          console.error("users テーブル更新エラー:", err);
                          return callback(err);
                        }
                        console.log(
                          `users テーブル更新完了: ${originalId} → ${newId}`
                        );

                        // 6. product_files テーブル
                        db.run(
                          "UPDATE product_files SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
                          [newId, originalId],
                          (err) => {
                            if (err) {
                              console.error(
                                "product_files テーブル更新エラー:",
                                err
                              );
                              return callback(err);
                            }
                            console.log(
                              `product_files テーブル更新完了: ${originalId} → ${newId}`
                            );

                            // 全ての関連テーブル更新完了
                            console.log(
                              `関連テーブル更新完了: ${originalId} → ${newId}`
                            );
                            callback(null);
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  }

  // PostgreSQL用のシーケンスリセット関数
  function resetPostgreSQLSequence(maxId, callback) {
    console.log("PostgreSQLシーケンスリセット試行中...");
    console.log("設定する最大ID:", maxId);

    // 複数のシーケンスリセット方法を試行
    const resetMethods = [
      // 方法1: 現在の最大IDを取得してシーケンスをリセット
      () => {
        db.get(
          "SELECT COALESCE(MAX(id), 0) as max_id FROM stores",
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
              "SELECT setval((SELECT pg_get_serial_sequence('stores', 'id')), ?, true)",
              [currentMaxId],
              (err) => {
                if (err) {
                  console.log("シーケンスリセット方法1失敗:", err.message);
                  tryMethod2();
                } else {
                  console.log(`シーケンスリセット方法1成功: ${currentMaxId}`);
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
          "SELECT COALESCE(MAX(id), 0) as max_id FROM stores",
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
              "SELECT setval('stores_id_seq', ?, true)",
              [currentMaxId],
              (err) => {
                if (err) {
                  console.log("シーケンスリセット方法2失敗:", err.message);
                  tryMethod3();
                } else {
                  console.log(`シーケンスリセット方法2成功: ${currentMaxId}`);
                  callback();
                }
              }
            );
          }
        );
      },
      // 方法3: 指定されたmaxIdを使用
      () => {
        db.run("SELECT setval('stores_id_seq', ?, true)", [maxId], (err) => {
          if (err) {
            console.log("シーケンスリセット方法3失敗:", err.message);
            tryMethod4();
          } else {
            console.log(`シーケンスリセット方法3成功: ${maxId}`);
            callback();
          }
        });
      },
      // 方法4: SQLiteのシーケンステーブル更新（互換性のため）
      () => {
        db.run(
          "UPDATE sqlite_sequence SET seq = ? WHERE name = 'stores'",
          [maxId],
          (err) => {
            if (err) {
              console.log("シーケンスリセット方法4失敗:", err.message);
            } else {
              console.log(`シーケンスリセット方法4成功: ${maxId}`);
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
function fixAgencyIdsSQLite(stores, callback) {
  console.log("=== SQLite環境でのID修正開始 ===");

  if (stores.length === 0) {
    console.log("修正対象の代理店がありません");
    return callback(null);
  }

  // 修正が必要な代理店のみ処理
  console.log("SQLite環境でID修正を実行します");

  // 一時テーブルを作成
  db.run("CREATE TEMP TABLE temp_stores AS SELECT * FROM stores", (err) => {
    if (err) {
      console.error("一時テーブル作成エラー:", err);
      return callback(err);
    }

    console.log("一時テーブル作成成功");

    // 元の代理店データを削除
    db.run("DELETE FROM stores", (err) => {
      if (err) {
        console.error("代理店データ削除エラー:", err);
        return callback(err);
      }

      console.log("代理店データ削除完了");

      // 新しいIDで再挿入
      let completed = 0;
      let hasError = false;

      stores.forEach((agency, index) => {
        if (hasError) return;

        const newId = index + 1;
        console.log(`代理店ID修正: ${agency.id} → ${newId} (${agency.name})`);

        db.run(
          "INSERT INTO stores (id, name, age, address, bank_info, experience_years, contract_date, start_date) SELECT ?, name, age, address, bank_info, experience_years, contract_date, start_date FROM temp_stores WHERE id = ?",
          [newId, agency.id],
          function (err) {
            if (err) {
              console.error("代理店ID修正エラー:", err);
              hasError = true;
              return callback(err);
            }

            console.log(
              `代理店 ${agency.name} のID修正完了: ${agency.id} → ${newId}`
            );

            // 関連テーブルのstore_idも更新（順次処理）
            updateRelatedTablesSequentially(agency.id, newId, (updateErr) => {
              if (updateErr) {
                console.error("関連テーブル更新エラー:", updateErr);
                hasError = true;
                return callback(updateErr);
              }

              completed++;
              console.log(
                `代理店ID修正完了: ${agency.id} → ${newId} (${agency.name}) [${completed}/${stores.length}]`
              );

              if (completed === stores.length && !hasError) {
                // 一時テーブルを削除
                db.run("DROP TABLE temp_stores", (err) => {
                  if (err) {
                    console.error("一時テーブル削除エラー:", err);
                  } else {
                    console.log("一時テーブル削除完了");
                  }

                  // SQLite環境でのみシーケンステーブルをリセット
                  const forceSQLite = process.env.FORCE_SQLITE === "true";
                  if (forceSQLite) {
                    db.run(
                      "UPDATE sqlite_sequence SET seq = ? WHERE name = 'stores'",
                      [stores.length],
                      (err) => {
                        if (err) {
                          console.error("シーケンスリセットエラー:", err);
                        } else {
                          console.log(
                            `代理店シーケンスを${stores.length}にリセット`
                          );
                        }
                        console.log("=== 代理店ID修正完了（SQLite） ===");
                        callback(null);
                      }
                    );
                  } else {
                    console.log("=== 代理店ID修正完了（SQLite） ===");
                    callback(null);
                  }
                });
              }
            });
          }
        );
      });
    });
  });

  // 関連テーブルを順次更新する関数
  function updateRelatedTablesSequentially(originalId, newId, callback) {
    console.log(`関連テーブル更新開始: ${originalId} → ${newId}`);

    // 1. sales テーブル
    db.run(
      "UPDATE sales SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
      [newId, originalId],
      (err) => {
        if (err) {
          console.error("sales テーブル更新エラー:", err);
          return callback(err);
        }
        console.log(`sales テーブル更新完了: ${originalId} → ${newId}`);

        // 2. materials テーブル
        db.run(
          "UPDATE materials SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
          [newId, originalId],
          (err) => {
            if (err) {
              console.error("materials テーブル更新エラー:", err);
              return callback(err);
            }
            console.log(`materials テーブル更新完了: ${originalId} → ${newId}`);

            // 3. group_members テーブル
            db.run(
              "UPDATE group_members SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
              [newId, originalId],
              (err) => {
                if (err) {
                  console.error("group_members テーブル更新エラー:", err);
                  return callback(err);
                }
                console.log(
                  `group_members テーブル更新完了: ${originalId} → ${newId}`
                );

                // 4. store_products テーブル
                db.run(
                  "UPDATE store_products SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
                  [newId, originalId],
                  (err) => {
                    if (err) {
                      console.error("store_products テーブル更新エラー:", err);
                      return callback(err);
                    }
                    console.log(
                      `store_products テーブル更新完了: ${originalId} → ${newId}`
                    );

                    // 5. users テーブル
                    db.run(
                      "UPDATE users SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
                      [newId, originalId],
                      (err) => {
                        if (err) {
                          console.error("users テーブル更新エラー:", err);
                          return callback(err);
                        }
                        console.log(
                          `users テーブル更新完了: ${originalId} → ${newId}`
                        );

                        // 6. product_files テーブル
                        db.run(
                          "UPDATE product_files SET store_id = ? WHERE store_id = (SELECT id FROM temp_stores WHERE id = ?)",
                          [newId, originalId],
                          (err) => {
                            if (err) {
                              console.error(
                                "product_files テーブル更新エラー:",
                                err
                              );
                              return callback(err);
                            }
                            console.log(
                              `product_files テーブル更新完了: ${originalId} → ${newId}`
                            );

                            // 全ての関連テーブル更新完了
                            console.log(
                              `関連テーブル更新完了: ${originalId} → ${newId}`
                            );
                            callback(null);
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  }
}

// 代理店一覧ページ
router.get("/list", requireRole(["admin"]), (req, res) => {
  const { group_id, search, message } = req.query;

  console.log("=== 代理店一覧ページアクセス ===");
  console.log("リクエストパラメータ:", { group_id, search, message });

  // 代理店IDの整合性をチェック
  checkAgencyIdIntegrity((err, integrityInfo) => {
    // エラーが発生した場合はデフォルト値を設定
    if (err || !integrityInfo) {
      console.error("代理店ID整合性チェックエラー:", err);
      integrityInfo = {
        totalAgencies: 0,
        issues: [],
        isIntegrityOk: true,
      };
    }

    console.log("代理店ID整合性チェック結果:", integrityInfo);

    // 代理店のID修正処理を無効化
    console.log("=== 代理店ID修正処理は無効化されています ===");
    console.log("ID整合性の問題があっても自動修正は行いません");

    // 整合性チェック結果を表示するが、修正は行わない
    renderAgenciesList(req, res, group_id, search, integrityInfo, message);
  });
});

// 代理店一覧画面の描画関数
function renderAgenciesList(
  req,
  res,
  groupId,
  searchQuery,
  integrityInfo,
  message = null,
  autoFixMessage = null
) {
  console.log("=== renderAgenciesList実行 ===");
  console.log("グループID:", groupId);

  // グループ一覧を取得
  db.all("SELECT * FROM groups", [], (err, groups) => {
    if (err) {
      console.error("グループ取得エラー:", err);
      return res.status(500).send("DBエラー: " + err.message);
    }

    // データベースタイプに応じて store_products 参照を制御
    const { isSupabaseConfigured } = require("../config/database");
    const isPostgres = !!process.env.DATABASE_URL;
    const useSupabase = isSupabaseConfigured && isSupabaseConfigured();

    let query = `
    SELECT 
      a.*,
      g.name as group_name,
      ${
        useSupabase
          ? "NULL as product_count, NULL as product_names"
          : isPostgres
          ? "COUNT(CASE WHEN ap.product_name IS NOT NULL AND ap.product_name != '' THEN 1 END) as product_count, STRING_AGG(CASE WHEN ap.product_name IS NOT NULL AND ap.product_name != '' THEN ap.product_name END, ', ' ORDER BY ap.product_name) as product_names"
          : "COUNT(CASE WHEN ap.product_name IS NOT NULL AND ap.product_name != '' THEN 1 END) as product_count, GROUP_CONCAT(CASE WHEN ap.product_name IS NOT NULL AND ap.product_name != '' THEN ap.product_name END, ', ') as product_names"
      },
      COALESCE(COUNT(s.id), 0) as sales_count,
      COALESCE(SUM(s.amount), 0) as total_sales
    FROM stores a 
    LEFT JOIN group_members ga ON a.id = ga.store_id 
    LEFT JOIN groups g ON ga.group_id = g.id
    ${useSupabase ? "" : "LEFT JOIN store_products ap ON a.id = ap.store_id"}
    LEFT JOIN sales s ON a.id = s.store_id
  `;
    let params = [];
    let conditions = [];

    if (groupId) {
      conditions.push("ga.group_id = ?");
      params.push(groupId);
    }

    if (searchQuery) {
      if (useSupabase) {
        conditions.push("(a.name LIKE ?)");
        params.push(`%${searchQuery}%`);
      } else {
        conditions.push(
          "(a.name LIKE ? OR a.address LIKE ? OR a.bank_info LIKE ? OR ap.product_name LIKE ?)"
        );
        params.push(
          `%${searchQuery}%`,
          `%${searchQuery}%`,
          `%${searchQuery}%`,
          `%${searchQuery}%`
        );
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // PostgreSQLでは、SELECTで選択するすべての非集約列をGROUP BYに含める必要がある
    if (!useSupabase && isPostgres) {
      query +=
        " GROUP BY a.id, a.name, a.business_address, a.main_phone, a.manager_name, a.mobile_phone, a.representative_email, a.contract_type, a.contract_start_date, a.royalty_rate, a.invoice_number, a.bank_name, a.branch_name, a.account_type, a.account_number, a.account_holder, a.license_status, a.license_type, a.license_number, a.license_file_path, a.line_official_id, a.representative_gmail, g.name ORDER BY a.id";
    } else {
      query += " GROUP BY a.id ORDER BY a.id";
    }

    db.all(query, params, (err, stores) => {
      if (err) {
        console.error("代理店一覧取得エラー:", err);
        return res.status(500).send("DBエラー: " + err.message);
      }

      if (stores && stores.length > 0) {
        const sample = stores[0];
        console.log("stores_list 表示用フィールド確認:", Object.keys(sample));
        console.log("sample:", {
          id: sample.id,
          name: sample.name,
          manager_name: sample.manager_name,
          business_address: sample.business_address,
          main_phone: sample.main_phone,
          contract_type: sample.contract_type,
          contract_start_date: sample.contract_start_date,
          royalty_rate: sample.royalty_rate,
        });
      }

      console.log("代理店一覧取得完了:", stores.length, "件");

      res.render("stores_list", {
        stores,
        groups,
        selectedGroupId: groupId,
        searchQuery,
        session: req.session,
        success: message,
        integrityInfo,
        autoFixMessage,
      });
    });
  });
}

// 新規登録フォーム
router.get("/new", requireRole(["admin"]), (req, res) => {
  res.render("agencies_form", {
    agency: null,
    session: req.session,
    title: "店舗新規登録",
  });
});

// 編集フォーム
router.get("/edit/:id", requireRole(["admin"]), (req, res) => {
  const { isSupabaseConfigured } = require("../config/database");
  db.get(
    "SELECT * FROM stores WHERE id = ?",
    [req.params.id],
    (err, agency) => {
      if (err || !agency) return res.status(404).send("データがありません");

      // Supabaseでは store_products は未使用のためスキップ
      if (isSupabaseConfigured && isSupabaseConfigured()) {
        agency.products = [];
        return res.render("agencies_form", {
          agency,
          session: req.session,
          title: "店舗編集",
        });
      }

      // 取り扱い商品を取得（ローカルSQLite等）
      db.all(
        "SELECT product_name FROM store_products WHERE store_id = ?",
        [req.params.id],
        (err, products) => {
          if (err) {
            console.error("商品取得エラー:", err);
            products = [];
          }

          agency.products = products.map((p) => ({
            product_name: p.product_name,
            product_detail: null,
            product_url: null,
          }));

          res.render("agencies_form", {
            agency,
            session: req.session,
            title: "店舗編集",
          });
        }
      );
    }
  );
});

// 代理店登録
router.post("/", (req, res) => {
  const {
    name,
    age,
    address,
    bank_info,
    experience_years,
    contract_date,
  } = req.body;
  db.run(
    "INSERT INTO stores (name, business_address, contract_start_date) VALUES (?, ?, ?)",
    [name, address, contract_date || null],
    function (err) {
      if (err) return res.status(500).send("DBエラー");
      res.json({ id: this.lastID });
    }
  );
});

// 代理店編集
router.put("/:id", (req, res) => {
  const {
    name,
    age,
    address,
    bank_info,
    experience_years,
    contract_date,
  } = req.body;
  db.run(
    "UPDATE stores SET name=?, business_address=?, contract_start_date=? WHERE id=?",
    [name, address, contract_date || null, req.params.id],
    function (err) {
      if (err) return res.status(500).send("DBエラー");
      res.send("更新完了");
    }
  );
});

// 新規登録（フォームPOST対応）
router.post("/new", requireRole(["admin"]), (req, res) => {
  console.log("=== 新規登録処理開始 ===");
  console.log("リクエストボディ:", req.body);

  try {
    const {
      name,
      // 店舗基本情報
      business_address,
      main_phone,
      manager_name,
      mobile_phone,
      representative_email,
      // 契約基本情報
      contract_type,
      contract_start_date,
      royalty_rate,
      // 請求基本情報
      invoice_number,
      bank_name,
      branch_name,
      account_type,
      account_number,
      account_holder,
      // 許認可情報
      license_status,
      license_type,
      license_number,
      license_file_path,
      // 連携ID
      line_official_id,
      representative_gmail,
      // ユーザーアカウント情報
      email,
      password,
      password_confirm,
    } = req.body;

    // 必須フィールドのチェック
    if (!name || name.trim() === "") {
      return res.status(400).send("店舗名は必須です");
    }

    // データ処理: 空文字列をNULLに変換
    const processedRoyaltyRate =
      royalty_rate && royalty_rate.trim() !== ""
        ? parseFloat(royalty_rate)
        : 5.0;
    const processedContractStartDate =
      contract_start_date && contract_start_date.trim() !== ""
        ? contract_start_date
        : null;

    // パスワード確認
    if (email && password && password !== password_confirm) {
      return res.status(400).send("パスワードが一致しません");
    }

    // メールアドレスの重複チェック
    if (email) {
      db.get(
        "SELECT id FROM users WHERE email = ?",
        [email],
        (err, existingUser) => {
          if (err) {
            console.error("メールアドレス重複チェックエラー:", err);
            return res.status(500).send("DBエラー");
          }
          if (existingUser) {
            return res
              .status(400)
              .send("このメールアドレスは既に使用されています");
          }

          // 代理店とユーザーを作成
          createAgencyWithUser();
        }
      );
    } else {
      // メールアドレスが指定されていない場合は代理店のみ作成
      createAgencyOnly();
    }

    function createAgencyOnly() {
      db.run(
        `INSERT INTO stores (
          name, business_address, main_phone, manager_name, mobile_phone, representative_email,
          contract_type, contract_start_date, royalty_rate,
          invoice_number, bank_name, branch_name, account_type, account_number, account_holder,
          license_status, license_type, license_number, license_file_path,
          line_official_id, representative_gmail
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          business_address,
          main_phone,
          manager_name,
          mobile_phone,
          representative_email,
          contract_type,
          processedContractStartDate,
          processedRoyaltyRate,
          invoice_number,
          bank_name,
          branch_name,
          account_type,
          account_number,
          account_holder,
          license_status || "none",
          license_type,
          license_number,
          license_file_path,
          line_official_id,
          representative_gmail,
        ],
        function (err) {
          if (err) {
            console.error("店舗作成エラー:", err);
            return res.status(500).send(`店舗作成エラー: ${err.message}`);
          }

          const agencyId = this.lastID;
          console.log(`店舗作成完了: ID=${agencyId}, 名前=${name}`);
          res.redirect(
            "/stores/list?message=" + encodeURIComponent("店舗を作成しました")
          );
        }
      );
    }

    function createAgencyWithUser() {
      // パスワードをハッシュ化
      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) return res.status(500).send("パスワードハッシュ化エラー");

        // 店舗を作成
        db.run(
          `INSERT INTO stores (
            name, business_address, main_phone, manager_name, mobile_phone, representative_email,
            contract_type, contract_start_date, royalty_rate,
            invoice_number, bank_name, branch_name, account_type, account_number, account_holder,
            license_status, license_type, license_number, license_file_path,
            line_official_id, representative_gmail
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name,
            business_address,
            main_phone,
            manager_name,
            mobile_phone,
            representative_email,
            contract_type,
            processedContractStartDate,
            processedRoyaltyRate,
            invoice_number,
            bank_name,
            branch_name,
            account_type,
            account_number,
            account_holder,
            license_status || "none",
            license_type,
            license_number,
            license_file_path,
            line_official_id,
            representative_gmail,
          ],
          function (err) {
            if (err) {
              console.error("店舗作成エラー:", err);
              return res.status(500).send(`店舗作成エラー: ${err.message}`);
            }

            const agencyId = this.lastID;

            // ユーザーアカウントを作成
            db.run(
              "INSERT INTO users (email, password, store_id) VALUES (?, ?, ?)",
              [email, hashedPassword, agencyId],
              function (err) {
                if (err) {
                  console.error("ユーザー作成エラー:", err);

                  // PostgreSQL固有のエラーハンドリング
                  if (
                    err.code === "23505" &&
                    err.constraint === "users_email_key"
                  ) {
                    return res
                      .status(400)
                      .send(
                        `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
                      );
                  }

                  return res
                    .status(500)
                    .send(`ユーザーアカウント作成エラー: ${err.message}`);
                }

                console.log(
                  `店舗ユーザーアカウント作成: ${email} (store_id: ${agencyId})`
                );
                res.redirect(
                  "/stores/list?message=" +
                    encodeURIComponent("店舗とユーザーアカウントを作成しました")
                );
              }
            );
          }
        );
      });
    }
  } catch (error) {
    console.error("新規登録エラー:", error);
    res.status(500).send("エラーが発生しました: " + error.message);
  }
});

// 編集（フォームPOST対応）
router.post("/edit/:id", requireRole(["admin"]), (req, res) => {
  const { isSupabaseConfigured } = require("../config/database");
  const {
    name,
    // 店舗基本情報
    business_address,
    main_phone,
    manager_name,
    mobile_phone,
    representative_email,
    // 契約基本情報
    contract_type,
    contract_start_date,
    royalty_rate,
    // 請求基本情報
    invoice_number,
    bank_name,
    branch_name,
    account_type,
    account_number,
    account_holder,
    // 許認可情報
    license_status,
    license_type,
    license_number,
    license_file_path,
    // 連携ID
    line_official_id,
    representative_gmail,
  } = req.body;

  // データ処理: 空文字列をNULLに変換
  const processedRoyaltyRate =
    royalty_rate && royalty_rate.trim() !== "" ? parseFloat(royalty_rate) : 5.0;
  const processedContractStartDate =
    contract_start_date && contract_start_date.trim() !== ""
      ? contract_start_date
      : null;

  db.run(
    `UPDATE stores SET 
      name=?, business_address=?, main_phone=?, manager_name=?, 
      mobile_phone=?, representative_email=?, contract_type=?, 
      contract_start_date=?, royalty_rate=?, invoice_number=?, 
      bank_name=?, branch_name=?, account_type=?, account_number=?, 
      account_holder=?, license_status=?, license_type=?, 
      license_number=?, license_file_path=?, line_official_id=?, 
      representative_gmail=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?`,
    [
      name,
      business_address,
      main_phone,
      manager_name,
      mobile_phone,
      representative_email,
      contract_type,
      processedContractStartDate,
      processedRoyaltyRate,
      invoice_number,
      bank_name,
      branch_name,
      account_type,
      account_number,
      account_holder,
      license_status || "none",
      license_type,
      license_number,
      license_file_path,
      line_official_id,
      representative_gmail,
      req.params.id,
    ],
    function (err) {
      if (err) {
        console.error("店舗更新エラー:", err);
        return res.status(500).send("DBエラー: " + err.message);
      }

      console.log(`店舗更新完了: ID=${req.params.id}, 名前=${name}`);
      res.redirect(
        "/stores/list?success=" +
          encodeURIComponent(`店舗「${name}」を更新しました`)
      );
    }
  );
});

// 代理店削除（管理者のみ）
router.post("/delete/:id", requireRole(["admin"]), (req, res) => {
  const agencyId = req.params.id;

  // 代理店情報を取得
  db.get("SELECT name FROM stores WHERE id = ?", [agencyId], (err, agency) => {
    if (err) return res.status(500).send("DBエラー");
    if (!agency) {
      return res.redirect(
        "/stores/list?error=" +
          encodeURIComponent("指定された代理店が見つかりません")
      );
    }

    // 関連するユーザーアカウントを確認
    db.all(
      "SELECT id, email FROM users WHERE store_id = ?",
      [agencyId],
      (err, relatedUsers) => {
        if (err) {
          console.error("関連ユーザー確認エラー:", err);
          relatedUsers = [];
        }

        if (relatedUsers.length > 0) {
          console.log(
            `代理店「${agency.name}」(ID: ${agencyId}) に関連するユーザーアカウント:`,
            relatedUsers
          );
          console.log("これらのユーザーアカウントも削除されます");
        } else {
          console.log(
            `代理店「${agency.name}」(ID: ${agencyId}) に関連するユーザーアカウントはありません`
          );
        }

        // 改善されたトランザクション型削除処理
        const deleteRelatedDataSafely = (callback) => {
          console.log(
            `代理店ID ${agencyId} の関連データ削除を開始（トランザクション処理）`
          );

          // PostgreSQL環境ではBEGINでトランザクション開始
          const isPostgres = !!process.env.DATABASE_URL;
          const startTransaction = isPostgres ? "BEGIN" : "BEGIN TRANSACTION";

          db.run(startTransaction, (err) => {
            if (err) {
              console.error("トランザクション開始エラー:", err);
              return callback(err);
            }

            console.log("トランザクション開始完了");

            // 削除対象テーブルの配列（削除順序重要：外部キー制約を考慮）
            const deleteQueries = [
              {
                name: "ユーザーアカウント",
                query: "DELETE FROM users WHERE store_id = ?",
              },
              {
                name: "売上データ",
                query: "DELETE FROM sales WHERE store_id = ?",
              },
              {
                name: "商品資料",
                query: "DELETE FROM materials WHERE store_id = ?",
              },
              {
                name: "グループ所属",
                query: "DELETE FROM group_members WHERE store_id = ?",
              },
              {
                name: "取り扱い商品",
                query: "DELETE FROM store_products WHERE store_id = ?",
              },
              {
                name: "製品ファイル",
                query: "DELETE FROM product_files WHERE store_id = ?",
              },
            ];

            let completed = 0;
            let hasError = false;

            const executeDelete = (index) => {
              if (hasError || index >= deleteQueries.length) {
                if (hasError) {
                  console.log("エラーが発生したためロールバック実行");
                  db.run("ROLLBACK", () => {
                    callback(
                      new Error("関連データ削除中にエラーが発生しました")
                    );
                  });
                } else {
                  console.log("すべての関連データ削除完了、コミット実行");
                  db.run("COMMIT", (commitErr) => {
                    if (commitErr) {
                      console.error("コミットエラー:", commitErr);
                      return callback(commitErr);
                    }
                    console.log("トランザクション正常完了");
                    callback();
                  });
                }
                return;
              }

              const deleteInfo = deleteQueries[index];
              console.log(`${deleteInfo.name}を削除中...`);

              db.run(deleteInfo.query, [agencyId], function (deleteErr) {
                if (deleteErr) {
                  console.error(`${deleteInfo.name}削除エラー:`, deleteErr);
                  hasError = true;
                  return executeDelete(index + 1);
                }

                console.log(
                  `${deleteInfo.name}削除完了 (削除件数: ${this.changes})`
                );

                // 特別処理：ユーザーアカウント削除時の詳細ログ
                if (index === 0 && relatedUsers.length > 0) {
                  relatedUsers.forEach((user) => {
                    console.log(
                      `削除されたユーザー: ID=${user.id}, Email=${user.email}`
                    );
                  });
                }

                executeDelete(index + 1);
              });
            };

            executeDelete(0);
          });
        };

        // 関連データを削除してから代理店本体を削除
        deleteRelatedDataSafely((err) => {
          if (err) {
            console.error("関連データ削除エラー:", err);
            return res.redirect(
              "/stores/list?error=" +
                encodeURIComponent("関連データ削除中にエラーが発生しました")
            );
          }
          db.run("DELETE FROM stores WHERE id = ?", [agencyId], function (err) {
            if (err) {
              console.error("代理店削除エラー:", err);
              return res.redirect(
                "/stores/list?error=" +
                  encodeURIComponent("削除中にエラーが発生しました")
              );
            }

            console.log(
              `代理店「${agency.name}」(ID: ${agencyId}) を削除しました`
            );

            // 削除後のID整合性チェックと自動修正を無効化（安全性のため）
            console.log(
              "=== 削除後のID自動修正は安全性のため無効化されています ==="
            );
            console.log(
              "他の代理店データの整合性を保つため、ID修正は手動で実行してください"
            );

            res.redirect(
              "/stores/list?success=" +
                encodeURIComponent(
                  `「${agency.name}」の代理店データと関連するユーザーアカウントを削除しました`
                )
            );
          });
        });
      }
    );
  });
});

// 代理店プロフィール表示
router.get("/profile/:id", requireRole(["admin", "agency"]), (req, res) => {
  const agencyId = req.params.id;

  // 代理店ユーザーは自分のプロフィールのみ閲覧可能
  if (req.session.user.role === "agency") {
    if (req.session.user.store_id !== parseInt(agencyId)) {
      return res.status(403).send("自分のプロフィールのみ閲覧可能です");
    }
  }

  db.get("SELECT * FROM stores WHERE id = ?", [agencyId], (err, agency) => {
    if (err || !agency) return res.status(404).send("代理店が見つかりません");

    // 取り扱い商品を取得（既存データベース構造対応）
    db.all(
      "SELECT product_name FROM store_products WHERE store_id = ?",
      [agencyId],
      (err, products) => {
        if (err) {
          console.error("商品取得エラー:", err);
          products = [];
        }

        // グループ情報を取得
        db.get(
          `
        SELECT g.name as group_name 
        FROM group_store ga 
        LEFT JOIN groups g ON ga.group_id = g.id 
        WHERE ga.store_id = ?
      `,
          [agencyId],
          (err, groupInfo) => {
            if (err) {
              console.error("グループ取得エラー:", err);
              groupInfo = null;
            }

            // 既存データを新形式に変換
            agency.products = products.map((p) => ({
              product_name: p.product_name,
              product_detail: null,
              product_url: null,
            }));
            agency.group_name = groupInfo ? groupInfo.group_name : null;

            res.render("agencies_profile", {
              agency,
              session: req.session,
              title: agency.name + "のプロフィール",
            });
          }
        );
      }
    );
  });
});

// 代理店プロフィール編集フォーム
router.get(
  "/profile/:id/edit",
  requireRole(["admin", "agency"]),
  (req, res) => {
    const agencyId = req.params.id;

    // 代理店ユーザーは自分のプロフィールのみ編集可能
    if (req.session.user.role === "agency") {
      if (req.session.user.store_id !== parseInt(agencyId)) {
        return res.status(403).send("自分のプロフィールのみ編集可能です");
      }
    }

    db.get("SELECT * FROM stores WHERE id = ?", [agencyId], (err, agency) => {
      if (err || !agency) return res.status(404).send("代理店が見つかりません");

      // 取り扱い商品を取得（既存データベース構造対応）
      db.all(
        "SELECT product_name FROM store_products WHERE store_id = ?",
        [agencyId],
        (err, products) => {
          if (err) {
            console.error("商品取得エラー:", err);
            products = [];
          }

          // 既存データを新形式に変換
          agency.products = products.map((p) => ({
            product_name: p.product_name,
            product_detail: null,
            product_url: null,
          }));

          res.render("agencies_form", {
            agency,
            session: req.session,
            title: agency.name + "のプロフィール編集",
            isProfile: true,
          });
        }
      );
    });
  }
);

// 代理店プロフィール更新
router.post(
  "/profile/:id/edit",
  requireRole(["admin", "agency"]),
  (req, res) => {
    const agencyId = req.params.id;

    // 代理店ユーザーは自分のプロフィールのみ編集可能
    if (req.session.user.role === "agency") {
      if (req.session.user.store_id !== parseInt(agencyId)) {
        return res.status(403).send("自分のプロフィールのみ編集可能です");
      }
    }

  const {
    name,
    age,
    address,
    bank_info,
    experience_years,
    contract_date,
    product_names,
    product_details,
    product_urls,
    products, // 旧形式との互換性のため残す
    // 店舗基本情報
    manager_name,
    business_address,
    main_phone,
    mobile_phone,
    representative_email,
    // 契約基本情報
    contract_type,
    contract_start_date,
    royalty_rate,
    // 請求基本情報
    invoice_number,
    bank_name,
    branch_name,
    account_type,
    account_number,
    account_holder,
    // 許認可情報
    license_status,
    license_type,
    license_number,
    license_file_path,
    // 連携ID
    line_official_id,
    representative_gmail,
  } = req.body;

    // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
    const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
    const processedExperienceYears =
      experience_years && experience_years.trim() !== ""
        ? parseInt(experience_years)
        : null;
    const processedContractDate =
      contract_date && contract_date.trim() !== "" ? contract_date : null;
  // start_date は廃止（Supabaseスキーマ未定義）

    // 空文字はNULLに正規化
    const toNull = (v) => (v !== undefined && v !== null && String(v).trim() !== "" ? v : null);

    // 数値系（royalty_rate）は数値へ
    const normalizedRoyaltyRate =
      royalty_rate !== undefined && royalty_rate !== "" ? parseFloat(royalty_rate) : null;

    const updateSql = `
      UPDATE stores SET 
        name = ?,
        manager_name = ?,
        business_address = ?,
        main_phone = ?,
        mobile_phone = ?,
        representative_email = ?,
        contract_type = ?,
        contract_start_date = ?,
        royalty_rate = ?,
        invoice_number = ?,
        bank_name = ?,
        branch_name = ?,
        account_type = ?,
        account_number = ?,
        account_holder = ?,
        license_status = ?,
        license_type = ?,
        license_number = ?,
        license_file_path = ?,
        line_official_id = ?,
        representative_gmail = ?
      WHERE id = ?
    `;

    const updateParams = [
      toNull(name),
      toNull(manager_name),
      toNull(address || business_address),
      toNull(main_phone),
      toNull(mobile_phone),
      toNull(representative_email),
      toNull(contract_type),
      toNull(processedContractDate || contract_start_date),
      normalizedRoyaltyRate,
      toNull(invoice_number),
      toNull(bank_name),
      toNull(branch_name),
      toNull(account_type),
      toNull(account_number),
      toNull(account_holder),
      toNull(license_status),
      toNull(license_type),
      toNull(license_number),
      toNull(license_file_path),
      toNull(line_official_id),
      toNull(representative_gmail),
      agencyId,
    ];

    db.run(
      updateSql,
      updateParams,
      function (err) {
        if (err) return res.status(500).send("DBエラー");

        // 既存の商品を削除
        db.run(
          "DELETE FROM store_products WHERE store_id = ?",
          [agencyId],
          (err) => {
            if (err) console.error("商品削除エラー:", err);

            // 新形式: 配列形式での商品データ処理
            if (
              product_names &&
              Array.isArray(product_names) &&
              product_names.length > 0
            ) {
              console.log("プロフィール編集: 新形式の商品データを処理");
              product_names.forEach((productName, index) => {
                if (productName && productName.trim() !== "") {
                  db.run(
                    "INSERT INTO store_products (store_id, product_name) VALUES (?, ?)",
                    [agencyId, productName.trim()],
                    (err) => {
                      if (err) console.error("商品保存エラー:", err);
                    }
                  );
                }
              });
            }
            // 旧形式: JSON文字列での商品データ処理（互換性のため）
            else if (products) {
              console.log("プロフィール編集: 旧形式の商品データを処理");
              const productList = Array.isArray(products)
                ? products
                : [products];
              productList.forEach((productStr) => {
                try {
                  const product = JSON.parse(productStr);
                  db.run(
                    "INSERT INTO store_products (store_id, product_name) VALUES (?, ?)",
                    [agencyId, product.product_name],
                    (err) => {
                      if (err) console.error("商品保存エラー:", err);
                    }
                  );
                } catch (parseErr) {
                  console.error("商品データパースエラー:", parseErr);
                  // JSON解析に失敗した場合は文字列として扱う（旧形式対応）
                  db.run(
                    "INSERT INTO store_products (store_id, product_name) VALUES (?, ?)",
                    [agencyId, productStr],
                    (err) => {
                      if (err) console.error("商品保存エラー（文字列）:", err);
                    }
                  );
                }
              });
            }
          }
        );

        // プロフィール更新通知メール（代理店ユーザーが自分で更新した場合のみ）
        if (req.session.user.role === "agency") {
          const agencyData = {
            id: agencyId,
            name,
          };

          const userData = {
            email: req.session.user.email,
            id: req.session.user.id,
          };

          // 非同期でメール送信
          sendProfileUpdateNotification(agencyData, userData).catch((error) => {
            console.error("プロフィール更新メール送信エラー:", error);
          });
        }

        res.redirect("/stores/profile/" + agencyId);
      }
    );
  }
);

// 代理店プロフィール作成フォーム（代理店ユーザー用）
router.get("/create-profile", requireRole(["agency"]), (req, res) => {
  // 既にプロフィールが存在する場合はリダイレクト
  if (req.session.user.store_id) {
    return res.redirect("/stores/profile/" + req.session.user.store_id);
  }

  res.render("agencies_form", {
    agency: null,
    session: req.session,
    title: "店舗プロフィール作成",
    isCreateProfile: true,
  });
});

// 代理店プロフィール作成（代理店ユーザー用）
router.post("/create-profile", requireRole(["agency"]), (req, res) => {
  // 既にプロフィールが存在する場合はエラー
  if (req.session.user.store_id) {
    return res.status(400).send("既にプロフィールが存在します");
  }

  const {
    name,
    age,
    address,
    bank_info,
    experience_years,
    contract_date,
    product_names,
    product_details,
    product_urls,
    products, // 旧形式との互換性のため残す
  } = req.body;

  // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
  const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
  const processedExperienceYears =
    experience_years && experience_years.trim() !== ""
      ? parseInt(experience_years)
      : null;
  const processedContractDate =
    contract_date && contract_date.trim() !== "" ? contract_date : null;
  // start_date は廃止（Supabaseスキーマ未定義）

  db.run(
    "INSERT INTO stores (name, business_address, bank_info, contract_start_date) VALUES (?, ?, ?, ?)",
    [name, address, bank_info, processedContractDate],
    function (err) {
      if (err) return res.status(500).send("DBエラー");

      const agencyId = this.lastID;

      // 新形式: 配列形式での商品データ処理
      if (
        product_names &&
        Array.isArray(product_names) &&
        product_names.length > 0
      ) {
        console.log("プロフィール作成: 新形式の商品データを処理");
        product_names.forEach((productName, index) => {
          if (productName && productName.trim() !== "") {
            db.run(
              "INSERT INTO store_products (store_id, product_name) VALUES (?, ?)",
              [agencyId, productName.trim()],
              (err) => {
                if (err) console.error("商品保存エラー:", err);
              }
            );
          }
        });
      }
      // 旧形式: JSON文字列での商品データ処理（互換性のため）
      else if (products) {
        console.log("プロフィール作成: 旧形式の商品データを処理");
        const productList = Array.isArray(products) ? products : [products];
        productList.forEach((productStr) => {
          try {
            const product = JSON.parse(productStr);
            db.run(
              "INSERT INTO store_products (store_id, product_name) VALUES (?, ?)",
              [agencyId, product.product_name],
              (err) => {
                if (err) console.error("商品保存エラー:", err);
              }
            );
          } catch (parseErr) {
            console.error("商品データパースエラー:", parseErr);
            // JSON解析に失敗した場合は文字列として扱う（旧形式対応）
            db.run(
              "INSERT INTO store_products (store_id, product_name) VALUES (?, ?)",
              [agencyId, productStr],
              (err) => {
                if (err) console.error("商品保存エラー（文字列）:", err);
              }
            );
          }
        });
      }

      // ユーザーテーブルのstore_idを更新
      console.log("=== アカウント連携開始 ===");
      console.log("agencyId:", agencyId, "type:", typeof agencyId);
      console.log(
        "session.user.id:",
        req.session.user.id,
        "type:",
        typeof req.session.user.id
      );
      console.log("session.user:", req.session.user);
      console.log("PostgreSQL環境:", !!process.env.DATABASE_URL);

      // PostgreSQL環境でのパラメータ形式を調整
      const isPostgres = !!process.env.DATABASE_URL;
      const updateQuery = isPostgres
        ? "UPDATE users SET store_id = $1 WHERE id = $2"
        : "UPDATE users SET store_id = ? WHERE id = ?";

      db.run(
        updateQuery,
        [parseInt(agencyId), parseInt(req.session.user.id)],
        function (err) {
          if (err) {
            console.error("=== ユーザーのstore_id更新エラー ===");
            console.error("エラー詳細:", err);
            console.error("エラーコード:", err.code);
            console.error("エラーメッセージ:", err.message);
            console.error("更新対象のagencyId:", agencyId);
            console.error("更新対象のuserId:", req.session.user.id);
            return res
              .status(500)
              .send(
                `プロフィール作成は完了しましたが、アカウント連携でエラーが発生しました。<br>エラー詳細: ${err.message}<br><a href="/">ダッシュボードに戻る</a>`
              );
          }

          console.log("=== アカウント連携成功 ===");
          console.log("更新された行数:", this.changes || "不明");

          // セッションのstore_idも更新
          req.session.user.store_id = agencyId;

          // プロフィール作成時のメール通知を送信
          const agencyData = {
            id: agencyId,
            name,
            age,
            address,
            bank_info,
            experience_years,
            contract_date,
            start_date,
          };

          const userData = {
            email: req.session.user.email,
            id: req.session.user.id,
          };

          // 非同期でメール送信（エラーがあってもリダイレクトは継続）
          sendProfileRegistrationNotification(agencyData, userData).catch(
            (error) => {
              console.error("メール送信エラー:", error);
            }
          );

          res.redirect("/stores/profile/" + agencyId);
        }
      );
    }
  );
});

module.exports = router;
module.exports.checkAgencyIdIntegrity = checkAgencyIdIntegrity;
module.exports.fixAgencyIds = fixAgencyIds;
