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
        product_features:
          "これは代理店登録通知メールのテストです。高品質な商品を取り扱っています。",
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
      product_features: "これはメール通知のテストです。",
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
  db.all("SELECT * FROM agencies", [], (err, rows) => {
    if (err) return res.status(500).send("DBエラー");
    res.json(rows);
  });
});

// ID整合性チェック機能（代理店用）
function checkAgencyIdIntegrity(callback) {
  console.log("代理店ID整合性チェック開始...");

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

// ID修正機能（代理店用・PostgreSQL対応）
function fixAgencyIds(callback) {
  console.log("代理店ID修正開始...");

  // 現在の代理店を取得（nameでソート）
  db.all("SELECT id, name FROM agencies ORDER BY name", [], (err, agencies) => {
    if (err) return callback(err);

    if (agencies.length === 0) return callback(null);

    // データベースタイプを判定（DATABASE_URLが設定されていればPostgreSQL）
    const isPostgres = !!process.env.DATABASE_URL;

    console.log("データベースタイプ判定:", {
      DATABASE_URL: !!process.env.DATABASE_URL,
      RAILWAY_ENVIRONMENT_NAME: !!process.env.RAILWAY_ENVIRONMENT_NAME,
      NODE_ENV: process.env.NODE_ENV,
      isPostgres: isPostgres,
    });

    if (isPostgres) {
      // PostgreSQL用の修正処理
      fixAgencyIdsPostgres(agencies, callback);
    } else {
      // SQLite用の修正処理
      fixAgencyIdsSQLite(agencies, callback);
    }
  });
}

// PostgreSQL用のID修正処理
function fixAgencyIdsPostgres(agencies, callback) {
  console.log("PostgreSQL環境でのID修正を実行中...");

  if (agencies.length === 0) {
    console.log("修正対象の代理店がありません");
    return callback(null);
  }

  // 修正が必要かチェック
  let needsFixing = false;
  agencies.forEach((agency, index) => {
    if (agency.id !== index + 1) {
      needsFixing = true;
    }
  });

  if (!needsFixing) {
    console.log("代理店ID修正完了（変更不要）");
    return callback(null);
  }

  console.log("ID修正が必要な代理店を検出、修正処理を開始...");

  // トランザクション開始
  db.run("BEGIN", (err) => {
    if (err) {
      console.error("トランザクション開始エラー:", err);
      return callback(err);
    }

    console.log("トランザクション開始");

    // 各代理店のIDを順次修正
    let completed = 0;
    let hasError = false;

    agencies.forEach((agency, index) => {
      const newId = index + 1;

      if (agency.id === newId) {
        completed++;
        if (completed === agencies.length && !hasError) {
          completeTransaction();
        }
        return;
      }

      console.log(`代理店ID修正開始: ${agency.id} → ${newId} (${agency.name})`);

      // 一時的に負のIDに変更して競合を回避
      const tempId = -(agency.id + 1000000); // 大きな負の値を使用

      // Step 1: 代理店を一時IDに変更
      db.run(
        "UPDATE agencies SET id = ? WHERE id = ?",
        [tempId, agency.id],
        (err) => {
          if (err) {
            console.error("一時ID更新エラー:", err);
            hasError = true;
            return rollbackTransaction(err);
          }

          console.log(`代理店を一時ID ${tempId} に変更: ${agency.name}`);

          // Step 2: 関連テーブルを一時IDに更新
          updateRelatedTablesToTempId(agency.id, tempId, (err) => {
            if (err) {
              hasError = true;
              return rollbackTransaction(err);
            }

            // Step 3: 代理店を最終IDに更新
            db.run(
              "UPDATE agencies SET id = ? WHERE id = ?",
              [newId, tempId],
              (err) => {
                if (err) {
                  console.error("最終ID更新エラー:", err);
                  hasError = true;
                  return rollbackTransaction(err);
                }

                console.log(`代理店を最終ID ${newId} に変更: ${agency.name}`);

                // Step 4: 関連テーブルを最終IDに更新
                updateRelatedTablesToFinalId(tempId, newId, (err) => {
                  if (err) {
                    hasError = true;
                    return rollbackTransaction(err);
                  }

                  completed++;
                  console.log(
                    `代理店ID修正完了: ${agency.id} → ${newId} (${agency.name})`
                  );

                  if (completed === agencies.length && !hasError) {
                    completeTransaction();
                  }
                });
              }
            );
          });
        }
      );
    });

    // 関連テーブルを一時IDに更新する関数
    function updateRelatedTablesToTempId(originalId, tempId, callback) {
      const updates = [
        { table: "sales", column: "agency_id" },
        { table: "materials", column: "agency_id" },
        { table: "group_agency", column: "agency_id" },
        { table: "agency_products", column: "agency_id" },
        { table: "users", column: "agency_id" },
        { table: "product_files", column: "agency_id" },
      ];

      let updateCompleted = 0;
      let updateError = null;

      updates.forEach(({ table, column }) => {
        db.run(
          `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
          [tempId, originalId],
          (err) => {
            if (err) {
              console.error(`${table}テーブルの一時ID更新エラー:`, err);
              updateError = err;
            } else {
              console.log(`${table}テーブルを一時ID ${tempId} に更新`);
            }

            updateCompleted++;
            if (updateCompleted === updates.length) {
              callback(updateError);
            }
          }
        );
      });
    }

    // 関連テーブルを最終IDに更新する関数
    function updateRelatedTablesToFinalId(tempId, finalId, callback) {
      const updates = [
        { table: "sales", column: "agency_id" },
        { table: "materials", column: "agency_id" },
        { table: "group_agency", column: "agency_id" },
        { table: "agency_products", column: "agency_id" },
        { table: "users", column: "agency_id" },
        { table: "product_files", column: "agency_id" },
      ];

      let updateCompleted = 0;
      let updateError = null;

      updates.forEach(({ table, column }) => {
        db.run(
          `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
          [finalId, tempId],
          (err) => {
            if (err) {
              console.error(`${table}テーブルの最終ID更新エラー:`, err);
              updateError = err;
            } else {
              console.log(`${table}テーブルを最終ID ${finalId} に更新`);
            }

            updateCompleted++;
            if (updateCompleted === updates.length) {
              callback(updateError);
            }
          }
        );
      });
    }

    // トランザクション完了
    function completeTransaction() {
      console.log("代理店ID修正完了、シーケンスをリセット中...");

      // PostgreSQLのシーケンスをリセット（動的にシーケンス名を取得）
      db.run(
        `
        SELECT setval(
          (SELECT pg_get_serial_sequence('agencies', 'id')), 
          ?, 
          false
        )
      `,
        [agencies.length],
        (err) => {
          if (err) {
            console.error("シーケンスリセットエラー:", err);
            console.log("シーケンスリセットエラーを無視して処理を続行");
          } else {
            console.log(`代理店シーケンスを${agencies.length}にリセット`);
          }

          // トランザクションをコミット
          db.run("COMMIT", (err) => {
            if (err) {
              console.error("トランザクションコミットエラー:", err);
              return rollbackTransaction(err);
            }

            console.log("代理店ID修正完了（PostgreSQL）");
            callback(null);
          });
        }
      );
    }

    // トランザクションロールバック
    function rollbackTransaction(error) {
      console.error("エラーが発生、トランザクションをロールバック:", error);

      db.run("ROLLBACK", (rollbackErr) => {
        if (rollbackErr) {
          console.error("ロールバックエラー:", rollbackErr);
        }
        callback(error);
      });
    }
  });
}

// SQLite用のID修正処理
function fixAgencyIdsSQLite(agencies, callback) {
  console.log("SQLite環境でのID修正を実行中...");

  // 一時テーブルを作成
  db.run("CREATE TEMP TABLE temp_agencies AS SELECT * FROM agencies", (err) => {
    if (err) return callback(err);

    // 元の代理店データを削除
    db.run("DELETE FROM agencies", (err) => {
      if (err) return callback(err);

      // 新しいIDで再挿入
      let completed = 0;
      agencies.forEach((agency, index) => {
        const newId = index + 1;
        db.run(
          "INSERT INTO agencies (id, name, age, address, bank_info, experience_years, contract_date, start_date, product_features) SELECT ?, name, age, address, bank_info, experience_years, contract_date, start_date, product_features FROM temp_agencies WHERE id = ?",
          [newId, agency.id],
          (err) => {
            if (err) console.error("代理店ID修正エラー:", err);

            // 関連テーブルのagency_idも更新
            Promise.all([
              new Promise((resolve) => {
                db.run(
                  "UPDATE sales SET agency_id = ? WHERE agency_id = (SELECT id FROM temp_agencies WHERE id = ?)",
                  [newId, agency.id],
                  () => resolve()
                );
              }),
              new Promise((resolve) => {
                db.run(
                  "UPDATE materials SET agency_id = ? WHERE agency_id = (SELECT id FROM temp_agencies WHERE id = ?)",
                  [newId, agency.id],
                  () => resolve()
                );
              }),
              new Promise((resolve) => {
                db.run(
                  "UPDATE group_agency SET agency_id = ? WHERE agency_id = (SELECT id FROM temp_agencies WHERE id = ?)",
                  [newId, agency.id],
                  () => resolve()
                );
              }),
              new Promise((resolve) => {
                db.run(
                  "UPDATE agency_products SET agency_id = ? WHERE agency_id = (SELECT id FROM temp_agencies WHERE id = ?)",
                  [newId, agency.id],
                  () => resolve()
                );
              }),
              new Promise((resolve) => {
                db.run(
                  "UPDATE users SET agency_id = ? WHERE agency_id = (SELECT id FROM temp_agencies WHERE id = ?)",
                  [newId, agency.id],
                  () => resolve()
                );
              }),
            ]).then(() => {
              completed++;
              console.log(
                `代理店ID修正: ${agency.id} → ${newId} (${agency.name})`
              );

              if (completed === agencies.length) {
                // 一時テーブルを削除
                db.run("DROP TABLE temp_agencies", () => {
                  // シーケンステーブルをリセット
                  db.run(
                    "UPDATE sqlite_sequence SET seq = ? WHERE name = 'agencies'",
                    [agencies.length],
                    () => {
                      console.log("代理店ID修正完了（SQLite）");
                      callback(null);
                    }
                  );
                });
              }
            });
          }
        );
      });
    });
  });
}

// 代理店一覧ページ
router.get("/list", requireRole(["admin"]), (req, res) => {
  const { group_id, search, message } = req.query;

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

    // ID整合性に問題がある場合は自動修正
    if (!integrityInfo.isIntegrityOk && integrityInfo.issues.length > 0) {
      console.log("代理店ID整合性の問題を発見、自動修正を実行...");
      console.log("問題のあるID:", integrityInfo.issues);

      fixAgencyIds((fixErr) => {
        if (fixErr) {
          console.error("代理店ID自動修正エラー:", fixErr);
          // エラーがあっても画面表示は続行
          renderAgenciesList(
            req,
            res,
            group_id,
            search,
            integrityInfo,
            message
          );
        } else {
          console.log("代理店ID自動修正完了");
          // 修正完了後、再度整合性チェック
          checkAgencyIdIntegrity((recheckErr, updatedIntegrityInfo) => {
            const finalIntegrityInfo = recheckErr
              ? integrityInfo
              : updatedIntegrityInfo;
            renderAgenciesList(
              req,
              res,
              group_id,
              search,
              finalIntegrityInfo,
              message,
              "代理店IDの連番を自動修正しました"
            );
          });
        }
      });
    } else {
      // ID整合性に問題がない場合は通常の表示
      renderAgenciesList(req, res, group_id, search, integrityInfo, message);
    }
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

    // データベースタイプに応じた集約関数を選択
    const isPostgres = !!process.env.DATABASE_URL;
    const aggregateFunction = isPostgres
      ? "STRING_AGG(ap.product_name, ', ')"
      : "GROUP_CONCAT(ap.product_name, ', ')";

    let query = `
    SELECT 
      a.*,
      g.name as group_name,
      ${aggregateFunction} as product_names
    FROM agencies a 
    LEFT JOIN group_agency ga ON a.id = ga.agency_id 
    LEFT JOIN groups g ON ga.group_id = g.id
    LEFT JOIN agency_products ap ON a.id = ap.agency_id
  `;
    let params = [];
    let conditions = [];

    if (groupId) {
      conditions.push("ga.group_id = ?");
      params.push(groupId);
    }

    if (searchQuery) {
      conditions.push(
        "(a.name LIKE ? OR a.address LIKE ? OR a.bank_info LIKE ? OR a.product_features LIKE ?)"
      );
      params.push(
        `%${searchQuery}%`,
        `%${searchQuery}%`,
        `%${searchQuery}%`,
        `%${searchQuery}%`
      );
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // PostgreSQLでは、SELECTで選択するすべての非集約列をGROUP BYに含める必要がある
    if (isPostgres) {
      query +=
        " GROUP BY a.id, a.name, a.age, a.address, a.bank_info, a.experience_years, a.contract_date, a.start_date, a.product_features, g.name ORDER BY a.id";
    } else {
      query += " GROUP BY a.id ORDER BY a.id";
    }

    db.all(query, params, (err, agencies) => {
      if (err) {
        console.error("代理店一覧取得エラー:", err);
        return res.status(500).send("DBエラー: " + err.message);
      }

      console.log("代理店一覧取得完了:", agencies.length, "件");

      res.render("agencies_list", {
        agencies,
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
    title: "代理店新規登録",
  });
});

// 編集フォーム
router.get("/edit/:id", requireRole(["admin"]), (req, res) => {
  db.get(
    "SELECT * FROM agencies WHERE id = ?",
    [req.params.id],
    (err, agency) => {
      if (err || !agency) return res.status(404).send("データがありません");

      // 取り扱い商品を取得
      db.all(
        "SELECT product_name FROM agency_products WHERE agency_id = ?",
        [req.params.id],
        (err, products) => {
          if (err) {
            console.error("商品取得エラー:", err);
            products = [];
          }

          // 商品名の配列を作成
          agency.product_names = products.map((p) => p.product_name).join(", ");

          res.render("agencies_form", {
            agency,
            session: req.session,
            title: "代理店編集",
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
    start_date,
    product_features,
  } = req.body;
  db.run(
    "INSERT INTO agencies (name, age, address, bank_info, experience_years, contract_date, start_date, product_features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      age,
      address,
      bank_info,
      experience_years,
      contract_date,
      start_date,
      product_features,
    ],
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
    start_date,
    product_features,
  } = req.body;
  db.run(
    "UPDATE agencies SET name=?, age=?, address=?, bank_info=?, experience_years=?, contract_date=?, start_date=?, product_features=? WHERE id=?",
    [
      name,
      age,
      address,
      bank_info,
      experience_years,
      contract_date,
      start_date,
      product_features,
      req.params.id,
    ],
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
      age,
      address,
      bank_info,
      experience_years,
      contract_date,
      start_date,
      product_features,
      products,
      email,
      password,
      password_confirm,
    } = req.body;

    // 必須フィールドのチェック
    if (!name || name.trim() === "") {
      return res.status(400).send("代理店名は必須です");
    }

    // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
    const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
    const processedExperienceYears =
      experience_years && experience_years.trim() !== ""
        ? parseInt(experience_years)
        : null;
    const processedContractDate =
      contract_date && contract_date.trim() !== "" ? contract_date : null;
    const processedStartDate =
      start_date && start_date.trim() !== "" ? start_date : null;

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
        "INSERT INTO agencies (name, age, address, bank_info, experience_years, contract_date, start_date, product_features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          name,
          processedAge,
          address,
          bank_info,
          processedExperienceYears,
          processedContractDate,
          processedStartDate,
          product_features,
        ],
        function (err) {
          if (err) {
            console.error("代理店作成エラー:", err);
            return res.status(500).send(`代理店作成エラー: ${err.message}`);
          }

          const agencyId = this.lastID;
          saveProducts(agencyId);
        }
      );
    }

    function createAgencyWithUser() {
      // パスワードをハッシュ化
      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) return res.status(500).send("パスワードハッシュ化エラー");

        // 代理店を作成
        db.run(
          "INSERT INTO agencies (name, age, address, bank_info, experience_years, contract_date, start_date, product_features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            name,
            processedAge,
            address,
            bank_info,
            processedExperienceYears,
            processedContractDate,
            processedStartDate,
            product_features,
          ],
          function (err) {
            if (err) {
              console.error("代理店作成エラー:", err);
              return res.status(500).send(`代理店作成エラー: ${err.message}`);
            }

            const agencyId = this.lastID;

            // ユーザーアカウントを作成
            db.run(
              "INSERT INTO users (email, password, role, agency_id) VALUES (?, ?, ?, ?)",
              [email, hashedPassword, "agency", agencyId],
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
                  `代理店ユーザーアカウント作成: ${email} (agency_id: ${agencyId})`
                );
                saveProducts(agencyId);
              }
            );
          }
        );
      });
    }

    function saveProducts(agencyId) {
      console.log("=== saveProducts開始 ===");
      console.log("agencyId:", agencyId);

      // 取り扱い商品を保存
      if (products) {
        const productList = Array.isArray(products) ? products : [products];
        console.log("保存する商品:", productList);

        productList.forEach((product) => {
          db.run(
            "INSERT INTO agency_products (agency_id, product_name) VALUES (?, ?)",
            [agencyId, product],
            (err) => {
              if (err) console.error("商品保存エラー:", err);
            }
          );
        });
      }

      // 代理店登録完了後にメール通知を送信
      const agencyData = {
        id: agencyId,
        name,
        age,
        address,
        bank_info,
        experience_years,
        contract_date,
        start_date,
        product_features,
        email: email || null, // ユーザーアカウントのメールアドレス
      };

      const adminUser = {
        email: req.session.user.email,
        id: req.session.user.id,
      };

      console.log("メール通知送信開始");
      // 非同期でメール送信（エラーがあってもリダイレクトは継続）
      sendAgencyRegistrationNotification(agencyData, adminUser, !!email).catch(
        (error) => {
          console.error("代理店登録通知メール送信エラー:", error);
        }
      );

      console.log("代理店登録完了、リダイレクト実行: /agencies/list");

      try {
        res.redirect(
          "/agencies/list?success=" +
            encodeURIComponent(`代理店「${name}」を登録しました`)
        );
      } catch (redirectError) {
        console.error("リダイレクトエラー:", redirectError);
        res
          .status(500)
          .send("登録は完了しましたが、リダイレクトでエラーが発生しました");
      }
    }
  } catch (error) {
    console.error("新規登録エラー:", error);
    res.status(500).send("エラーが発生しました: " + error.message);
  }
});

