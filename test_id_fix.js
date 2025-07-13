const db = require("./db");

// データベース初期化の完了を待つ関数
function waitForDatabaseInit(callback, timeout = 10000) {
  const startTime = Date.now();
  const checkInterval = setInterval(() => {
    console.log("データベース初期化チェック中...");

    // 簡単なクエリでデータベースの準備状況を確認
    db.all("SELECT 1", [], (err, rows) => {
      if (!err) {
        console.log("データベース初期化完了");
        clearInterval(checkInterval);
        callback(null);
      } else if (Date.now() - startTime > timeout) {
        console.error("データベース初期化タイムアウト");
        clearInterval(checkInterval);
        callback(new Error("Database initialization timeout"));
      } else {
        console.log("データベース初期化待機中...", err.message);
      }
    });
  }, 1000);
}

// テスト用のデータを挿入
function insertTestData() {
  console.log("=== テストデータ挿入開始 ===");

  // 既存のデータをクリア
  db.run("DELETE FROM agencies", (err) => {
    if (err) {
      console.error("既存データ削除エラー:", err);
      process.exit(1);
      return;
    }

    console.log("既存データ削除完了");

    // 不連続なIDでテストデータを挿入
    const testAgencies = [
      { id: 5, name: "テスト代理店A" },
      { id: 10, name: "テスト代理店B" },
      { id: 15, name: "テスト代理店C" },
    ];

    let inserted = 0;
    let hasError = false;

    testAgencies.forEach((agency) => {
      if (hasError) return;

      console.log(`テストデータ挿入試行: ID=${agency.id}, Name=${agency.name}`);

      db.run(
        "INSERT INTO agencies (id, name) VALUES (?, ?)",
        [agency.id, agency.name],
        function (err) {
          if (err) {
            console.error("テストデータ挿入エラー:", err);
            hasError = true;
            process.exit(1);
            return;
          }

          console.log(
            `テストデータ挿入成功: ID=${agency.id}, Name=${agency.name}, lastID=${this.lastID}`
          );
          inserted++;

          if (inserted === testAgencies.length) {
            console.log("=== テストデータ挿入完了 ===");

            // 挿入されたデータを確認
            db.all(
              "SELECT id, name FROM agencies ORDER BY id",
              [],
              (err, rows) => {
                if (err) {
                  console.error("データ確認エラー:", err);
                  process.exit(1);
                  return;
                }

                console.log("挿入されたデータ:", rows);
                testIdFix();
              }
            );
          }
        }
      );
    });
  });
}

