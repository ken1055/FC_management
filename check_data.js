const db = require("./db");

console.log("=== データベース状態確認 ===");

// 5秒後にチェック開始
setTimeout(() => {
  console.log("データベースチェック開始");

  // 1. 現在の代理店データを確認
  db.all("SELECT id, name FROM agencies ORDER BY id", [], (err, rows) => {
    if (err) {
      console.error("代理店データ取得エラー:", err);
      process.exit(1);
    }

    console.log("=== 現在の代理店データ（ID順） ===");
    if (rows.length === 0) {
      console.log("代理店データが存在しません");
    } else {
      rows.forEach((row) => {
        console.log(`ID: ${row.id}, Name: ${row.name}`);
      });
    }

    // 2. 名前順での並び替え
    db.all(
      "SELECT id, name FROM agencies ORDER BY name",
      [],
      (err, nameOrderRows) => {
        if (err) {
          console.error("名前順データ取得エラー:", err);
          process.exit(1);
        }

        console.log("\n=== 代理店データ（名前順） ===");
        if (nameOrderRows.length === 0) {
          console.log("代理店データが存在しません");
        } else {
          nameOrderRows.forEach((row, index) => {
            const expectedId = index + 1;
            const status = row.id === expectedId ? "✅" : "❌";
            console.log(
              `${status} ID: ${row.id} (期待値: ${expectedId}), Name: ${row.name}`
            );
          });
        }

        // 3. ID整合性の問題を検出
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

          // 4. 修正機能をテスト
          console.log("\n=== ID修正機能テスト開始 ===");

          // 実際の修正関数を呼び出し
          const fixAgencyIds = require("./routes/agencies.js").fixAgencyIds;

          if (typeof fixAgencyIds === "function") {
            fixAgencyIds((err) => {
              if (err) {
                console.error("ID修正エラー:", err);
                process.exit(1);
              } else {
                console.log("ID修正完了");

                // 5. 修正後の確認
                db.all(
                  "SELECT id, name FROM agencies ORDER BY name",
                  [],
                  (err, fixedRows) => {
                    if (err) {
                      console.error("修正後データ取得エラー:", err);
                      process.exit(1);
                    }

                    console.log("\n=== 修正後のデータ ===");
                    let allFixed = true;
                    fixedRows.forEach((row, index) => {
                      const expectedId = index + 1;
                      const status = row.id === expectedId ? "✅" : "❌";
                      console.log(
                        `${status} ID: ${row.id} (期待値: ${expectedId}), Name: ${row.name}`
                      );
                      if (row.id !== expectedId) {
                        allFixed = false;
                      }
                    });

                    if (allFixed) {
                      console.log("\n✅ ID修正機能テスト成功");
                    } else {
                      console.log("\n❌ ID修正機能テスト失敗");
                    }

                    process.exit(0);
                  }
                );
              }
            });
          } else {
            console.log("fixAgencyIds関数が見つかりません");
            process.exit(1);
          }
        }
      }
    );
  });
}, 5000);

console.log("データベース初期化待機中（5秒）...");