// 編集（フォームPOST対応）
router.post("/edit/:id", requireRole(["admin"]), (req, res) => {
  const {
    name,
    age,
    address,
    bank_info,
    experience_years,
    contract_date,
    start_date,
    product_features,
    products,
  } = req.body;

  // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
  const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
  const processedExperienceYears =
    experience_years && experience_years.trim() !== ""
      ? parseInt(experience_years)
      : null;
  const processedContractDate =
    contract_date && contract_date.trim() !== "" ? contract_date : null;
  const processedStartDate =
    start_date && start_date.trim() !== "" ? start_date : null;

  db.run(
    "UPDATE agencies SET name=?, age=?, address=?, bank_info=?, experience_years=?, contract_date=?, start_date=?, product_features=? WHERE id=?",
    [
      name,
      processedAge,
      address,
      bank_info,
      processedExperienceYears,
      processedContractDate,
      processedStartDate,
      product_features,
      req.params.id,
    ],
    function (err) {
      if (err) return res.status(500).send("DBエラー");

      // 既存の商品を削除
      db.run(
        "DELETE FROM agency_products WHERE agency_id = ?",
        [req.params.id],
        (err) => {
          if (err) console.error("商品削除エラー:", err);

          // 新しい商品を保存
          if (products) {
            const productList = Array.isArray(products) ? products : [products];
            productList.forEach((product) => {
              db.run(
                "INSERT INTO agency_products (agency_id, product_name) VALUES (?, ?)",
                [req.params.id, product],
                (err) => {
                  if (err) console.error("商品保存エラー:", err);
                }
              );
            });
          }
        }
      );

      res.redirect(
        "/agencies/list?success=" +
          encodeURIComponent(`代理店「${name}」を更新しました`)
      );
    }
  );
});

