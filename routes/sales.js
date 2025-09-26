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

// 売上統計取得（API）- 個別取引ベース
router.get("/", (req, res) => {
  if (req.session.user.role === "agency") {
    // 代理店は自分のデータのみ
    if (!req.session.user.store_id) {
      return res.status(400).send("代理店IDが設定されていません");
    }
    db.all(
      `SELECT 
        strftime('%Y', transaction_date) as year,
        strftime('%m', transaction_date) as month,
        SUM(amount) as amount,
        COUNT(*) as transaction_count
      FROM customer_transactions 
      WHERE store_id = ? 
      GROUP BY strftime('%Y', transaction_date), strftime('%m', transaction_date)
      ORDER BY year DESC, month DESC`,
      [req.session.user.store_id],
      (err, rows) => {
        if (err) return res.status(500).send("DBエラー");
        res.json(rows);
      }
    );
  } else {
    // 役員・管理者は全て
    db.all(
      `SELECT 
        ct.store_id,
        s.name as agency_name,
        strftime('%Y', ct.transaction_date) as year,
        strftime('%m', ct.transaction_date) as month,
        SUM(ct.amount) as amount,
        COUNT(*) as transaction_count
      FROM customer_transactions ct
      LEFT JOIN stores s ON ct.store_id = s.id 
      GROUP BY ct.store_id, s.name, strftime('%Y', ct.transaction_date), strftime('%m', ct.transaction_date)
      ORDER BY year DESC, month DESC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).send("DBエラー");
        res.json(rows);
      }
    );
  }
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

        // 個別取引データを取得して月次集計
        db.all(
          `SELECT 
            strftime('%Y', transaction_date) as year,
            strftime('%m', transaction_date) as month,
            SUM(amount) as monthly_total,
            COUNT(*) as transaction_count
          FROM customer_transactions 
          WHERE store_id = ? 
          GROUP BY strftime('%Y', transaction_date), strftime('%m', transaction_date)
          ORDER BY year DESC, month DESC`,
          [req.session.user.store_id],
          (err, monthlySales) => {
            if (err) return res.status(500).send("DBエラー");

            // 月間売上推移データを作成
            const chartData = monthlySales.reverse().map((s) => ({
              period: `${s.year}年${parseInt(s.month)}月`,
              amount: s.monthly_total,
              transactions: s.transaction_count,
            }));

            // 売上データを従来形式に変換（テンプレート互換性のため）
            const salesFormatted = monthlySales.reverse().map((s) => ({
              year: parseInt(s.year),
              month: parseInt(s.month),
              amount: s.monthly_total,
              transaction_count: s.transaction_count,
            }));

            res.render("sales_list", {
              sales: salesFormatted,
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
    // 管理者・役員は代理店選択画面を表示（個別取引ベース）
    db.all(
      `SELECT 
          s.id, 
          s.name,
          COALESCE(COUNT(ct.id), 0) as transaction_count,
          COALESCE(SUM(ct.amount), 0) as total_sales
        FROM stores s 
        LEFT JOIN customer_transactions ct ON s.id = ct.store_id 
        GROUP BY s.id, s.name 
        ORDER BY s.name`,
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

    // 個別取引データを取得して月次集計
    db.all(
      `SELECT 
        strftime('%Y', transaction_date) as year,
        strftime('%m', transaction_date) as month,
        SUM(amount) as monthly_total,
        COUNT(*) as transaction_count
      FROM customer_transactions 
      WHERE store_id = ? 
      GROUP BY strftime('%Y', transaction_date), strftime('%m', transaction_date)
      ORDER BY year DESC, month DESC`,
      [agencyId],
      (err, monthlySales) => {
        if (err) return res.status(500).send("DBエラー");

        // 月間売上推移データを作成
        const chartData = monthlySales.reverse().map((s) => ({
          period: `${s.year}年${parseInt(s.month)}月`,
          amount: s.monthly_total,
          transactions: s.transaction_count,
        }));

        // 売上データを従来形式に変換（テンプレート互換性のため）
        const salesFormatted = monthlySales.reverse().map((s) => ({
          year: parseInt(s.year),
          month: parseInt(s.month),
          amount: s.monthly_total,
          transaction_count: s.transaction_count,
        }));

        res.render("sales_list", {
          sales: salesFormatted,
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

// 売上履歴一覧表示
router.get("/history", requireRole(["admin", "agency"]), (req, res) => {
  const isAdmin = req.session.user.role === "admin";
  const { store_id, start_date, end_date, customer_search } = req.query;

  console.log("売上履歴取得リクエスト:", { store_id, start_date, end_date, customer_search, isAdmin });

  // 基本クエリ
  let baseQuery = `
    SELECT 
      ct.id,
      ct.transaction_date,
      ct.amount,
      ct.description,
      ct.payment_method,
      ct.created_at,
      c.name as customer_name,
      c.customer_code,
      s.name as store_name,
      ct.store_id,
      ct.customer_id
    FROM customer_transactions ct
    LEFT JOIN customers c ON ct.customer_id = c.id
    LEFT JOIN stores s ON ct.store_id = s.id
  `;

  let whereConditions = [];
  let params = [];

  // 権限に基づく店舗フィルタ
  if (!isAdmin) {
    // 店舗ユーザーは自店舗のみ
    whereConditions.push("ct.store_id = ?");
    params.push(req.session.user.store_id);
  } else if (store_id && store_id !== "all") {
    // 管理者が特定店舗を選択
    whereConditions.push("ct.store_id = ?");
    params.push(parseInt(store_id));
  }

  // 日付フィルタ
  if (start_date) {
    whereConditions.push("ct.transaction_date >= ?");
    params.push(start_date);
  }
  if (end_date) {
    whereConditions.push("ct.transaction_date <= ?");
    params.push(end_date);
  }

  // 顧客検索
  if (customer_search && customer_search.trim()) {
    whereConditions.push("(c.name LIKE ? OR c.customer_code LIKE ?)");
    params.push(`%${customer_search.trim()}%`, `%${customer_search.trim()}%`);
  }

  // WHERE句を追加
  if (whereConditions.length > 0) {
    baseQuery += " WHERE " + whereConditions.join(" AND ");
  }

  // 並び順
  baseQuery += " ORDER BY ct.transaction_date DESC, ct.created_at DESC";

  // ページネーション（将来的に実装）
  const limit = 100; // とりあえず100件まで
  baseQuery += ` LIMIT ${limit}`;

  console.log("実行クエリ:", baseQuery);
  console.log("パラメータ:", params);

  // データ取得
  db.all(baseQuery, params, (err, transactions) => {
    if (err) {
      console.error("売上履歴取得エラー:", err);
      return res.status(500).render("error", {
        message: "売上履歴の取得に失敗しました",
        session: req.session,
      });
    }

    console.log("取得した取引件数:", transactions.length);

    // 統計情報を計算
    const totalAmount = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const transactionCount = transactions.length;
    const averageAmount = transactionCount > 0 ? Math.round(totalAmount / transactionCount) : 0;

    // 店舗一覧を取得（管理者用）
    if (isAdmin) {
      db.all("SELECT id, name FROM stores ORDER BY name", [], (err, stores) => {
        if (err) {
          console.error("店舗一覧取得エラー:", err);
          stores = [];
        }

        res.render("sales_history", {
          transactions,
          stores,
          summary: {
            total_amount: totalAmount,
            transaction_count: transactionCount,
            average_amount: averageAmount,
          },
          filters: {
            store_id: store_id || "all",
            start_date: start_date || "",
            end_date: end_date || "",
            customer_search: customer_search || "",
          },
          session: req.session,
          title: "売上履歴",
          isAdmin,
        });
      });
    } else {
      // 店舗ユーザーの場合
      res.render("sales_history", {
        transactions,
        stores: [],
        summary: {
          total_amount: totalAmount,
          transaction_count: transactionCount,
          average_amount: averageAmount,
        },
        filters: {
          store_id: req.session.user.store_id,
          start_date: start_date || "",
          end_date: end_date || "",
          customer_search: customer_search || "",
        },
        session: req.session,
        title: "売上履歴",
        isAdmin: false,
      });
    }
  });
});

// 売上履歴API（JSON形式）
router.get("/history/api", requireRole(["admin", "agency"]), (req, res) => {
  const isAdmin = req.session.user.role === "admin";
  const { store_id, start_date, end_date, customer_search, page = 1, limit = 50 } = req.query;

  // 基本クエリ
  let baseQuery = `
    SELECT 
      ct.id,
      ct.transaction_date,
      ct.amount,
      ct.description,
      ct.payment_method,
      ct.created_at,
      c.name as customer_name,
      c.customer_code,
      s.name as store_name,
      ct.store_id,
      ct.customer_id
    FROM customer_transactions ct
    LEFT JOIN customers c ON ct.customer_id = c.id
    LEFT JOIN stores s ON ct.store_id = s.id
  `;

  let whereConditions = [];
  let params = [];

  // 権限チェック
  if (!isAdmin) {
    whereConditions.push("ct.store_id = ?");
    params.push(req.session.user.store_id);
  } else if (store_id && store_id !== "all") {
    whereConditions.push("ct.store_id = ?");
    params.push(parseInt(store_id));
  }

  // フィルタ条件
  if (start_date) {
    whereConditions.push("ct.transaction_date >= ?");
    params.push(start_date);
  }
  if (end_date) {
    whereConditions.push("ct.transaction_date <= ?");
    params.push(end_date);
  }
  if (customer_search && customer_search.trim()) {
    whereConditions.push("(c.name LIKE ? OR c.customer_code LIKE ?)");
    params.push(`%${customer_search.trim()}%`, `%${customer_search.trim()}%`);
  }

  if (whereConditions.length > 0) {
    baseQuery += " WHERE " + whereConditions.join(" AND ");
  }

  // 件数取得用クエリ
  const countQuery = baseQuery.replace(
    /SELECT[\s\S]*?FROM/,
    "SELECT COUNT(*) as total FROM"
  );

  // 件数を取得
  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      console.error("件数取得エラー:", err);
      return res.status(500).json({ error: "データ取得に失敗しました" });
    }

    const total = countResult.total || 0;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // データ取得
    baseQuery += " ORDER BY ct.transaction_date DESC, ct.created_at DESC";
    baseQuery += ` LIMIT ${limitNum} OFFSET ${offset}`;

    db.all(baseQuery, params, (err, transactions) => {
      if (err) {
        console.error("取引データ取得エラー:", err);
        return res.status(500).json({ error: "取引データの取得に失敗しました" });
      }

      res.json({
        transactions,
        pagination: {
          current_page: pageNum,
          total_pages: Math.ceil(total / limitNum),
          total_count: total,
          limit: limitNum,
        },
      });
    });
  });
});

module.exports = router;
