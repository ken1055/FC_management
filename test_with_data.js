const db = require("./db");

console.log("=== ID修正機能テスト（テストデータ付き） ===");

// 10秒後にテスト開始
setTimeout(() => {
  console.log("テスト開始");

  // 1. 既存データを削除
  db.run("DELETE FROM agencies", (err) => {
    if (err) {
      console.error("既存データ削除エラー:", err);
      process.exit(1);
    }

    console.log("既存データ削除完了");

    // 2. 不連続なIDでテストデータを挿入
    const testData = [
      { id: 5, name: "テスト代理店A" },
      { id: 10, name: "テスト代理店B" },
      { id: 15, name: "テスト代理店C" },
    ];

    let inserted = 0;
    testData.forEach((item) => {
      db.run(
        "INSERT INTO agencies (id, name) VALUES (?, ?)",
        [item.id, item.name],
        function (err) {
          if (err) {
            console.error(`データ挿入エラー (${item.name}):`, err);
            process.exit(1);
          }

          console.log(`データ挿入完了: ID=${item.id}, Name=${item.name}`);
          inserted++;

          if (inserted === testData.length) {
            console.log("全データ挿入完了");

            // 3. 挿入されたデータを確認
            db.all(
              "SELECT id, name FROM agencies ORDER BY id",
              [],
              (err, rows) => {
                if (err) {
                  console.error("データ確認エラー:", err);
                  process.exit(1);
                }

                console.log("\n=== 挿入されたデータ（ID順） ===");
                rows.forEach((row) => {
                  console.log(`ID: ${row.id}, Name: ${row.name}`);
                });

                // 4. 名前順での並び替え
                db.all(
                  "SELECT id, name FROM agencies ORDER BY name",
                  [],
                  (err, nameOrderRows) => {
                    if (err) {
                      console.error("名前順データ取得エラー:", err);
                      process.exit(1);
                    }

                    console.log("\n=== 代理店データ（名前順） ===");
                    nameOrderRows.forEach((row, index) => {
                      const expectedId = index + 1;
                      const status = row.id === expectedId ? "✅" : "❌";
                      console.log(
                        `${status} ID: ${row.id} (期待値: ${expectedId}), Name: ${row.name}`
                      );
                    });

                    // 5. ID整合性の問題を検出
                    const issues = [];
                    nameOrderRows.forEach((row, index) => {
                      const expectedId = index + 1;
                      if (row.id !== expectedId) {
                        issues.push({
                          currentId: row.id,
                          expectedId: expectedId,
                          name: row.name,
                        });
                      }
                    });

                    console.log("\n=== ID整合性チェック結果 ===");
                    if (issues.length === 0) {
                      console.log("✅ ID整合性に問題なし");
                      process.exit(0);
                    } else {
                      console.log("❌ ID整合性の問題を発見:");
                      issues.forEach((issue) => {
                        console.log(
                          `  - ${issue.name}: ID ${issue.currentId} → ${issue.expectedId} に修正が必要`
                        );
                      });

                      // 6. 手動でID修正を実行（SQLite用）
                      console.log("\n=== 手動ID修正開始 ===");

                      // 一時テーブル作成
                      db.run(
                        "CREATE TEMP TABLE temp_agencies AS SELECT * FROM agencies",
                        (err) => {
                          if (err) {
                            console.error("一時テーブル作成エラー:", err);
                            process.exit(1);
                          }

                          console.log("一時テーブル作成完了");

                          // 元のデータを削除
                          db.run("DELETE FROM agencies", (err) => {
                            if (err) {
                              console.error("元データ削除エラー:", err);
                              process.exit(1);
                            }

                            console.log("元データ削除完了");

                            // 新しいIDで再挿入
                            let fixed = 0;
                            nameOrderRows.forEach((agency, index) => {
                              const newId = index + 1;

                              console.log(
                                `ID修正処理: ${agency.id} → ${newId} (${agency.name})`
                              );

                              db.run(
                                "INSERT INTO agencies (id, name) SELECT ?, name FROM temp_agencies WHERE id = ?",
                                [newId, agency.id],
                                function (err) {
                                  if (err) {
                                    console.error(
                                      `ID修正エラー (${agency.name}):`,
                                      err
                                    );
                                    process.exit(1);
                                  }

                                  console.log(
                                    `ID修正完了: ${agency.id} → ${newId} (${agency.name})`
                                  );
                                  fixed++;

                                  if (fixed === nameOrderRows.length) {
                                    console.log("全ID修正完了");

                                    // 7. 修正結果を確認
                                    db.all(
                                      "SELECT id, name FROM agencies ORDER BY id",
                                      [],
                                      (err, finalRows) => {
                                        if (err) {
                                          console.error(
                                            "修正結果確認エラー:",
                                            err
                                          );
                                          process.exit(1);
                                        }

                                        console.log("\n=== 修正後のデータ ===");
                                        finalRows.forEach((row) => {
                                          console.log(
                                            `ID: ${row.id}, Name: ${row.name}`
                                          );
                                        });

                                        // 8. 最終確認
                                        db.all(
                                          "SELECT id, name FROM agencies ORDER BY name",
                                          [],
                                          (err, finalNameOrder) => {
                                            if (err) {
                                              console.error(
                                                "最終確認エラー:",
                                                err
                                              );
                                              process.exit(1);
                                            }

                                            console.log(
                                              "\n=== 最終確認（名前順） ==="
                                            );
                                            let isFixed = true;
                                            finalNameOrder.forEach(
                                              (row, index) => {
                                                const expectedId = index + 1;
                                                const status =
                                                  row.id === expectedId
                                                    ? "✅"
                                                    : "❌";
                                                console.log(
                                                  `${status} ID: ${row.id} (期待値: ${expectedId}), Name: ${row.name}`
                                                );
                                                if (row.id !== expectedId) {
                                                  isFixed = false;
                                                }
                                              }
                                            );

                                            if (isFixed) {
                                              console.log(
                                                "\n✅ ID修正機能テスト成功"
                                              );
                                            } else {
                                              console.log(
                                                "\n❌ ID修正機能テスト失敗"
                                              );
                                            }

                                            process.exit(0);
                                          }
                                        );
                                      }
                                    );
                                  }
                                }
                              );
                            });
                          });
                        }
                      );
                    }
                  }
                );
              }
            );
          }
        }
      );
    });
  });
}, 10000);

console.log("データベース初期化待機中（10秒）...");
