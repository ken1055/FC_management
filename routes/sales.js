const express = require("express");
const router = express.Router();

// Supabase接続（Vercel + Supabase専用）
const { getSupabaseClient } = require("../config/supabase");
const db = getSupabaseClient();

console.log(
  "sales.js: Vercel + Supabase環境で初期化完了 - v3.0 - db.all完全削除"
);

// Supabase用のヘルパー関数

// 管理者統合ビューデータ取得
async function handleAdminOverviewData(req, res) {
  try {
    // 全店舗の月次売上データを取得
    const monthlySales = await getMonthlySalesData();

    console.log("管理者統合ビュー - 月次売上データ:", monthlySales);

    // データがない場合の処理
    const validMonthlySales = monthlySales.filter(
      (s) => s.year && s.month && s.monthly_total !== null
    );

    // 店舗数を計算（全取引から一意の店舗IDを取得）
    const { data: storeCountData, error: storeCountError } = await db
      .from("customer_transactions")
      .select("store_id")
      .not("store_id", "is", null);

    const uniqueStores = storeCountData
      ? [...new Set(storeCountData.map((t) => t.store_id))]
      : [];
    const totalStoreCount = uniqueStores.length;

    // チャート用データ（時系列順）
    const chartData = validMonthlySales
      .slice()
      .reverse()
      .map((s) => ({
        period: `${s.year}年${parseInt(s.month)}月`,
        amount: s.monthly_total || 0,
        transactions: s.transaction_count || 0,
        stores: totalStoreCount,
      }));

    // テーブル表示用データ（新しい順）
    const salesFormatted = validMonthlySales.map((s) => ({
      year: parseInt(s.year) || 0,
      month: parseInt(s.month) || 0,
      amount: s.monthly_total || 0,
      transaction_count: s.transaction_count || 0,
      store_count: totalStoreCount,
      agency_name: `全店舗統合 (${totalStoreCount}店舗)`,
    }));

    // 店舗一覧も取得（詳細表示用）
    const { data: stores, error: storesError } = await db
      .from("stores")
      .select("id, name");

    if (storesError) {
      console.error("店舗一覧取得エラー:", storesError);
    }

    res.render("sales_list", {
      sales: salesFormatted,
      chartData: JSON.stringify(chartData),
      agencyName: "全店舗統合ビュー",
      stores: stores || [],
      groups: [],
      selectedGroupId: null,
      session: req.session,
      success: req.query.success,
      title: "売上管理 - 全店舗統合",
      isAdmin: true,
      showOverview: true,
    });
  } catch (error) {
    console.error("管理者統合ビューエラー:", error);
    res.status(500).send("データ取得エラー");
  }
}

// 代理店リスト画面データ取得
async function handleAgencyListData(req, res) {
  try {
    const storeId = req.session.user.store_id;

    // 代理店情報を取得
    const { data: stores, error: storeError } = await db
      .from("stores")
      .select("name")
      .eq("id", storeId)
      .limit(1);

    if (storeError || !stores || stores.length === 0) {
      console.error("代理店情報取得エラー:", storeError);
      return res.status(500).send("DBエラー");
    }

    const agency = stores[0];

    // 月次売上データを取得
    const monthlySales = await getMonthlySalesData(storeId);

    console.log("代理店月次売上データ:", monthlySales);

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
      agency_name: agency ? agency.name : "未設定",
    }));

    console.log("店舗ユーザー - チャートデータ:", chartData);
    console.log("店舗ユーザー - 売上データ:", salesFormatted);

    res.render("sales_list", {
      sales: salesFormatted,
      chartData: JSON.stringify(chartData),
      agencyName: agency ? agency.name : "未設定",
      agencyId: storeId,
      groups: [],
      selectedGroupId: null,
      session: req.session,
      success: req.query.success,
      title: "売上管理",
      isAdmin: false,
    });
  } catch (error) {
    console.error("代理店リストデータエラー:", error);
    res.status(500).send("システムエラー");
  }
}