// 代理店削除（管理者のみ）
router.post("/delete/:id", requireRole(["admin"]), (req, res) => {
  const agencyId = req.params.id;

  // 代理店情報を取得
  db.get(
    "SELECT name FROM agencies WHERE id = ?",
    [agencyId],
    (err, agency) => {
      if (err) return res.status(500).send("DBエラー");
      if (!agency) {
        return res.redirect(
          "/agencies/list?error=" +
            encodeURIComponent("指定された代理店が見つかりません")
        );
      }

      // 関連するユーザーアカウントを確認
      db.all(
        "SELECT id, email FROM users WHERE agency_id = ?",
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

          // 関連データを削除する関数（順次実行）
          const deleteRelatedData = (callback) => {
            // 1. 関連するユーザーアカウントを最初に削除（重要）
            console.log(
              `代理店ID ${agencyId} に関連するユーザーアカウントを削除中...`
            );
            db.run(
              "DELETE FROM users WHERE agency_id = ?",
              [agencyId],
              function (err) {
                if (err) {
                  console.error("ユーザーアカウント削除エラー:", err);
                } else {
                  console.log(
                    `代理店ID ${agencyId} のユーザーアカウントを削除しました (削除件数: ${this.changes})`
                  );

                  // 削除されたユーザーの詳細をログに記録
                  if (relatedUsers.length > 0) {
                    relatedUsers.forEach((user) => {
                      console.log(
                        `削除されたユーザー: ID=${user.id}, Email=${user.email}`
                      );
                    });
                  }
                }

                // 2. 売上データを削除
                db.run(
                  "DELETE FROM sales WHERE agency_id = ?",
                  [agencyId],
                  (err) => {
                    if (err) console.error("売上データ削除エラー:", err);

                    // 3. 商品資料を削除
                    db.run(
                      "DELETE FROM materials WHERE agency_id = ?",
                      [agencyId],
                      (err) => {
                        if (err) console.error("資料削除エラー:", err);

                        // 4. グループ所属を削除
                        db.run(
                          "DELETE FROM group_agency WHERE agency_id = ?",
                          [agencyId],
                          (err) => {
                            if (err)
                              console.error("グループ所属削除エラー:", err);

                            // 5. 取り扱い商品を削除
                            db.run(
                              "DELETE FROM agency_products WHERE agency_id = ?",
                              [agencyId],
                              (err) => {
                                if (err) console.error("商品削除エラー:", err);

                                // 6. 製品ファイルを削除
                                db.run(
                                  "DELETE FROM product_files WHERE agency_id = ?",
                                  [agencyId],
                                  (err) => {
                                    if (err)
                                      console.error(
                                        "製品ファイル削除エラー:",
                                        err
                                      );

                                    // すべての関連データ削除完了
                                    callback();
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
          };

          // 関連データを削除してから代理店本体を削除
          deleteRelatedData(() => {
            db.run(
              "DELETE FROM agencies WHERE id = ?",
              [agencyId],
              function (err) {
                if (err) {
                  console.error("代理店削除エラー:", err);
                  return res.redirect(
                    "/agencies/list?error=" +
                      encodeURIComponent("削除中にエラーが発生しました")
                  );
                }

                console.log(
                  `代理店「${agency.name}」(ID: ${agencyId}) を削除しました`
                );

                // 削除後にID整合性をチェックし、必要に応じて自動修正
                checkAgencyIdIntegrity((checkErr, integrityInfo) => {
                  if (checkErr) {
                    console.error("削除後のID整合性チェックエラー:", checkErr);
                    return res.redirect(
                      "/agencies/list?success=" +
                        encodeURIComponent(
                          `「${agency.name}」の代理店データと関連するユーザーアカウントを削除しました`
                        )
                    );
                  }

                  if (
                    !integrityInfo.isIntegrityOk &&
                    integrityInfo.issues.length > 0
                  ) {
                    console.log(
                      "削除後のID整合性問題を発見、自動修正を実行..."
                    );
                    fixAgencyIds((fixErr) => {
                      if (fixErr) {
                        console.error("削除後のID自動修正エラー:", fixErr);
                        return res.redirect(
                          "/agencies/list?success=" +
                            encodeURIComponent(
                              `「${agency.name}」の代理店データと関連するユーザーアカウントを削除しました`
                            )
                        );
                      }

                      console.log("削除後のID自動修正完了");
                      res.redirect(
                        "/agencies/list?success=" +
                          encodeURIComponent(
                            `「${agency.name}」の代理店データと関連するユーザーアカウントを削除し、IDの連番を自動修正しました`
                          )
                      );
                    });
                  } else {
                    res.redirect(
                      "/agencies/list?success=" +
                        encodeURIComponent(
                          `「${agency.name}」の代理店データと関連するユーザーアカウントを削除しました`
                        )
                    );
                  }
                });
              }
            );
          });
        }
      );
    }
  );
});

// 代理店プロフィール表示
router.get("/profile/:id", requireRole(["admin", "agency"]), (req, res) => {
  const agencyId = req.params.id;

  // 代理店ユーザーは自分のプロフィールのみ閲覧可能
  if (req.session.user.role === "agency") {
    if (req.session.user.agency_id !== parseInt(agencyId)) {
      return res.status(403).send("自分のプロフィールのみ閲覧可能です");
    }
  }

  db.get("SELECT * FROM agencies WHERE id = ?", [agencyId], (err, agency) => {
    if (err || !agency) return res.status(404).send("代理店が見つかりません");

    // 取り扱い商品を取得
    db.all(
      "SELECT product_name FROM agency_products WHERE agency_id = ?",
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
        FROM group_agency ga 
        LEFT JOIN groups g ON ga.group_id = g.id 
        WHERE ga.agency_id = ?
      `,
          [agencyId],
          (err, groupInfo) => {
            if (err) {
              console.error("グループ取得エラー:", err);
              groupInfo = null;
            }

            // 商品名の配列を作成
            agency.product_names = products.map((p) => p.product_name);
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
      if (req.session.user.agency_id !== parseInt(agencyId)) {
        return res.status(403).send("自分のプロフィールのみ編集可能です");
      }
    }

    db.get("SELECT * FROM agencies WHERE id = ?", [agencyId], (err, agency) => {
      if (err || !agency) return res.status(404).send("代理店が見つかりません");

      // 取り扱い商品を取得
      db.all(
        "SELECT product_name FROM agency_products WHERE agency_id = ?",
        [agencyId],
        (err, products) => {
          if (err) {
            console.error("商品取得エラー:", err);
            products = [];
          }

          // 商品名の配列を作成
          agency.product_names = products.map((p) => p.product_name).join(", ");

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
      if (req.session.user.agency_id !== parseInt(agencyId)) {
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
      start_date,
      product_features,
      products,
    } = req.body;

    // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
    const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
    const processedExperienceYears =
      experience_years && experience_years.trim() !== ""
        ? parseInt(experience_years)
        : null;
    const processedContractDate =
      contract_date && contract_date.trim() !== "" ? contract_date : null;
    const processedStartDate =
      start_date && start_date.trim() !== "" ? start_date : null;

    db.run(
      "UPDATE agencies SET name=?, age=?, address=?, bank_info=?, experience_years=?, contract_date=?, start_date=?, product_features=? WHERE id=?",
      [
        name,
        processedAge,
        address,
        bank_info,
        processedExperienceYears,
        processedContractDate,
        processedStartDate,
        product_features,
        agencyId,
      ],
      function (err) {
        if (err) return res.status(500).send("DBエラー");

        // 既存の商品を削除
        db.run(
          "DELETE FROM agency_products WHERE agency_id = ?",
          [agencyId],
          (err) => {
            if (err) console.error("商品削除エラー:", err);

            // 新しい商品を保存
            if (products) {
              const productList = Array.isArray(products)
                ? products
                : [products];
              productList.forEach((product) => {
                db.run(
                  "INSERT INTO agency_products (agency_id, product_name) VALUES (?, ?)",
                  [agencyId, product],
                  (err) => {
                    if (err) console.error("商品保存エラー:", err);
                  }
                );
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

        res.redirect("/agencies/profile/" + agencyId);
      }
    );
  }
);

// 代理店プロフィール作成フォーム（代理店ユーザー用）
router.get("/create-profile", requireRole(["agency"]), (req, res) => {
  // 既にプロフィールが存在する場合はリダイレクト
  if (req.session.user.agency_id) {
    return res.redirect("/agencies/profile/" + req.session.user.agency_id);
  }

  res.render("agencies_form", {
    agency: null,
    session: req.session,
    title: "代理店プロフィール作成",
    isCreateProfile: true,
  });
});

// 代理店プロフィール作成（代理店ユーザー用）
router.post("/create-profile", requireRole(["agency"]), (req, res) => {
  // 既にプロフィールが存在する場合はエラー
  if (req.session.user.agency_id) {
    return res.status(400).send("既にプロフィールが存在します");
  }

  const {
    name,
    age,
    address,
    bank_info,
    experience_years,
    contract_date,
    start_date,
    product_features,
    products,
  } = req.body;

  // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
  const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
  const processedExperienceYears =
    experience_years && experience_years.trim() !== ""
      ? parseInt(experience_years)
      : null;
  const processedContractDate =
    contract_date && contract_date.trim() !== "" ? contract_date : null;
  const processedStartDate =
    start_date && start_date.trim() !== "" ? start_date : null;

  db.run(
    "INSERT INTO agencies (name, age, address, bank_info, experience_years, contract_date, start_date, product_features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      processedAge,
      address,
      bank_info,
      processedExperienceYears,
      processedContractDate,
      processedStartDate,
      product_features,
    ],
    function (err) {
      if (err) return res.status(500).send("DBエラー");

      const agencyId = this.lastID;

      // 取り扱い商品を保存
      if (products) {
        const productList = Array.isArray(products) ? products : [products];
        productList.forEach((product) => {
          db.run(
            "INSERT INTO agency_products (agency_id, product_name) VALUES (?, ?)",
            [agencyId, product],
            (err) => {
              if (err) console.error("商品保存エラー:", err);
            }
          );
        });
      }

      // ユーザーテーブルのagency_idを更新
      db.run(
        "UPDATE users SET agency_id = ? WHERE id = ?",
        [agencyId, req.session.user.id],
        function (err) {
          if (err) {
            console.error("ユーザーのagency_id更新エラー:", err);
            return res
              .status(500)
              .send(
                "プロフィール作成は完了しましたが、アカウント連携でエラーが発生しました"
              );
          }

          // セッションのagency_idも更新
          req.session.user.agency_id = agencyId;

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
            product_features,
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

          res.redirect("/agencies/profile/" + agencyId);
        }
      );
    }
  );
});

module.exports = router;
