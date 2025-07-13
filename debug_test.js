const db = require("./db");

console.log("=== 代理店ID修正機能デバッグテスト ===");

// 15秒後にテスト開始
setTimeout(() => {
  console.log("テスト開始");

  // 1. 現在のデータを確認
  db.all("SELECT id, name FROM agencies ORDER BY id", [], (err, rows) => {
    if (err) {
      console.error("データ取得エラー:", err);
      process.exit(1);
    }

    console.log("現在の代理店データ:", rows);

    // 2. 不連続IDでテストデータを作成
    db.run("DELETE FROM agencies", (err) => {
      if (err) {
        console.error("データ削除エラー:", err);
        process.exit(1);
      }

      console.log("既存データ削除完了");

      // 3. 不連続なIDでテストデータを挿入
      const testData = [
        { id: 5, name: "代理店A" },
        { id: 10, name: "代理店B" },
        { id: 15, name: "代理店C" },
      ];

      let inserted = 0;
      console.log("テストデータ挿入開始...");

      testData.forEach((item) => {
        console.log(`挿入試行: ID=${item.id}, Name=${item.name}`);

        db.run(
          "INSERT INTO agencies (id, name) VALUES (?, ?)",
          [item.id, item.name],
          function (err) {
            if (err) {
              console.error(`データ挿入エラー (${item.name}):`, err);
              process.exit(1);
            }

            console.log(
              `データ挿入完了: ID=${item.id}, Name=${item.name}, lastID=${this.lastID}`
            );
            inserted++;

            if (inserted === testData.length) {
              console.log("全データ挿入完了");

              // 4. 挿入されたデータを確認
              db.all(
                "SELECT id, name FROM agencies ORDER BY id",
                [],
                (err, insertedRows) => {
                  if (err) {
                    console.error("挿入データ確認エラー:", err);
                    process.exit(1);
                  }

                  console.log("挿入されたデータ:", insertedRows);

                  // 5. checkAgencyIdIntegrity関数をテスト
                  console.log("=== checkAgencyIdIntegrity関数テスト ===");
                  try {
                    const agenciesModule = require("./routes/agencies");
                    console.log("モジュール読み込み成功");
                    console.log("利用可能な関数:", Object.keys(agenciesModule));

                    if (
                      typeof agenciesModule.checkAgencyIdIntegrity ===
                      "function"
                    ) {
                      console.log("checkAgencyIdIntegrity関数が見つかりました");
                      agenciesModule.checkAgencyIdIntegrity(
                        (err, integrityInfo) => {
                          if (err) {
                            console.error("整合性チェックエラー:", err);
                            process.exit(1);
                          }

                          console.log("整合性チェック結果:", integrityInfo);

                          // 6. fixAgencyIds関数をテスト
                          if (!integrityInfo.isIntegrityOk) {
                            console.log("=== fixAgencyIds関数テスト ===");

                            if (
                              typeof agenciesModule.fixAgencyIds === "function"
                            ) {
                              console.log("fixAgencyIds関数が見つかりました");
                              agenciesModule.fixAgencyIds((err) => {
                                if (err) {
                                  console.error("ID修正エラー:", err);
                                  process.exit(1);
                                }

                                console.log("ID修正完了");

                                // 7. 修正後の確認
                                db.all(
                                  "SELECT id, name FROM agencies ORDER BY id",
                                  [],
                                  (err, finalRows) => {
                                    if (err) {
                                      console.error(
                                        "修正後データ確認エラー:",
                                        err
                                      );
                                      process.exit(1);
                                    }

                                    console.log("修正後のデータ:", finalRows);

                                    // 8. 再度整合性チェック
                                    agenciesModule.checkAgencyIdIntegrity(
                                      (err, finalIntegrityInfo) => {
                                        if (err) {
                                          console.error(
                                            "最終整合性チェックエラー:",
                                            err
                                          );
                                          process.exit(1);
                                        }

                                        console.log(
                                          "最終整合性チェック結果:",
                                          finalIntegrityInfo
                                        );

                                        if (finalIntegrityInfo.isIntegrityOk) {
                                          console.log(
                                            "✅ ID修正機能テスト成功"
                                          );
                                        } else {
                                          console.log(
                                            "❌ ID修正機能テスト失敗"
                                          );
                                        }

                                        process.exit(0);
                                      }
                                    );
                                  }
                                );
                              });
                            } else {
                              console.log("fixAgencyIds関数が見つかりません");
                              console.log(
                                "利用可能な関数:",
                                Object.keys(agenciesModule)
                              );
                              process.exit(1);
                            }
                          } else {
                            console.log("整合性に問題なし");
                            process.exit(0);
                          }
                        }
                      );
                    } else {
                      console.log("checkAgencyIdIntegrity関数が見つかりません");
                      console.log(
                        "利用可能な関数:",
                        Object.keys(agenciesModule)
                      );
                      process.exit(1);
                    }
                  } catch (moduleError) {
                    console.error("モジュール読み込みエラー:", moduleError);
                    process.exit(1);
                  }
                }
              );
            }
          }
        );
      });
    });
  });
}, 15000);

console.log("データベース初期化待機中（15秒）...");