// 代理店選択画面データ取得
async function handleAgencySelectionData(req, res) {
  try {
    // 店舗一覧を取得
    const { data: stores, error: storesError } = await db
      .from("stores")
      .select("id, name")
      .order("name");

    if (storesError) {
      console.error("店舗一覧取得エラー:", storesError);
      return res.status(500).send("DBエラー");
    }

    // 各店舗の取引統計を取得
    const { data: transactionStats, error: statsError } = await db
      .from("customer_transactions")
      .select("store_id, amount");

    if (statsError) {
      console.error("取引統計取得エラー:", statsError);
    }

    // 店舗ごとの統計を計算
    const storeStats = {};
    if (transactionStats) {
      transactionStats.forEach((transaction) => {
        const storeId = transaction.store_id;
        if (!storeStats[storeId]) {
          storeStats[storeId] = {
            transaction_count: 0,
            total_sales: 0,
          };
        }
        storeStats[storeId].transaction_count += 1;
        storeStats[storeId].total_sales += transaction.amount || 0;
      });
    }

    // 店舗データに統計を追加
    const enrichedStores = stores.map((store) => ({
      ...store,
      transaction_count: storeStats[store.id]?.transaction_count || 0,
      sales_count: storeStats[store.id]?.transaction_count || 0, // EJSテンプレート用
      total_sales: storeStats[store.id]?.total_sales || 0,
    }));

    console.log("=== 代理店選択画面デバッグ ===");
    console.log("店舗数:", stores?.length || 0);
    console.log("取引統計数:", transactionStats?.length || 0);
    console.log("店舗統計:", storeStats);
    console.log("最初の店舗データサンプル:", enrichedStores[0]);

    res.render("sales_agency_list", {
      stores: enrichedStores,
      session: req.session,
      title: "売上管理 - 代理店選択",
    });
  } catch (error) {
    console.error("代理店選択画面エラー:", error);
    res.status(500).send("システムエラー");
  }
}

