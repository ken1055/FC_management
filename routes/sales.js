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
        return res.status(400).json({
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

            // データがない場合の処理
            const validMonthlySales = monthlySales.filter(
              (s) => s.year && s.month && s.monthly_total !== null
            );

            // チャート用データ（時系列順）
            const chartData = validMonthlySales
              .slice()
              .reverse()
              .map((s) => ({
                period: `${s.year}年${parseInt(s.month)}月`,
                amount: s.monthly_total || 0,
                transactions: s.transaction_count || 0,
              }));

            // テーブル表示用データ（新しい順）
            const salesFormatted = validMonthlySales.map((s) => ({
              year: parseInt(s.year) || 0,
              month: parseInt(s.month) || 0,
              amount: s.monthly_total || 0,
              transaction_count: s.transaction_count || 0,
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
    // 管理者・役員は全店舗統合ビューまたは代理店選択画面を表示
    const showOverview = req.query.overview !== 'false'; // デフォルトで統合ビューを表示
    
    if (showOverview) {
      // 全店舗統合の月次売上データを取得
      db.all(
        `SELECT 
          strftime('%Y', transaction_date) as year,
          strftime('%m', transaction_date) as month,
          SUM(amount) as monthly_total,
          COUNT(*) as transaction_count,
          COUNT(DISTINCT store_id) as store_count
        FROM customer_transactions 
        GROUP BY strftime('%Y', transaction_date), strftime('%m', transaction_date)
        ORDER BY year DESC, month DESC`,
        [],
        (err, monthlySales) => {
          if (err) return res.status(500).send("DBエラー");

          console.log("管理者統合ビュー - 月次売上データ:", monthlySales);

          // データがない場合の処理
          const validMonthlySales = monthlySales.filter(
            (s) => s.year && s.month && s.monthly_total !== null
          );

          // チャート用データ（時系列順）
          const chartData = validMonthlySales
            .slice()
            .reverse()
            .map((s) => ({
              period: `${s.year}年${parseInt(s.month)}月`,
              amount: s.monthly_total || 0,
              transactions: s.transaction_count || 0,
              stores: s.store_count || 0,
            }));

          // テーブル表示用データ（新しい順）
          const salesFormatted = validMonthlySales.map((s) => ({
            year: parseInt(s.year) || 0,
            month: parseInt(s.month) || 0,
            amount: s.monthly_total || 0,
            transaction_count: s.transaction_count || 0,
            store_count: s.store_count || 0,
            agency_name: `全店舗統合 (${s.store_count || 0}店舗)`,
          }));

          // 店舗一覧も取得（詳細表示用）
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
              if (err) {
                console.error("店舗一覧取得エラー:", err);
                stores = [];
              }

              res.render("sales_list", {
                sales: salesFormatted,
                chartData: JSON.stringify(chartData),
                agencyName: "全店舗統合ビュー",
                stores: stores,
                groups: [],
                selectedGroupId: null,
                session: req.session,
                success: req.query.success,
                title: "売上管理 - 全店舗統合",
                isAdmin: true,
                showOverview: true,
              });
            }
          );
        }
      );
    } else {
      // 従来の代理店選択画面を表示
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

        // データがない場合の処理
        const validMonthlySales = monthlySales.filter(
          (s) => s.year && s.month && s.monthly_total !== null
        );

        // チャート用データ（時系列順）
        const chartData = validMonthlySales
          .slice()
          .reverse()
          .map((s) => ({
            period: `${s.year}年${parseInt(s.month)}月`,
            amount: s.monthly_total || 0,
            transactions: s.transaction_count || 0,
          }));

        // テーブル表示用データ（新しい順）
        const salesFormatted = validMonthlySales.map((s) => ({
          year: parseInt(s.year) || 0,
          month: parseInt(s.month) || 0,
          amount: s.monthly_total || 0,
          transaction_count: s.transaction_count || 0,
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

// 古い売上登録機能は削除済み
// 現在は個別取引登録（/transaction）のみサポート

// 売上履歴一覧表示
router.get("/history", requireRole(["admin", "agency"]), (req, res) => {
  const isAdmin = req.session.user.role === "admin";
  const { store_id, start_date, end_date, customer_search } = req.query;
  const { isSupabaseConfigured } = require("../config/supabase");
  const useSupabase = isSupabaseConfigured();

  console.log("売上履歴取得リクエスト:", {
    store_id,
    start_date,
    end_date,
    customer_search,
    isAdmin,
    useSupabase,
  });

  if (useSupabase) {
    // Supabase環境では分離クエリを使用
    console.log("Supabase環境: 分離クエリで売上履歴を取得");
    getTransactionsSupabase();
  } else {
    // SQLite環境では従来のJOINクエリを使用
    console.log("SQLite環境: JOINクエリで売上履歴を取得");
    getTransactionsSQLite();
  }

  function getTransactionsSupabase() {
    // まず取引データを取得
    let transactionQuery = `
      SELECT 
        id,
        transaction_date,
        amount,
        description,
        payment_method,
        created_at,
        store_id,
        customer_id
      FROM customer_transactions
    `;

    let whereConditions = [];
    let params = [];

    // 権限に基づく店舗フィルタ
    if (!isAdmin) {
      whereConditions.push("store_id = ?");
      params.push(req.session.user.store_id);
    } else if (store_id && store_id !== "all") {
      whereConditions.push("store_id = ?");
      params.push(parseInt(store_id));
    }

    // 日付フィルタ
    if (start_date) {
      whereConditions.push("transaction_date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      whereConditions.push("transaction_date <= ?");
      params.push(end_date);
    }

    if (whereConditions.length > 0) {
      transactionQuery += " WHERE " + whereConditions.join(" AND ");
    }

    transactionQuery +=
      " ORDER BY transaction_date DESC, created_at DESC LIMIT 100";

    console.log("Supabase取引クエリ:", transactionQuery, params);

    db.all(transactionQuery, params, (err, transactions) => {
      if (err) {
        console.error("Supabase売上履歴取得エラー:", err);
        return res.status(500).render("error", {
          message: "売上履歴の取得に失敗しました",
          session: req.session,
        });
      }

      console.log("Supabase取得取引数:", transactions.length);

      if (transactions.length === 0) {
        return renderHistoryPage([]);
      }

      // 顧客情報と店舗情報を別途取得
      const customerIds = [
        ...new Set(transactions.map((t) => t.customer_id).filter(Boolean)),
      ];
      const storeIds = [
        ...new Set(transactions.map((t) => t.store_id).filter(Boolean)),
      ];

      let customersMap = {};
      let storesMap = {};

      // 顧客情報を取得
      if (customerIds.length > 0) {
        const customerPlaceholders = customerIds.map(() => "?").join(",");
        const customerQuery = `SELECT id, name, customer_code FROM customers WHERE id IN (${customerPlaceholders})`;

        db.all(customerQuery, customerIds, (err, customers) => {
          if (err) {
            console.error("顧客情報取得エラー:", err);
          } else {
            customers.forEach((c) => {
              customersMap[c.id] = c;
            });
          }

          // 店舗情報を取得
          if (storeIds.length > 0) {
            const storePlaceholders = storeIds.map(() => "?").join(",");
            const storeQuery = `SELECT id, name FROM stores WHERE id IN (${storePlaceholders})`;

            db.all(storeQuery, storeIds, (err, stores) => {
              if (err) {
                console.error("店舗情報取得エラー:", err);
              } else {
                stores.forEach((s) => {
                  storesMap[s.id] = s;
                });
              }

              // データをマージして結果を返す
              const enrichedTransactions = transactions.map((t) => ({
                ...t,
                customer_name: customersMap[t.customer_id]?.name || null,
                customer_code:
                  customersMap[t.customer_id]?.customer_code || null,
                store_name: storesMap[t.store_id]?.name || null,
              }));

              // 顧客検索フィルタを適用（Supabase側でできないため）
              let filteredTransactions = enrichedTransactions;
              if (customer_search && customer_search.trim()) {
                const searchTerm = customer_search.trim().toLowerCase();
                filteredTransactions = enrichedTransactions.filter(
                  (t) =>
                    (t.customer_name &&
                      t.customer_name.toLowerCase().includes(searchTerm)) ||
                    (t.customer_code &&
                      t.customer_code.toLowerCase().includes(searchTerm))
                );
              }

              renderHistoryPage(filteredTransactions);
            });
          } else {
            const enrichedTransactions = transactions.map((t) => ({
              ...t,
              customer_name: customersMap[t.customer_id]?.name || null,
              customer_code: customersMap[t.customer_id]?.customer_code || null,
              store_name: null,
            }));

            let filteredTransactions = enrichedTransactions;
            if (customer_search && customer_search.trim()) {
              const searchTerm = customer_search.trim().toLowerCase();
              filteredTransactions = enrichedTransactions.filter(
                (t) =>
                  (t.customer_name &&
                    t.customer_name.toLowerCase().includes(searchTerm)) ||
                  (t.customer_code &&
                    t.customer_code.toLowerCase().includes(searchTerm))
              );
            }

            renderHistoryPage(filteredTransactions);
          }
        });
      } else {
        // 顧客情報がない場合、店舗情報のみ取得
        if (storeIds.length > 0) {
          const storePlaceholders = storeIds.map(() => "?").join(",");
          const storeQuery = `SELECT id, name FROM stores WHERE id IN (${storePlaceholders})`;

          db.all(storeQuery, storeIds, (err, stores) => {
            if (err) {
              console.error("店舗情報取得エラー:", err);
            } else {
              stores.forEach((s) => {
                storesMap[s.id] = s;
              });
            }

            const enrichedTransactions = transactions.map((t) => ({
              ...t,
              customer_name: null,
              customer_code: null,
              store_name: storesMap[t.store_id]?.name || null,
            }));

            renderHistoryPage(enrichedTransactions);
          });
        } else {
          const enrichedTransactions = transactions.map((t) => ({
            ...t,
            customer_name: null,
            customer_code: null,
            store_name: null,
          }));

          renderHistoryPage(enrichedTransactions);
        }
      }
    });
  }

  function getTransactionsSQLite() {
    // SQLite環境では従来のJOINクエリを使用
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
      whereConditions.push("ct.store_id = ?");
      params.push(req.session.user.store_id);
    } else if (store_id && store_id !== "all") {
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

    if (whereConditions.length > 0) {
      baseQuery += " WHERE " + whereConditions.join(" AND ");
    }

    baseQuery +=
      " ORDER BY ct.transaction_date DESC, ct.created_at DESC LIMIT 100";

    console.log("SQLite実行クエリ:", baseQuery, params);

    db.all(baseQuery, params, (err, transactions) => {
      if (err) {
        console.error("SQLite売上履歴取得エラー:", err);
        return res.status(500).render("error", {
          message: "売上履歴の取得に失敗しました",
          session: req.session,
        });
      }

      console.log("SQLite取得した取引件数:", transactions.length);
      renderHistoryPage(transactions);
    });
  }

  function renderHistoryPage(transactions) {
    // 統計情報を計算
    const totalAmount = transactions.reduce(
      (sum, t) => sum + (t.amount || 0),
      0
    );
    const transactionCount = transactions.length;
    const averageAmount =
      transactionCount > 0 ? Math.round(totalAmount / transactionCount) : 0;

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
  }
});

// 売上履歴API（JSON形式） - Supabase対応版
router.get("/history/api", requireRole(["admin", "agency"]), (req, res) => {
  const isAdmin = req.session.user.role === "admin";
  const {
    store_id,
    start_date,
    end_date,
    customer_search,
    page = 1,
    limit = 50,
  } = req.query;
  const { isSupabaseConfigured } = require("../config/supabase");
  const useSupabase = isSupabaseConfigured();

  console.log("売上履歴API呼び出し:", { useSupabase, isAdmin, store_id });

  if (useSupabase) {
    // Supabase環境では分離クエリを使用
    getHistoryAPISupabase();
  } else {
    // SQLite環境では従来のJOINクエリを使用
    getHistoryAPISQLite();
  }

  function getHistoryAPISupabase() {
    // まず取引データを取得
    let transactionQuery = `
      SELECT 
        id,
        transaction_date,
        amount,
        description,
        payment_method,
        created_at,
        store_id,
        customer_id
      FROM customer_transactions
    `;

    let whereConditions = [];
    let params = [];

    // 権限チェック
    if (!isAdmin) {
      whereConditions.push("store_id = ?");
      params.push(req.session.user.store_id);
    } else if (store_id && store_id !== "all") {
      whereConditions.push("store_id = ?");
      params.push(parseInt(store_id));
    }

    // フィルタ条件
    if (start_date) {
      whereConditions.push("transaction_date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      whereConditions.push("transaction_date <= ?");
      params.push(end_date);
    }

    if (whereConditions.length > 0) {
      transactionQuery += " WHERE " + whereConditions.join(" AND ");
    }

    // 件数取得用クエリ
    const countQuery = transactionQuery.replace(
      /SELECT[\s\S]*?FROM/,
      "SELECT COUNT(*) as total FROM"
    );

    // 件数を取得
    db.get(countQuery, params, (err, countResult) => {
      if (err) {
        console.error("Supabase件数取得エラー:", err);
        return res.status(500).json({ error: "データ取得に失敗しました" });
      }

      const total = countResult?.total || 0;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      // データ取得クエリにページネーションを追加
      transactionQuery += ` ORDER BY transaction_date DESC, created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;

      db.all(transactionQuery, params, (err, transactions) => {
        if (err) {
          console.error("Supabase取引データ取得エラー:", err);
          return res
            .status(500)
            .json({ error: "取引データの取得に失敗しました" });
        }

        if (transactions.length === 0) {
          return res.json({
            transactions: [],
            pagination: {
              current_page: pageNum,
              total_pages: Math.ceil(total / limitNum),
              total_count: total,
              limit: limitNum,
            },
          });
        }

        // 顧客情報と店舗情報を別途取得してマージ
        const customerIds = [
          ...new Set(transactions.map((t) => t.customer_id).filter(Boolean)),
        ];
        const storeIds = [
          ...new Set(transactions.map((t) => t.store_id).filter(Boolean)),
        ];

        Promise.all([
          // 顧客情報取得
          customerIds.length > 0
            ? new Promise((resolve) => {
                const customerPlaceholders = customerIds
                  .map(() => "?")
                  .join(",");
                const customerQuery = `SELECT id, name, customer_code FROM customers WHERE id IN (${customerPlaceholders})`;
                db.all(customerQuery, customerIds, (err, customers) => {
                  const customersMap = {};
                  if (!err && customers) {
                    customers.forEach((c) => {
                      customersMap[c.id] = c;
                    });
                  }
                  resolve(customersMap);
                });
              })
            : Promise.resolve({}),

          // 店舗情報取得
          storeIds.length > 0
            ? new Promise((resolve) => {
                const storePlaceholders = storeIds.map(() => "?").join(",");
                const storeQuery = `SELECT id, name FROM stores WHERE id IN (${storePlaceholders})`;
                db.all(storeQuery, storeIds, (err, stores) => {
                  const storesMap = {};
                  if (!err && stores) {
                    stores.forEach((s) => {
                      storesMap[s.id] = s;
                    });
                  }
                  resolve(storesMap);
                });
              })
            : Promise.resolve({}),
        ]).then(([customersMap, storesMap]) => {
          // データをマージして結果を返す
          let enrichedTransactions = transactions.map((t) => ({
            ...t,
            customer_name: customersMap[t.customer_id]?.name || null,
            customer_code: customersMap[t.customer_id]?.customer_code || null,
            store_name: storesMap[t.store_id]?.name || null,
          }));

          // 顧客検索フィルタを適用（Supabase側でできないため）
          if (customer_search && customer_search.trim()) {
            const searchTerm = customer_search.trim().toLowerCase();
            enrichedTransactions = enrichedTransactions.filter(
              (t) =>
                (t.customer_name &&
                  t.customer_name.toLowerCase().includes(searchTerm)) ||
                (t.customer_code &&
                  t.customer_code.toLowerCase().includes(searchTerm))
            );
          }

          res.json({
            transactions: enrichedTransactions,
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
  }

  function getHistoryAPISQLite() {
    // SQLite環境では従来のJOINクエリを使用
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
        console.error("SQLite件数取得エラー:", err);
        return res.status(500).json({ error: "データ取得に失敗しました" });
      }

      const total = countResult?.total || 0;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      // データ取得
      baseQuery += " ORDER BY ct.transaction_date DESC, ct.created_at DESC";
      baseQuery += ` LIMIT ${limitNum} OFFSET ${offset}`;

      db.all(baseQuery, params, (err, transactions) => {
        if (err) {
          console.error("SQLite取引データ取得エラー:", err);
          return res
            .status(500)
            .json({ error: "取引データの取得に失敗しました" });
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
  }
});

module.exports = router;