// ID整合性チェック機能
function checkAgencyIdIntegrity(callback) {
  console.log("=== 代理店ID整合性チェック開始 ===");

  db.all("SELECT id, name FROM agencies ORDER BY name", [], (err, agencies) => {
    if (err) {
      console.error("代理店ID整合性チェック - DB取得エラー:", err);
      return callback(err, null);
    }

    console.log(
      `代理店ID整合性チェック - 取得した代理店数: ${agencies.length}`
    );
    console.log(
      "代理店一覧:",
      agencies.map((a) => `ID:${a.id} Name:${a.name}`)
    );

    if (agencies.length === 0) {
      console.log("代理店データが存在しません");
      return callback(null, {
        totalAgencies: 0,
        issues: [],
        isIntegrityOk: true,
      });
    }

    const issues = [];
    let expectedId = 1;

    agencies.forEach((agency, index) => {
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
      totalAgencies: agencies.length,
      issues: issues,
      isIntegrityOk: issues.length === 0,
    };

    console.log("代理店ID整合性チェック結果:", result);
    callback(null, result);
  });
}

// ID修正機能
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
  db.all("SELECT id, name FROM agencies ORDER BY name", [], (err, agencies) => {
    if (err) {
      console.error("代理店取得エラー:", err);
      return callback(err);
    }

    console.log(`取得した代理店数: ${agencies.length}`);
    console.log(
      "代理店一覧:",
      agencies.map((a) => `ID:${a.id} Name:${a.name}`)
    );

    if (agencies.length === 0) {
      console.log("修正対象の代理店がありません");
      return callback(null);
    }

    // 修正が必要かチェック
    let needsFixing = false;
    agencies.forEach((agency, index) => {
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

    // データベースタイプを判定（DATABASE_URLが設定されていればPostgreSQL）
    const isPostgres = !!process.env.DATABASE_URL;

    console.log("データベースタイプ判定結果:", {
      DATABASE_URL: !!process.env.DATABASE_URL,
      RAILWAY_ENVIRONMENT_NAME: !!process.env.RAILWAY_ENVIRONMENT_NAME,
      NODE_ENV: process.env.NODE_ENV,
      isPostgres: isPostgres,
    });

    if (isPostgres) {
      console.log("PostgreSQL環境での修正を実行");
      // PostgreSQL用の修正処理（簡略版）
      console.log("PostgreSQL修正処理は未実装（テスト用）");
      callback(null);
    } else {
      console.log("SQLite環境での修正を実行");
      // SQLite用の修正処理
      fixAgencyIdsSQLite(agencies, callback);
    }
  });
}

// SQLite用のID修正処理
function fixAgencyIdsSQLite(agencies, callback) {
  console.log("=== SQLite環境でのID修正開始 ===");

  // 一時テーブルを作成
  console.log("一時テーブル作成中...");
  db.run("CREATE TEMP TABLE temp_agencies AS SELECT * FROM agencies", (err) => {
    if (err) {
      console.error("一時テーブル作成エラー:", err);
      return callback(err);
    }

    console.log("一時テーブル作成成功");

    // 一時テーブルの内容を確認
    db.all(
      "SELECT id, name FROM temp_agencies ORDER BY id",
      [],
      (err, tempRows) => {
        if (err) {
          console.error("一時テーブル確認エラー:", err);
          return callback(err);
        }

        console.log("一時テーブルの内容:", tempRows);

        // 元の代理店データを削除
        console.log("元の代理店データを削除中...");
        db.run("DELETE FROM agencies", (err) => {
          if (err) {
            console.error("代理店データ削除エラー:", err);
            return callback(err);
          }

          console.log("代理店データ削除完了");

          // 新しいIDで再挿入
          let completed = 0;
          let hasError = false;

          agencies.forEach((agency, index) => {
            if (hasError) return;

            const newId = index + 1;
            console.log(
              `代理店ID修正開始: ${agency.id} → ${newId} (${agency.name})`
            );

            db.run(
              "INSERT INTO agencies (id, name) SELECT ?, name FROM temp_agencies WHERE id = ?",
              [newId, agency.id],
              function (err) {
                if (err) {
                  console.error("代理店ID修正エラー:", err);
                  hasError = true;
                  return callback(err);
                }

                console.log(
                  `代理店 ${agency.name} のID修正完了: ${agency.id} → ${newId} (lastID: ${this.lastID})`
                );
                completed++;

                console.log(
                  `代理店ID修正完了: ${agency.id} → ${newId} (${agency.name}) [${completed}/${agencies.length}]`
                );

                if (completed === agencies.length) {
                  console.log("全ての代理店ID修正完了、後処理開始...");

                  // 結果を確認
                  db.all(
                    "SELECT id, name FROM agencies ORDER BY id",
                    [],
                    (err, updatedRows) => {
                      if (err) {
                        console.error("修正結果確認エラー:", err);
                        return callback(err);
                      }

                      console.log("修正後のデータ:", updatedRows);

                      // 一時テーブルを削除
                      db.run("DROP TABLE temp_agencies", (err) => {
                        if (err) {
                          console.error("一時テーブル削除エラー:", err);
                        } else {
                          console.log("一時テーブル削除完了");
                        }

                        // SQLite環境でのみシーケンステーブルをリセット
                        const isPostgres = !!process.env.DATABASE_URL;
                        if (!isPostgres) {
                          console.log("シーケンステーブルリセット中...");
                          db.run(
                            "UPDATE sqlite_sequence SET seq = ? WHERE name = 'agencies'",
                            [agencies.length],
                            (err) => {
                              if (err) {
                                console.error("シーケンスリセットエラー:", err);
                              } else {
                                console.log(
                                  `代理店シーケンスを${agencies.length}にリセット`
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
                  );
                }
              }
            );
          });
        });
      }
    );
  });
}

// テスト実行
function testIdFix() {
  console.log("=== ID修正機能テスト開始 ===");

  // 1. 整合性チェック
  checkAgencyIdIntegrity((err, integrityInfo) => {
    if (err) {
      console.error("整合性チェックエラー:", err);
      process.exit(1);
      return;
    }

    console.log("整合性チェック結果:", integrityInfo);

    // 2. 問題がある場合は修正実行
    if (!integrityInfo.isIntegrityOk && integrityInfo.issues.length > 0) {
      console.log("問題発見、修正を実行...");

      fixAgencyIds((fixErr) => {
        if (fixErr) {
          console.error("修正エラー:", fixErr);
          process.exit(1);
          return;
        }

        console.log("修正完了、再度チェック...");

        // 3. 修正後の確認
        checkAgencyIdIntegrity((recheckErr, updatedInfo) => {
          if (recheckErr) {
            console.error("再チェックエラー:", recheckErr);
            process.exit(1);
            return;
          }

          console.log("修正後の整合性チェック結果:", updatedInfo);

          if (updatedInfo.isIntegrityOk) {
            console.log("✅ ID修正機能テスト成功");
          } else {
            console.log("❌ ID修正機能テスト失敗");
          }

          process.exit(0);
        });
      });
    } else {
      console.log("整合性に問題なし");
      process.exit(0);
    }
  });
}

// エラーハンドリング
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// データベース初期化を待ってからテスト開始
console.log("データベース初期化待機中...");
waitForDatabaseInit((err) => {
  if (err) {
    console.error("データベース初期化エラー:", err);
    process.exit(1);
  } else {
    console.log("データベース初期化完了、テスト開始");
    insertTestData();
  }
});
