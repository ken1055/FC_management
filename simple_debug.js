const db = require("./db");

console.log("=== シンプルなデバッグテスト ===");

// 長い待機時間を設定
setTimeout(() => {
  console.log("テスト開始");

  // 1. 簡単なクエリテスト
  db.all("SELECT 1 as test", [], (err, rows) => {
    if (err) {
      console.error("基本クエリエラー:", err);
      process.exit(1);
    }

    console.log("基本クエリ成功:", rows);

    // 2. 代理店テーブルの確認
    db.all("SELECT id, name FROM agencies", [], (err, agencies) => {
      if (err) {
        console.error("代理店テーブル確認エラー:", err);
        process.exit(1);
      }

      console.log("現在の代理店データ:", agencies);

      // 3. テストデータを挿入
      console.log("テストデータ挿入開始...");

      db.run("DELETE FROM agencies", (err) => {
        if (err) {
          console.error("削除エラー:", err);
          process.exit(1);
        }

        console.log("既存データ削除完了");

        // 4. 1つずつ挿入
        db.run(
          "INSERT INTO agencies (id, name) VALUES (5, '代理店A')",
          function (err) {
            if (err) {
              console.error("挿入エラー1:", err);
              process.exit(1);
            }

            console.log("挿入1完了: lastID =", this.lastID);

            db.run(
              "INSERT INTO agencies (id, name) VALUES (10, '代理店B')",
              function (err) {
                if (err) {
                  console.error("挿入エラー2:", err);
                  process.exit(1);
                }

                console.log("挿入2完了: lastID =", this.lastID);

                db.run(
                  "INSERT INTO agencies (id, name) VALUES (15, '代理店C')",
                  function (err) {
                    if (err) {
                      console.error("挿入エラー3:", err);
                      process.exit(1);
                    }

                    console.log("挿入3完了: lastID =", this.lastID);

                    // 5. 挿入結果を確認
                    db.all(
                      "SELECT id, name FROM agencies ORDER BY id",
                      [],
                      (err, finalAgencies) => {
                        if (err) {
                          console.error("最終確認エラー:", err);
                          process.exit(1);
                        }

                        console.log("最終的な代理店データ:", finalAgencies);

                        // 6. 関数テスト
                        console.log("=== 関数テスト開始 ===");

                        try {
                          const agenciesModule = require("./routes/agencies");
                          console.log("モジュール読み込み成功");
                          console.log(
                            "利用可能なプロパティ:",
                            Object.keys(agenciesModule)
                          );

                          if (
                            typeof agenciesModule.checkAgencyIdIntegrity ===
                            "function"
                          ) {
                            console.log(
                              "checkAgencyIdIntegrity関数が見つかりました"
                            );

                            agenciesModule.checkAgencyIdIntegrity(
                              (err, result) => {
                                if (err) {
                                  console.error("整合性チェックエラー:", err);
                                  process.exit(1);
                                }

                                console.log("整合性チェック結果:", result);

                                if (!result.isIntegrityOk) {
                                  console.log("ID修正が必要です");

                                  if (
                                    typeof agenciesModule.fixAgencyIds ===
                                    "function"
                                  ) {
                                    console.log(
                                      "fixAgencyIds関数が見つかりました"
                                    );

                                    agenciesModule.fixAgencyIds((err) => {
                                      if (err) {
                                        console.error("ID修正エラー:", err);
                                        process.exit(1);
                                      }

                                      console.log("ID修正完了");

                                      // 修正後の確認
                                      db.all(
                                        "SELECT id, name FROM agencies ORDER BY id",
                                        [],
                                        (err, modifiedAgencies) => {
                                          if (err) {
                                            console.error(
                                              "修正後確認エラー:",
                                              err
                                            );
                                            process.exit(1);
                                          }

                                          console.log(
                                            "修正後の代理店データ:",
                                            modifiedAgencies
                                          );
                                          console.log("✅ テスト完了");
                                          process.exit(0);
                                        }
                                      );
                                    });
                                  } else {
                                    console.log(
                                      "fixAgencyIds関数が見つかりません"
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
                            console.log(
                              "checkAgencyIdIntegrity関数が見つかりません"
                            );
                            console.log(
                              "typeof結果:",
                              typeof agenciesModule.checkAgencyIdIntegrity
                            );
                            process.exit(1);
                          }
                        } catch (moduleError) {
                          console.error(
                            "モジュール読み込みエラー:",
                            moduleError
                          );
                          process.exit(1);
                        }
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}, 20000);

console.log("データベース初期化待機中（20秒）...");