async function getMonthlySalesData(storeId = null) {
  try {
    console.log("getMonthlySalesData呼び出し - storeId:", storeId, "型:", typeof storeId);
    
    let query = db
      .from("customer_transactions")
      .select("transaction_date, amount, store_id")
      .not("transaction_date", "is", null);

    if (storeId) {
      const numericStoreId = parseInt(storeId);
      console.log("数値変換後のstoreId:", numericStoreId);
      query = query.eq("store_id", numericStoreId);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    console.log("getMonthlySalesData - 取得したデータ件数:", data?.length || 0);
    if (data && data.length > 0) {
      console.log("最初の取引データサンプル:", data[0]);
    }

    // JavaScript側で集計処理
    const monthlyData = {};
    data.forEach((transaction) => {
      const date = new Date(transaction.transaction_date);
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString();
      const key = `${year}-${month}`;

      if (!monthlyData[key]) {
        monthlyData[key] = {
          year,
          month,
          monthly_total: 0,
          transaction_count: 0,
        };
      }

      monthlyData[key].monthly_total += transaction.amount || 0;
      monthlyData[key].transaction_count += 1;
    });

    // 配列に変換して並び替え
    return Object.values(monthlyData).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  } catch (error) {
    console.error("月次売上データ取得エラー:", error);
    return [];
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// 売上統計取得（API）- 個別取引ベース
router.get("/", async (req, res) => {
  try {
    if (req.session.user.role === "agency") {
      // 代理店は自分のデータのみ
      if (!req.session.user.store_id) {
        return res.status(400).send("代理店IDが設定されていません");
      }

      const monthlySales = await getMonthlySalesData(req.session.user.store_id);
      const formattedData = monthlySales.map((sale) => ({
        year: sale.year,
        month: sale.month,
        amount: sale.monthly_total,
        transaction_count: sale.transaction_count,
      }));

      res.json(formattedData);
    } else {
      // 役員・管理者は全店舗のデータ（分離クエリ方式）
      const { data: transactions, error } = await db
        .from("customer_transactions")
        .select("transaction_date, amount, store_id")
        .not("transaction_date", "is", null);

      if (error) {
        console.error("全店舗データ取得エラー:", error);
        return res.status(500).send("DBエラー");
      }

      console.log("=== 管理者売上統計デバッグ ===");
      console.log("取得した取引数:", transactions?.length || 0);

      // 店舗情報を別途取得
      const { data: stores, error: storesError } = await db
        .from("stores")
        .select("id, name");

      if (storesError) {
        console.error("店舗情報取得エラー:", storesError);
      }

      // 店舗IDから店舗名へのマッピングを作成
      const storeMap = {};
      if (stores) {
        stores.forEach((store) => {
          storeMap[store.id] = store.name;
        });
      }

      console.log("取得した店舗数:", stores?.length || 0);
      console.log("店舗マッピング:", storeMap);

      // JavaScript側で集計処理
      const storeMonthlyData = {};
      transactions.forEach((transaction) => {
        const date = new Date(transaction.transaction_date);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString();
        const storeId = transaction.store_id;
        const storeName = storeMap[storeId] || `id:${storeId}`;
        const key = `${storeId}-${year}-${month}`;

        if (!storeMonthlyData[key]) {
          storeMonthlyData[key] = {
            store_id: storeId,
            agency_name: storeName,
            year,
            month,
            amount: 0,
            transaction_count: 0,
          };
        }

        storeMonthlyData[key].amount += transaction.amount || 0;
        storeMonthlyData[key].transaction_count += 1;
      });

      const formattedData = Object.values(storeMonthlyData).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        if (a.month !== b.month) return b.month - a.month;
        return a.store_id - b.store_id;
      });

      res.json(formattedData);
    }
  } catch (error) {
    console.error("売上統計取得エラー:", error);
    res.status(500).send("DBエラー");
  }
});

// 個別取引登録（API）- 新機能
router.post(
  "/transaction",
  requireRole(["admin", "agency"]),
  async (req, res) => {
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

    try {
      // 顧客が指定店舗に属しているかチェック（Supabase）
      const { data: customers, error: customerError } = await db
        .from("customers")
        .select("id, name")
        .eq("id", processedCustomerId)
        .eq("store_id", processedStoreId)
        .limit(1);

      if (customerError) {
        console.error("顧客確認エラー:", customerError);
        return res.status(500).json({ error: "データベースエラー" });
      }

      if (!customers || customers.length === 0) {
        return res.status(400).json({
          error: "指定された顧客が見つからないか、店舗が一致しません",
        });
      }

      const customer = customers[0];

      // 取引を登録（Supabase）
      const { data: transaction, error: insertError } = await db
        .from("customer_transactions")
        .insert({
          store_id: processedStoreId,
          customer_id: processedCustomerId,
          transaction_date,
          amount: processedAmount,
          description: description || "",
          payment_method: payment_method || "現金",
        })
        .select()
        .single();

      if (insertError) {
        console.error("取引登録エラー:", insertError);
        return res.status(500).json({ error: "取引の登録に失敗しました" });
      }

      console.log("取引登録成功:", transaction.id);

      // 成功レスポンス
      res.json({
        success: true,
        transaction_id: transaction.id,
        customer_name: customer.name,
        message: `${customer.name}様の取引を登録しました`,
      });
    } catch (error) {
      console.error("取引登録処理エラー:", error);
      res.status(500).json({ error: "取引登録に失敗しました" });
    }
  }
);

// 売上管理画面（一覧・可視化）
router.get("/list", requireRole(["admin", "agency"]), async (req, res) => {
  console.log("=== /sales/list アクセス開始 ===");
  console.log("ユーザー役割:", req.session.user.role);
  console.log("店舗ID:", req.session.user.store_id);

  try {
    if (req.session.user.role === "agency") {
      // 代理店は自分のデータのみ（Supabase）
      if (!req.session.user.store_id) {
        return res.redirect("/stores/create-profile");
      }

      await handleAgencyListData(req, res);
    } else {
      // 管理者・役員は全店舗統合ビューまたは代理店選択画面を表示
      const showOverview = req.query.overview !== "false"; // デフォルトで統合ビューを表示

      if (showOverview) {
        // 全店舗統合の月次売上データを取得（Supabase）
        await handleAdminOverviewData(req, res);
      } else {
        // 代理店選択画面を表示（Supabase）
        await handleAgencySelectionData(req, res);
      }
    }
  } catch (error) {
    console.error("売上管理画面エラー:", error);
    res.status(500).send("システムエラーが発生しました");
  }
});

// 個別代理店の売上表示
router.get("/agency/:id", requireRole(["admin"]), async (req, res) => {
  const agencyId = req.params.id;

  console.log("=== 個別店舗売上表示デバッグ ===");
  console.log("取得したagencyId:", agencyId);
  console.log("agencyIdの型:", typeof agencyId);

  try {
    // 代理店情報を取得（Supabase）
    const { data: stores, error: storeError } = await db
      .from("stores")
      .select("id, name")
      .eq("id", parseInt(agencyId))
      .limit(1);

    console.log("店舗クエリ結果:", { stores, storeError });

    if (storeError || !stores || stores.length === 0) {
      console.log("店舗が見つからない - agencyId:", agencyId);
      return res.status(404).send("代理店が見つかりません");
    }

    const agency = stores[0];
    console.log("取得した店舗情報:", agency);

    // 月次売上データを取得
    const monthlySales = await getMonthlySalesData(parseInt(agencyId));
    console.log("取得した月次売上データ件数:", monthlySales.length);

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
  } catch (error) {
    console.error("個別代理店売上表示エラー:", error);
    res.status(500).send("システムエラー");
  }
});

// 売上登録フォーム
router.get("/new", requireRole(["admin", "agency"]), async (req, res) => {
  const preselectedAgencyId = req.query.store_id; // クエリパラメータから代理店IDを取得

  try {
    if (req.session.user.role === "agency") {
      if (!req.session.user.store_id) {
        return res.redirect("/stores/create-profile");
      }

      // 代理店情報を取得（Supabase）
      const { data: stores, error: storeError } = await db
        .from("stores")
        .select("name")
        .eq("id", req.session.user.store_id)
        .limit(1);

      if (storeError) {
        console.error("代理店情報取得エラー:", storeError);
        return res.status(500).send("DBエラー");
      }

      const agency = stores && stores.length > 0 ? stores[0] : null;

      res.render("sales_form", {
        session: req.session,
        stores: [],
        agencyName: agency ? agency.name : "未設定",
        sale: null, // sale変数を追加
        title: "売上登録",
      });
    } else {
      // 管理者は代理店一覧を取得（Supabase）
      const { data: stores, error: storesError } = await db
        .from("stores")
        .select("*")
        .order("name");

      if (storesError) {
        console.error("店舗一覧取得エラー:", storesError);
        return res.status(500).send("DBエラー");
      }

      // 事前選択された代理店の情報を取得
      let preselectedAgency = null;
      if (preselectedAgencyId) {
        preselectedAgency = stores.find((a) => a.id == preselectedAgencyId);
      }

      res.render("sales_form", {
        session: req.session,
        stores: stores || [],
        agencyName: null,
        preselectedAgencyId: preselectedAgencyId,
        preselectedAgencyName: preselectedAgency
          ? preselectedAgency.name
          : null,
        sale: null, // sale変数を追加
        title: "売上登録",
      });
    }
  } catch (error) {
    console.error("売上登録フォームエラー:", error);
    res.status(500).send("システムエラー");
  }
});

// 古い売上登録機能は削除済み
// 現在は個別取引登録（/transaction）のみサポート

// 売上履歴一覧表示
router.get("/history", requireRole(["admin", "agency"]), async (req, res) => {
  const isAdmin = req.session.user.role === "admin";
  const { store_id, start_date, end_date, customer_search } = req.query;
  console.log("売上履歴取得リクエスト:", {
    store_id,
    start_date,
    end_date,
    customer_search,
    isAdmin,
  });

  // Supabase環境で分離クエリを使用（Vercel + Supabase専用）
  console.log("Supabase環境: 分離クエリで売上履歴を取得");
  await getTransactionsSupabase();

  async function getTransactionsSupabase() {
    try {
      console.log("=== Supabase履歴取得開始 ===");

      // 取引データを取得（Supabase）
      let query = db
        .from("customer_transactions")
        .select(
          "id, transaction_date, amount, description, payment_method, created_at, store_id, customer_id"
        );

      // 権限に基づく店舗フィルタ
      if (!isAdmin) {
        query = query.eq("store_id", req.session.user.store_id);
      } else if (store_id && store_id !== "all") {
        query = query.eq("store_id", parseInt(store_id));
      }

      // 日付フィルタ
      if (start_date) {
        query = query.gte("transaction_date", start_date);
      }
      if (end_date) {
        query = query.lte("transaction_date", end_date);
      }

      // ソートと制限
      query = query
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      const { data: transactions, error: transactionError } = await query;

      if (transactionError) {
        console.error("Supabase売上履歴取得エラー:", transactionError);
        return res.status(500).render("error", {
          message: "売上履歴の取得に失敗しました",
          session: req.session,
        });
      }

      console.log("Supabase取得取引数:", transactions.length);

      if (!transactions || transactions.length === 0) {
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

      // 顧客情報を取得（Supabase）
      if (customerIds.length > 0) {
        const { data: customers, error: customerError } = await db
          .from("customers")
          .select("id, name, customer_code")
          .in("id", customerIds);

        if (customerError) {
          console.error("顧客情報取得エラー:", customerError);
        } else {
          customers.forEach((customer) => {
            customersMap[customer.id] = customer;
          });
        }
      }

      // 店舗情報を取得（Supabase）
      if (storeIds.length > 0) {
        const { data: stores, error: storeError } = await db
          .from("stores")
          .select("id, name")
          .in("id", storeIds);

        if (storeError) {
          console.error("店舗情報取得エラー:", storeError);
        } else {
          stores.forEach((store) => {
            storesMap[store.id] = store;
          });
        }
      }

      // 取引データに顧客情報と店舗情報を結合
      const enrichedTransactions = transactions.map((transaction) => ({
        ...transaction,
        customer_name:
          customersMap[transaction.customer_id]?.name || "不明な顧客",
        customer_code:
          customersMap[transaction.customer_id]?.customer_code || "",
        store_name: storesMap[transaction.store_id]?.name || "不明な店舗",
      }));

      renderHistoryPage(enrichedTransactions);
    } catch (error) {
      console.error("履歴取得処理エラー:", error);
      res.status(500).render("error", {
        message: "システムエラーが発生しました",
        session: req.session,
      });
    }
  }

  // 売上履歴API（管理者・代理店共通）
  async function getHistoryAPISupabase() {
    try {
      console.log("=== 売上履歴API開始 ===");

      // 取引データを取得（Supabase）
      let query = db.from("customer_transactions").select("*");

      // 権限に基づく店舗フィルタ
      if (!isAdmin) {
        query = query.eq("store_id", req.session.user.store_id);
      } else if (store_id && store_id !== "all") {
        query = query.eq("store_id", parseInt(store_id));
      }

      // 顧客検索フィルタ（JavaScript側で実装）
      if (customer_search) {
        // まず全顧客を取得してフィルタリング
        const { data: allCustomers, error: customerError } = await db
          .from("customers")
          .select("id, name, customer_code");

        if (customerError) {
          console.error("顧客検索エラー:", customerError);
        } else {
          const matchingCustomers = allCustomers.filter(
            (customer) =>
              customer.name.includes(customer_search) ||
              customer.customer_code.includes(customer_search)
          );
          const matchingCustomerIds = matchingCustomers.map((c) => c.id);

          if (matchingCustomerIds.length > 0) {
            query = query.in("customer_id", matchingCustomerIds);
          } else {
            // マッチする顧客がいない場合は空の結果を返す
            return res.json({
              success: true,
              transactions: [],
              pagination: {
                page: 1,
                limit: limitNum,
                total: 0,
                hasMore: false,
              },
            });
          }
        }
      }

      // 日付フィルタ
      if (start_date) {
        query = query.gte("transaction_date", start_date);
      }
      if (end_date) {
        query = query.lte("transaction_date", end_date);
      }

      // ソートと制限
      query = query
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limitNum - 1);

      const { data: transactions, error: transactionError } = await query;

      if (transactionError) {
        console.error("取引データ取得エラー:", transactionError);
        return res
          .status(500)
          .json({ success: false, error: "データ取得エラー" });
      }

      if (!transactions || transactions.length === 0) {
        return res.json({
          success: true,
          transactions: [],
          pagination: { page, limit: limitNum, total: 0, hasMore: false },
        });
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

      // 顧客情報を取得（Supabase）
      if (customerIds.length > 0) {
        const { data: customers, error: customerError } = await db
          .from("customers")
          .select("id, name, customer_code")
          .in("id", customerIds);

        if (!customerError && customers) {
          customers.forEach((customer) => {
            customersMap[customer.id] = customer;
          });
        }
      }

      // 店舗情報を取得（Supabase）
      if (storeIds.length > 0) {
        const { data: stores, error: storeError } = await db
          .from("stores")
          .select("id, name")
          .in("id", storeIds);

        if (!storeError && stores) {
          stores.forEach((store) => {
            storesMap[store.id] = store;
          });
        }
      }

      // 取引データに顧客情報と店舗情報を結合
      const enrichedTransactions = transactions.map((transaction) => ({
        ...transaction,
        customer_name:
          customersMap[transaction.customer_id]?.name || "不明な顧客",
        customer_code:
          customersMap[transaction.customer_id]?.customer_code || "",
        store_name: storesMap[transaction.store_id]?.name || "不明な店舗",
      }));

      res.json({
        success: true,
        transactions: enrichedTransactions,
        pagination: {
          page,
          limit: limitNum,
          total: enrichedTransactions.length,
          hasMore: enrichedTransactions.length === limitNum,
        },
      });
    } catch (error) {
      console.error("売上履歴API処理エラー:", error);
      res.status(500).json({ success: false, error: "システムエラー" });
    }
  }

  // 履歴ページレンダリング関数
  async function renderHistoryPage(enrichedTransactions) {
    try {
      // 統計情報を計算
      const totalAmount = enrichedTransactions.reduce(
        (sum, t) => sum + (t.amount || 0),
        0
      );
      const avgAmount =
        enrichedTransactions.length > 0
          ? totalAmount / enrichedTransactions.length
          : 0;

      let stores = [];

      // 店舗一覧を取得（管理者用）
      if (isAdmin) {
        const { data: storeData, error: storeError } = await db
          .from("stores")
          .select("id, name")
          .order("name");

        if (storeError) {
          console.error("店舗一覧取得エラー:", storeError);
        } else {
          stores = storeData || [];
        }
      }

      res.render("sales_history", {
        transactions: enrichedTransactions,
        session: req.session,
        title: "売上履歴",
        isAdmin,
        stores,
        filters: {
          store_id: isAdmin ? store_id || "all" : req.session.user.store_id,
          start_date,
          end_date,
          customer_search,
        },
        summary: {
          total_transactions: enrichedTransactions.length,
          transaction_count: enrichedTransactions.length,
          total_amount: totalAmount,
          average_amount: Math.round(avgAmount),
        },
      });
    } catch (error) {
      console.error("履歴ページレンダリングエラー:", error);
      res.status(500).render("error", {
        message: "ページ表示エラー",
        session: req.session,
      });
    }
  }
});

// 売上履歴API
router.get(
  "/history/api",
  requireRole(["admin", "agency"]),
  async (req, res) => {
    const isAdmin = req.session.user.role === "admin";
    const {
      store_id,
      start_date,
      end_date,
      customer_search,
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (page - 1) * limit;
    const limitNum = parseInt(limit);

    console.log("売上履歴API パラメータ:", {
      isAdmin,
      store_id,
      start_date,
      end_date,
      customer_search,
      page,
      limit,
      offset,
    });

    // Supabase環境で分離クエリを使用（Vercel + Supabase専用）
    console.log("Supabase環境: 分離クエリで売上履歴APIを取得");
    await getHistoryAPISupabase();
  }
);

module.exports = router;
