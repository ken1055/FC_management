const express = require("express");
const router = express.Router();
const db = require("../db");

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// 売上一覧取得（API）
router.get("/", (req, res) => {
  if (req.session.user.role === "agency") {
    // 代理店は自分のデータのみ
    if (!req.session.user.store_id) {
      return res.status(400).send("代理店IDが設定されていません");
    }
    db.all(
      "SELECT * FROM sales WHERE store_id = ? ORDER BY year DESC, month DESC",
      [req.session.user.store_id],
      (err, rows) => {
        if (err) return res.status(500).send("DBエラー");
        res.json(rows);
      }
    );
  } else {
    // 役員・管理者は全て
    db.all(
      "SELECT s.*, a.name as agency_name FROM sales s LEFT JOIN stores a ON s.store_id = a.id ORDER BY s.year DESC, s.month DESC",
      [],
      (err, rows) => {
        if (err) return res.status(500).send("DBエラー");
        res.json(rows);
      }
    );
  }
});

// 売上登録（API）- 月次集計用（従来機能）
router.post("/", requireRole(["admin", "agency"]), (req, res) => {
  const { store_id, year, month, amount } = req.body;

  // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
  const processedAgencyId =
    store_id && store_id.toString().trim() !== "" ? parseInt(store_id) : null;
  const processedYear =
    year && year.toString().trim() !== "" ? parseInt(year) : null;
  const processedMonth =
    month && month.toString().trim() !== "" ? parseInt(month) : null;
  const processedAmount =
    amount && amount.toString().trim() !== "" ? parseInt(amount) : null;

  if (
    !processedAgencyId ||
    !processedYear ||
    !processedMonth ||
    processedAmount === null
  ) {
    return res.status(400).send("必須項目が不足しています");
  }

  // 代理店は自分のstore_idのみ登録可能
  if (req.session.user.role === "agency") {
    if (!req.session.user.store_id) {
      return res.status(400).send("代理店IDが設定されていません");
    }
    if (req.session.user.store_id !== processedAgencyId) {
      return res.status(403).send("自分の売上のみ登録可能です");
    }
  }

  // 重複チェック
  db.get(
    "SELECT id FROM sales WHERE store_id = ? AND year = ? AND month = ?",
    [processedAgencyId, processedYear, processedMonth],
    (err, existing) => {
      if (err) return res.status(500).send("DBエラー");
      if (existing) {
        return res.status(400).send("同じ年月の売上データが既に存在します");
      }

      db.run(
        "INSERT INTO sales (store_id, year, month, amount) VALUES (?, ?, ?, ?)",
        [processedAgencyId, processedYear, processedMonth, processedAmount],
        function (err) {
          if (err) return res.status(500).send("DBエラー");
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

// 個別取引登録（API）- 新機能
router.post("/transaction", requireRole(["admin", "agency"]), (req, res) => {
  const {
    store_id,
    customer_id,
    transaction_date,
    amount,
    description,
    payment_method,
  } = req.body;

  console.log("個別取引登録リクエスト:", req.body);

  // 必須項目チェック
  if (!store_id || !customer_id || !transaction_date || !amount) {
    return res.status(400).json({
      error: "必須項目が不足しています",
      required: ["store_id", "customer_id", "transaction_date", "amount"],
    });
  }

  // 数値変換
  const processedStoreId = parseInt(store_id);
  const processedCustomerId = parseInt(customer_id);
  const processedAmount = parseInt(amount);

  if (
    isNaN(processedStoreId) ||
    isNaN(processedCustomerId) ||
    isNaN(processedAmount)
  ) {
    return res
      .status(400)
      .json({ error: "数値フィールドの形式が正しくありません" });
  }

  // 代理店は自分のstore_idのみ登録可能
  if (req.session.user.role === "agency") {
    if (!req.session.user.store_id) {
      return res.status(400).json({ error: "代理店IDが設定されていません" });
    }
    if (req.session.user.store_id !== processedStoreId) {
      return res
        .status(403)
        .json({ error: "自分の店舗の売上のみ登録可能です" });
    }
  }

  // 顧客が指定店舗に属しているかチェック
  db.get(
    "SELECT id, name FROM customers WHERE id = ? AND store_id = ?",
    [processedCustomerId, processedStoreId],
    (err, customer) => {
      if (err) {
        console.error("顧客確認エラー:", err);
        return res.status(500).json({ error: "データベースエラー" });
      }

      if (!customer) {
        return res
          .status(400)
          .json({
            error: "指定された顧客が見つからないか、店舗が一致しません",
          });
      }

      // 取引を登録
      db.run(
        `INSERT INTO customer_transactions 
         (store_id, customer_id, transaction_date, amount, description, payment_method) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          processedStoreId,
          processedCustomerId,
          transaction_date,
          processedAmount,
          description || "",
          payment_method || "現金",
        ],
        function (err) {
          if (err) {
            console.error("取引登録エラー:", err);
            return res.status(500).json({ error: "取引の登録に失敗しました" });
          }

          console.log("取引登録成功:", this.lastID);

          // 成功レスポンス
          res.json({
            success: true,
            transaction_id: this.lastID,
            customer_name: customer.name,
            message: `${customer.name}様の取引を登録しました`,
          });
        }
      );
    }
  );
});

// 売上管理画面（一覧・可視化）
router.get("/list", requireRole(["admin", "agency"]), (req, res) => {
  if (req.session.user.role === "agency") {
    // 代理店は自分のデータのみ
    if (!req.session.user.store_id) {
      return res.redirect("/stores/create-profile");
    }

    // 代理店情報を取得
    db.get(
      "SELECT name FROM stores WHERE id = ?",
      [req.session.user.store_id],
      (err, agency) => {
        if (err) return res.status(500).send("DBエラー");

        // 売上データを取得
        db.all(
          "SELECT * FROM sales WHERE store_id = ? ORDER BY year DESC, month DESC",
          [req.session.user.store_id],
          (err, sales) => {
            if (err) return res.status(500).send("DBエラー");

            // 月間売上推移データを作成
            const chartData = sales.reverse().map((s) => ({
              period: `${s.year}年${s.month}月`,
              amount: s.amount,
            }));

            res.render("sales_list", {
              sales: sales.reverse(),
              chartData: JSON.stringify(chartData),
              agencyName: agency ? agency.name : "未設定",
              groups: [],
              selectedGroupId: null,
              session: req.session,
              success: req.query.success,
              title: "売上管理",
            });
          }
        );
      }
    );
  } else {
    // 管理者・役員は代理店選択画面を表示
    db.all(
      `SELECT 
          a.id, 
          a.name,
          COALESCE(COUNT(s.id), 0) as sales_count,
          COALESCE(SUM(s.amount), 0) as total_sales
        FROM stores a 
        LEFT JOIN sales s ON a.id = s.store_id 
        GROUP BY a.id, a.name 
        ORDER BY a.name`,
      [],
      (err, stores) => {
        if (err) return res.status(500).send("DBエラー");

        res.render("sales_agency_list", {
          stores,
          session: req.session,
          title: "売上管理 - 代理店選択",
        });
      }
    );
  }
});

// 個別代理店の売上表示
router.get("/agency/:id", requireRole(["admin"]), (req, res) => {
  const agencyId = req.params.id;

  // 代理店情報を取得
  db.get("SELECT name FROM stores WHERE id = ?", [agencyId], (err, agency) => {
    if (err || !agency) return res.status(404).send("代理店が見つかりません");

    // 売上データを取得
    db.all(
      "SELECT * FROM sales WHERE store_id = ? ORDER BY year DESC, month DESC",
      [agencyId],
      (err, sales) => {
        if (err) return res.status(500).send("DBエラー");

        // 月間売上推移データを作成
        const chartData = sales.reverse().map((s) => ({
          period: `${s.year}年${s.month}月`,
          amount: s.amount,
        }));

        res.render("sales_list", {
          sales: sales.reverse(),
          chartData: JSON.stringify(chartData),
          agencyName: agency.name,
          agencyId: agencyId,
          groups: [],
          selectedGroupId: null,
          session: req.session,
          success: req.query.success,
          title: `${agency.name}の売上管理`,
          isAdmin: true,
        });
      }
    );
  });
});

// 売上登録フォーム
router.get("/new", requireRole(["admin", "agency"]), (req, res) => {
  const preselectedAgencyId = req.query.store_id; // クエリパラメータから代理店IDを取得

  if (req.session.user.role === "agency") {
    if (!req.session.user.store_id) {
      return res.redirect("/stores/create-profile");
    }

    // 代理店情報を取得
    db.get(
      "SELECT name FROM stores WHERE id = ?",
      [req.session.user.store_id],
      (err, agency) => {
        if (err) return res.status(500).send("DBエラー");

        res.render("sales_form", {
          session: req.session,
          stores: [],
          agencyName: agency ? agency.name : "未設定",
          sale: null, // sale変数を追加
          title: "売上登録",
        });
      }
    );
  } else {
    // 管理者は代理店一覧を取得
    db.all("SELECT * FROM stores ORDER BY name", [], (err, stores) => {
      if (err) return res.status(500).send("DBエラー");

      // 事前選択された代理店の情報を取得
      let preselectedAgency = null;
      if (preselectedAgencyId) {
        preselectedAgency = stores.find((a) => a.id == preselectedAgencyId);
      }

      res.render("sales_form", {
        session: req.session,
        stores,
        agencyName: null,
        preselectedAgencyId: preselectedAgencyId,
        preselectedAgencyName: preselectedAgency
          ? preselectedAgency.name
          : null,
        sale: null, // sale変数を追加
        title: "売上登録",
      });
    });
  }
});

// 売上登録（フォームPOST）
router.post("/new", requireRole(["admin", "agency"]), (req, res) => {
  const { store_id, year, month, amount } = req.body;

  if (req.session.user.role === "agency") {
    if (!req.session.user.store_id) {
      return res.status(400).send("代理店IDが設定されていません");
    }
    if (req.session.user.store_id !== Number(store_id)) {
      return res.status(403).send("自分の売上のみ登録可能です");
    }
  }

  // 重複チェック
  db.get(
    "SELECT id FROM sales WHERE store_id = ? AND year = ? AND month = ?",
    [store_id, year, month],
    (err, existing) => {
      if (err) return res.status(500).send("DBエラー");
      if (existing) {
        // エラー時も代理店リストを再取得して渡す
        if (req.session.user.role === "agency") {
          // 代理店情報を取得
          db.get(
            "SELECT name FROM stores WHERE id = ?",
            [req.session.user.store_id],
            (err, agency) => {
              if (err) return res.status(500).send("DBエラー");

              return res.render("sales_form", {
                session: req.session,
                stores: [],
                agencyName: agency ? agency.name : "未設定",
                title: "売上登録",
                sale: null, // sale変数を追加
                error: "同じ年月の売上データが既に存在します",
              });
            }
          );
        } else {
          // 管理者は代理店一覧を取得
          db.all("SELECT * FROM stores ORDER BY name", [], (err, stores) => {
            if (err) return res.status(500).send("DBエラー");

            return res.render("sales_form", {
              session: req.session,
              stores,
              agencyName: null,
              title: "売上登録",
              sale: null, // sale変数を追加
              error: "同じ年月の売上データが既に存在します",
            });
          });
        }
        return; // 重複データが存在する場合は、ここで処理を終了
      }

      db.run(
        "INSERT INTO sales (store_id, year, month, amount) VALUES (?, ?, ?, ?)",
        [store_id, year, month, amount],
        function (err) {
          if (err) return res.status(500).send("DBエラー");
          res.redirect("/sales/list?success=1");
        }
      );
    }
  );
});

// 売上編集フォーム
router.get("/edit/:id", requireRole(["admin", "agency"]), (req, res) => {
  db.get("SELECT * FROM sales WHERE id = ?", [req.params.id], (err, sale) => {
    if (err || !sale) return res.status(404).send("データがありません");

    // 代理店は自分のデータのみ編集可能
    if (req.session.user.role === "agency") {
      if (sale.store_id !== req.session.user.store_id) {
        return res.status(403).send("自分の売上のみ編集可能です");
      }
    }

    if (req.session.user.role === "agency") {
      db.get(
        "SELECT name FROM stores WHERE id = ?",
        [sale.store_id],
        (err, agency) => {
          if (err) return res.status(500).send("DBエラー");

          res.render("sales_form", {
            session: req.session,
            stores: [],
            agencyName: agency ? agency.name : "未設定",
            sale: sale,
            title: "売上編集",
          });
        }
      );
    } else {
      db.all("SELECT * FROM stores ORDER BY name", [], (err, stores) => {
        if (err) return res.status(500).send("DBエラー");
        res.render("sales_form", {
          session: req.session,
          stores,
          agencyName: null,
          sale: sale,
          title: "売上編集",
        });
      });
    }
  });
});

// 売上編集（フォームPOST）
router.post("/edit/:id", requireRole(["admin", "agency"]), (req, res) => {
  const { store_id, year, month, amount } = req.body;

  db.get("SELECT * FROM sales WHERE id = ?", [req.params.id], (err, sale) => {
    if (err || !sale) return res.status(404).send("データがありません");

    // 代理店は自分のデータのみ編集可能
    if (req.session.user.role === "agency") {
      if (sale.store_id !== req.session.user.store_id) {
        return res.status(403).send("自分の売上のみ編集可能です");
      }
    }

    db.run(
      "UPDATE sales SET store_id=?, year=?, month=?, amount=? WHERE id=?",
      [store_id, year, month, amount, req.params.id],
      function (err) {
        if (err) return res.status(500).send("DBエラー");
        res.redirect("/sales/list?success=1");
      }
    );
  });
});

// 売上削除
router.post("/delete/:id", requireRole(["admin", "agency"]), (req, res) => {
  db.get("SELECT * FROM sales WHERE id = ?", [req.params.id], (err, sale) => {
    if (err || !sale) return res.status(404).send("データがありません");

    // 代理店は自分のデータのみ削除可能
    if (req.session.user.role === "agency") {
      if (sale.store_id !== req.session.user.store_id) {
        return res.status(403).send("自分の売上のみ削除可能です");
      }
    }

    db.run("DELETE FROM sales WHERE id = ?", [req.params.id], function (err) {
      if (err) return res.status(500).send("DBエラー");
      res.redirect("/sales/list?success=1");
    });
  });
});

module.exports = router;
