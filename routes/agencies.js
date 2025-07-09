const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  sendProfileRegistrationNotification,
  sendProfileUpdateNotification,
} = require("../config/email");

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// メール設定テスト（管理者のみ）
router.post("/test-email", requireRole(["admin"]), async (req, res) => {
  try {
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
        message:
          "テストメールが正常に送信されました。管理者のメールボックスを確認してください。",
      });
    } else {
      res.json({
        success: false,
        message: "メール送信に失敗しました。サーバーログを確認してください。",
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

// 代理店一覧ページ
router.get("/list", requireRole(["admin"]), (req, res) => {
  const groupId = req.query.group_id;

  // グループ一覧を取得
  db.all("SELECT * FROM groups", [], (err, groups) => {
    if (err) return res.status(500).send("DBエラー");

    let query = `
      SELECT 
        a.*,
        g.name as group_name,
        GROUP_CONCAT(ap.product_name, ', ') as product_names
      FROM agencies a 
      LEFT JOIN group_agency ga ON a.id = ga.agency_id 
      LEFT JOIN groups g ON ga.group_id = g.id
      LEFT JOIN agency_products ap ON a.id = ap.agency_id
    `;
    let params = [];

    if (groupId) {
      query += " WHERE ga.group_id = ?";
      params.push(groupId);
    }

    query += " GROUP BY a.id ORDER BY a.id";

    db.all(query, params, (err, agencies) => {
      if (err) return res.status(500).send("DBエラー");
      res.render("agencies_list", {
        agencies,
        groups,
        selectedGroupId: groupId,
        session: req.session,
        title: "代理店一覧",
      });
    });
  });
});

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

      res.redirect("/agencies/list");
    }
  );
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

      res.redirect("/agencies/list");
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
