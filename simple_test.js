const db = require("./db");

console.log("=== シンプルなID修正テスト ===");

// 10秒後にテスト開始（十分な初期化時間を確保）
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
    const insertData = [
      { id: 5, name: "代理店A" },
      { id: 10, name: "代理店B" },
      { id: 15, name: "代理店C" },
    ];

    let inserted = 0;
    insertData.forEach((item, index) => {
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

          if (inserted === insertData.length) {
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

                console.log("挿入されたデータ:", rows);

                // 4. ID整合性をチェック
                db.all(
                  "SELECT id, name FROM agencies ORDER BY name",
                  [],
                  (err, agencies) => {
                    if (err) {
                      console.error("整合性チェックエラー:", err);
                      process.exit(1);
                    }

                    console.log("名前順のデータ:", agencies);

                    // 5. 問題を検出
                    const issues = [];
                    let expectedId = 1;

                    agencies.forEach((agency, index) => {
                      if (agency.id !== expectedId) {
                        issues.push({
                          currentId: agency.id,
                          expectedId: expectedId,
                          name: agency.name,
                        });
                      }
                      expectedId++;
                    });

                    console.log("検出された問題:", issues);

                    if (issues.length > 0) {
                      console.log("ID修正が必要です");

                      // 6. 手動でID修正を実行
                      console.log("手動ID修正開始...");

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
                            agencies.forEach((agency, index) => {
                              const newId = index + 1;

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

                                  if (fixed === agencies.length) {
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

                                        console.log(
                                          "修正後のデータ:",
                                          finalRows
                                        );

                                        // 8. 最終確認
                                        let isFixed = true;
                                        finalRows.forEach((row, index) => {
                                          if (row.id !== index + 1) {
                                            isFixed = false;
                                          }
                                        });

                                        if (isFixed) {
                                          console.log("✅ ID修正テスト成功");
                                        } else {
                                          console.log("❌ ID修正テスト失敗");
                                        }

                                        process.exit(0);
                                      }
                                    );
                                  }
                                }
                              );
                            });
                          });
                        }
                      );
                    } else {
                      console.log("ID整合性に問題なし");
                      process.exit(0);
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
