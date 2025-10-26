const express = require("express");
const router = express.Router();
const { getSupabaseClient } = require("../config/supabase");
const db = getSupabaseClient(); // Supabaseクライアントを使用

// Vercel環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const supabase = db; // dbと同じSupabaseクライアントを参照

// 認証チェック関数
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/auth/login");
  }
  next();
}

// 管理者権限チェック関数
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== "admin") {
    return res.status(403).render("error", {
      message: "管理者権限が必要です",
      session: req.session,
    });
  }
  next();
}

// 顧客一覧表示（管理者・店舗共通）
router.get("/list", requireAuth, async (req, res) => {
  const isAdmin = req.session.user.role === "admin";

  // 店舗ユーザーの場合は専用ページにリダイレクト
  if (!isAdmin) {
    return res.redirect("/customers/store");
  }

  try {
    const selectedStoreId = req.query.store_id;
    const searchTerm = req.query.search || "";

    // 店舗一覧取得（管理者の場合）
    let stores = [];
    if (isAdmin) {
      const { data: storesData, error: storesError } = await db
        .from("stores")
        .select("id, name")
        .order("name", { ascending: true });

      if (storesError) {
        console.error("店舗一覧取得エラー:", storesError);
        return res.status(500).render("error", {
          message: "店舗一覧の取得に失敗しました",
          session: req.session,
        });
      }
      stores = storesData || [];
    }

    // 顧客一覧取得（Supabase対応）
    let customersQuery = db
      .from("customers")
      .select("*, stores(name)")
      .order("created_at", { ascending: false });

    // 店舗フィルター
    if (selectedStoreId && selectedStoreId !== "all") {
      customersQuery = customersQuery.eq("store_id", selectedStoreId);
    }

    // 検索フィルター
    if (searchTerm) {
      customersQuery = customersQuery.or(
        `name.ilike.%${searchTerm}%,customer_code.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
      );
    }

    const { data: customersData, error: customersError } = await customersQuery;

    if (customersError) {
      console.error("顧客一覧取得エラー:", customersError);
      let errorMessage = "顧客一覧の取得に失敗しました";
      if (process.env.NODE_ENV !== "production") {
        errorMessage += ` [詳細: ${customersError.message}]`;
      }

      return res.status(500).render("error", {
        message: errorMessage,
        session: req.session,
      });
    }

    // データ整形（store_nameを追加）
    const customers = (customersData || []).map((customer) => ({
      ...customer,
      store_name: customer.stores?.name || null,
    }));

    res.render("customers_list", {
      customers: customers,
      stores: stores,
      selectedStoreId: selectedStoreId || "all",
      searchTerm: searchTerm,
      session: req.session,
      title: "顧客一覧",
      isAdmin: isAdmin,
      isSupabase: true,
    });
  } catch (error) {
    console.error("顧客一覧取得エラー:", error);
    return res.status(500).render("error", {
      message: `エラー: ${error.message}`,
      session: req.session,
    });
  }
});

// 店舗専用顧客一覧表示
router.get("/store", requireAuth, async (req, res) => {
  const isAdmin = req.session.user.role === "admin";

  // 管理者の場合は管理者用ページにリダイレクト
  if (isAdmin) {
    return res.redirect("/customers/list");
  }

  try {
    const searchTerm = req.query.search || "";
    const storeId = req.session.user.store_id;

    console.log("Supabase環境で店舗専用顧客一覧取得");
    console.log("Store ID:", storeId, "Search Term:", searchTerm);

    let query = db
      .from("customers")
      .select("*, stores!inner(name)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    // 検索条件を追加
    if (searchTerm) {
      query = query.or(
        `name.ilike.%${searchTerm}%,customer_code.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
      );
    }

    const { data: customers, error } = await query;

    if (error) {
      console.error("Supabase顧客一覧取得エラー:", error);
      return res.status(500).render("error", {
        message: "顧客一覧の取得に失敗しました",
        session: req.session,
      });
    }

    // データを整形（store_nameを追加）
    const formattedCustomers = customers.map((customer) => ({
      ...customer,
      store_name: customer.stores?.name || null,
    }));

    console.log("取得した顧客数:", formattedCustomers.length);

    res.render("customers_store_list", {
      customers: formattedCustomers || [],
      searchTerm: searchTerm,
      session: req.session,
      title: "顧客一覧",
      isSupabase: true,
    });
  } catch (error) {
    console.error("店舗専用顧客一覧エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
});

// 顧客詳細表示
router.get("/detail/:id", requireAuth, async (req, res) => {
  const customerId = req.params.id;
  const isAdmin = req.session.user.role === "admin";

  try {
    let customer;

    if (isVercel && supabase) {
      // Vercel + Supabase環境
      console.log("Supabase環境で顧客詳細取得");

      let query = supabase
        .from("customers")
        .select(
          `
          *,
          stores!inner(name)
        `
        )
        .eq("id", customerId);

      // 管理者以外は自分の店舗のみ
      if (!isAdmin) {
        query = query.eq("store_id", req.session.user.store_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Supabase顧客詳細取得エラー:", error);
        return res.status(500).render("error", {
          message: "顧客詳細の取得に失敗しました",
          session: req.session,
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).render("error", {
          message: "顧客が見つかりません",
          session: req.session,
        });
      }

      // データを整形（最初の結果を使用）
      customer = {
        ...data[0],
        store_name: data[0].stores?.name || null,
      };
    }

    res.render("customers_detail", {
      customer: customer,
      session: req.session,
      title: "顧客詳細",
      isAdmin: isAdmin,
    });
  } catch (error) {
    console.error("顧客詳細表示エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
});

// 店舗専用顧客新規登録フォーム表示
router.get("/store/new", requireAuth, (req, res) => {
  const isAdmin = req.session.user.role === "admin";

  // 管理者の場合は管理者用ページにリダイレクト
  if (isAdmin) {
    return res.redirect("/customers/new");
  }

  res.render("customers_store_form", {
    customer: null,
    session: req.session,
    title: "顧客登録",
  });
});

// 顧客登録フォーム表示
router.get("/new", requireAuth, async (req, res) => {
  const isAdmin = req.session.user.role === "admin";

  try {
    let stores = [];

    if (isAdmin) {
      console.log("店舗一覧取得");
      const { data, error } = await db
        .from("stores")
        .select("id, name")
        .order("name");

      if (error) {
        console.error("店舗一覧取得エラー:", error);
        return res.status(500).render("error", {
          message: "店舗一覧の取得に失敗しました",
          session: req.session,
        });
      }

      stores = data || [];
    }

    res.render("customers_form", {
      customer: null,
      stores: stores,
      session: req.session,
      title: "顧客登録",
      isAdmin: isAdmin,
      isSupabase: true,
    });
  } catch (error) {
    console.error("顧客登録フォーム表示エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
});

// 顧客編集フォーム表示
router.get("/edit/:id", requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    const isAdmin = req.session.user.role === "admin";

    let customerQuery = db.from("customers").select("*").eq("id", customerId);

    if (!isAdmin) {
      customerQuery = customerQuery.eq("store_id", req.session.user.store_id);
    }

    const { data: customer, error: customerError } =
      await customerQuery.single();

    if (customerError || !customer) {
      console.error("顧客取得エラー:", customerError);
      return res.status(404).render("error", {
        message: "顧客が見つかりません",
        session: req.session,
      });
    }

    let stores = [];
    if (isAdmin) {
      // 管理者の場合は店舗一覧も取得
      const { data: storesData, error: storesError } = await db
        .from("stores")
        .select("id, name")
        .order("name");

      if (storesError) {
        console.error("店舗一覧取得エラー:", storesError);
        return res.status(500).render("error", {
          message: "店舗一覧の取得に失敗しました",
          session: req.session,
        });
      }

      stores = storesData || [];
    }

    res.render("customers_form", {
      customer: customer,
      stores: stores,
      session: req.session,
      title: "顧客編集",
      isAdmin: isAdmin,
      isSupabase: true,
    });
  } catch (error) {
    console.error("顧客編集フォーム表示エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
});

// 顧客登録処理
router.post("/create", requireAuth, async (req, res) => {
  try {
    console.log("=== 顧客登録処理開始 ===");
    console.log("リクエストボディ:", req.body);
    console.log("セッションユーザー:", req.session.user);
    console.log("Supabase設定:", true);

    const {
      customer_code,
      name,
      kana,
      email,
      phone,
      address,
      birth_date,
      gender,
      store_id,
      notes,
      visit_count,
      total_purchase_amount,
      last_visit_date,
    } = req.body;

    const isAdmin = req.session.user.role === "admin";
    const finalStoreId = isAdmin ? store_id : req.session.user.store_id;

    console.log("isAdmin:", isAdmin);
    console.log("finalStoreId:", finalStoreId);

    // 必須フィールドの検証
    if (!name || !finalStoreId) {
      return res.status(400).render("error", {
        message: "顧客名と店舗IDは必須です",
        session: req.session,
      });
    }

    // 顧客コードの重複チェック
    if (customer_code) {
      const { data: existing, error: checkError } = await db
        .from("customers")
        .select("id")
        .eq("customer_code", customer_code)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        // PGRST116は「見つからない」エラーなので無視
        console.error("顧客コード重複チェックエラー:", checkError);
        return res.status(500).render("error", {
          message: "顧客コードの重複チェックに失敗しました",
          session: req.session,
        });
      }

      if (existing) {
        return res.status(400).render("error", {
          message: "この顧客コードは既に使用されています",
          session: req.session,
        });
      }
    }

    // 顧客登録
    console.log("=== INSERT処理開始（Supabase） ===");

    const toNull = (v) =>
      v !== undefined && v !== null && String(v).trim() !== "" ? v : null;

    const customerData = {
      store_id: finalStoreId,
      customer_code: toNull(customer_code),
      name,
      kana: toNull(kana),
      email: toNull(email),
      phone: toNull(phone),
      address: toNull(address),
      birth_date: toNull(birth_date),
      gender: toNull(gender),
      notes: toNull(notes),
      visit_count: parseInt(visit_count) || 0,
      total_purchase_amount: parseInt(total_purchase_amount) || 0,
      last_visit_date: toNull(last_visit_date),
    };

    console.log("顧客データ:", customerData);

    const { data, error } = await db
      .from("customers")
      .insert(customerData)
      .select();

    if (error) {
      console.error("顧客登録エラー:", error);

      let errorMessage = "顧客の登録に失敗しました";

      // Supabaseの制約エラーを識別
      if (error.code === "23505") {
        errorMessage =
          "重複するデータが存在しています。顧客コードなどの重複を確認してください。";
      } else if (error.code === "23503") {
        errorMessage = "関連する店舗データが存在しません。";
      } else if (process.env.NODE_ENV !== "production") {
        errorMessage += ` [詳細: ${error.message}]`;
      }

      return res.status(500).render("error", {
        message: errorMessage,
        session: req.session,
      });
    }

    console.log("顧客登録成功:", data[0].id);
    res.redirect("/customers/list");
  } catch (error) {
    console.error("顧客登録処理エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
});

// 顧客更新処理
router.post("/update/:id", requireAuth, (req, res) => {
  const customerId = req.params.id;
  const {
    customer_code,
    name,
    kana,
    email,
    phone,
    address,
    birth_date,
    gender,
    store_id,
    notes,
    visit_count,
    total_purchase_amount,
    last_visit_date,
  } = req.body;

  const isAdmin = req.session.user.role === "admin";

  // 権限チェック
  let checkQuery, checkParams;
  if (isAdmin) {
    checkQuery = "SELECT * FROM customers WHERE id = ?";
    checkParams = [customerId];
  } else {
    checkQuery = "SELECT * FROM customers WHERE id = ? AND store_id = ?";
    checkParams = [customerId, req.session.user.store_id];
  }

  db.get(checkQuery, checkParams, (err, customer) => {
    if (err) {
      console.error("顧客取得エラー:", err);
      return res.status(500).render("error", {
        message: "顧客の取得に失敗しました",
        session: req.session,
      });
    }

    if (!customer) {
      return res.status(404).render("error", {
        message: "顧客が見つかりません",
        session: req.session,
      });
    }

    // 必須フィールドの検証
    if (!name) {
      return res.status(400).render("error", {
        message: "顧客名は必須です",
        session: req.session,
      });
    }

    const finalStoreId = isAdmin ? store_id : customer.store_id;

    // 顧客コードの重複チェック（自分以外）
    if (customer_code && customer_code !== customer.customer_code) {
      db.get(
        "SELECT id FROM customers WHERE customer_code = ? AND id != ?",
        [customer_code, customerId],
        (err, existing) => {
          if (err) {
            console.error("顧客コード重複チェックエラー:", err);
            return res.status(500).render("error", {
              message: "顧客コードの重複チェックに失敗しました",
              session: req.session,
            });
          }

          if (existing) {
            return res.status(400).render("error", {
              message: "この顧客コードは既に使用されています",
              session: req.session,
            });
          }

          updateCustomer();
        }
      );
    } else {
      updateCustomer();
    }

    function updateCustomer() {
      const useSupabase = true;
      console.log("=== UPDATE処理開始 ===");
      console.log("useSupabase:", useSupabase);
      console.log("customerId:", customerId);

      const query = useSupabase
        ? `
        UPDATE customers SET 
          store_id = ?, customer_code = ?, name = ?, kana = ?, email = ?, phone = ?, address = ?, birth_date = ?, gender = ?, notes = ?, visit_count = ?, total_purchase_amount = ?, last_visit_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
        : `
        UPDATE customers SET 
          store_id = ?, customer_code = ?, name = ?, kana = ?, 
          email = ?, phone = ?, address = ?, birth_date = ?, 
          gender = ?, notes = ?, visit_count = ?, total_purchase_amount = ?, last_visit_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const toNull = (v) =>
        v !== undefined && v !== null && String(v).trim() !== "" ? v : null;

      const params = true
        ? [
            finalStoreId,
            toNull(customer_code),
            name,
            toNull(kana),
            toNull(email),
            toNull(phone),
            toNull(address),
            toNull(birth_date),
            toNull(gender),
            toNull(notes),
            parseInt(visit_count) || 0,
            parseInt(total_purchase_amount) || 0,
            toNull(last_visit_date),
            customerId,
          ]
        : [
            finalStoreId,
            toNull(customer_code),
            name,
            toNull(kana),
            toNull(email),
            toNull(phone),
            toNull(address),
            toNull(birth_date),
            toNull(gender),
            toNull(notes),
            parseInt(visit_count) || 0,
            parseInt(total_purchase_amount) || 0,
            toNull(last_visit_date),
            customerId,
          ];

      console.log("実行SQL:", query);
      console.log("パラメータ:", params);
      console.log("更新前データ確認...");

      db.run(query, params, function (err) {
        if (err) {
          console.error("顧客更新エラー:", err);
          console.error("実行SQL:", query);
          console.error("パラメータ:", params);

          let errorMessage = "顧客の更新に失敗しました";

          // PostgreSQLの制約エラーを識別
          if (err.code === "23505") {
            errorMessage =
              "重複するデータが存在しています。顧客コードなどの重複を確認してください。";
          } else if (err.code === "23503") {
            errorMessage = "関連する店舗データが存在しません。";
          } else if (process.env.NODE_ENV !== "production") {
            errorMessage += ` [詳細: ${err.message}]`;
          }

          return res.status(500).render("error", {
            message: errorMessage,
            session: req.session,
          });
        }

        console.log("顧客更新成功:", customerId);
        console.log("this.changes:", this.changes); // 実際に更新された行数

        // 更新後のデータを確認
        db.get(
          "SELECT * FROM customers WHERE id = ?",
          [customerId],
          (err, updatedCustomer) => {
            if (!err && updatedCustomer) {
              console.log("更新後データ:", updatedCustomer);
            }
            res.redirect("/customers/list");
          }
        );
      });
    }
  });
});

// 顧客削除処理
router.post("/delete/:id", requireAuth, async (req, res) => {
  const customerId = req.params.id;
  const isAdmin = req.session.user.role === "admin";

  try {
    // 権限チェック - 顧客の存在確認
    let customerQuery = db.from("customers").select("*").eq("id", customerId);

    // 店舗ユーザーは自店舗の顧客のみ削除可能
    if (!isAdmin) {
      customerQuery = customerQuery.eq("store_id", req.session.user.store_id);
    }

    const { data: customers, error: fetchError } = await customerQuery.limit(1);

    if (fetchError) {
      console.error("顧客取得エラー:", fetchError);
      return res.status(500).render("error", {
        message: "顧客の取得に失敗しました",
        session: req.session,
      });
    }

    if (!customers || customers.length === 0) {
      return res.status(404).render("error", {
        message: "顧客が見つかりません",
        session: req.session,
      });
    }

    // 顧客削除
    const { error: deleteError } = await db
      .from("customers")
      .delete()
      .eq("id", customerId);

    if (deleteError) {
      console.error("顧客削除エラー:", deleteError);
      return res.status(500).render("error", {
        message: "顧客の削除に失敗しました",
        session: req.session,
      });
    }

    console.log("顧客削除成功:", customerId);
    res.redirect("/customers/list");
  } catch (error) {
    console.error("顧客削除処理エラー:", error);
    return res.status(500).render("error", {
      message: `エラー: ${error.message}`,
      session: req.session,
    });
  }
});

// 顧客の取引履歴取得（API）
router.get("/:id/transactions", requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    const isAdmin = req.session.user.role === "admin";

    console.log("取引履歴取得リクエスト:", {
      customerId,
      userRole: req.session.user.role,
    });

    // 顧客の存在確認と権限チェック
    let customerQuery = db
      .from("customers")
      .select("*, stores!inner(name)")
      .eq("id", customerId);

    // 店舗ユーザーは自店舗の顧客のみアクセス可能
    if (!isAdmin) {
      customerQuery = customerQuery.eq("store_id", req.session.user.store_id);
    }

    const { data: customerData, error: customerError } =
      await customerQuery.single();

    if (customerError || !customerData) {
      console.error("顧客確認エラー:", customerError);
      return res
        .status(404)
        .json({ error: "顧客が見つからないか、アクセス権限がありません" });
    }

    // Supabaseのレスポンスを整形
    const customer = {
      ...customerData,
      store_name: customerData.stores?.name || null,
    };

    // 取引履歴を取得
    const { data: transactions, error: transactionsError } = await db
      .from("customer_transactions")
      .select(
        "id, transaction_date, amount, description, payment_method, created_at, store_id, stores!inner(name)"
      )
      .eq("customer_id", customerId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (transactionsError) {
      console.error("取引履歴取得エラー:", transactionsError);

      // 日付エラーの場合は具体的なメッセージを表示
      let errorMessage = "取引履歴の取得に失敗しました";
      if (transactionsError.code === "22008") {
        errorMessage = "指定された日付が無効です。日付範囲を確認してください。";
      }

      return res.status(500).json({ error: errorMessage });
    }

    // 取引データを整形
    const enrichedTransactions = transactions.map((t) => ({
      id: t.id,
      transaction_date: t.transaction_date,
      amount: t.amount,
      description: t.description,
      payment_method: t.payment_method,
      created_at: t.created_at,
      store_id: t.store_id,
      store_name: t.stores?.name || null,
    }));

    // 統計情報を計算
    const totalAmount = enrichedTransactions.reduce(
      (sum, t) => sum + (t.amount || 0),
      0
    );
    const transactionCount = enrichedTransactions.length;
    const averageAmount =
      transactionCount > 0 ? Math.round(totalAmount / transactionCount) : 0;

    // 月別集計
    const monthlyStats = {};
    enrichedTransactions.forEach((t) => {
      const date = new Date(t.transaction_date);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { amount: 0, count: 0 };
      }
      monthlyStats[monthKey].amount += t.amount || 0;
      monthlyStats[monthKey].count += 1;
    });

    const monthlyData = Object.entries(monthlyStats)
      .map(([month, stats]) => ({
        month,
        amount: stats.amount,
        count: stats.count,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        customer_code: customer.customer_code,
        store_name: customer.store_name,
      },
      transactions: enrichedTransactions,
      summary: {
        total_amount: totalAmount,
        transaction_count: transactionCount,
        average_amount: averageAmount,
        recorded_total: customer.total_purchase_amount || 0,
        recorded_visits: customer.visit_count || 0,
        last_visit: customer.last_visit_date,
      },
      monthly_data: monthlyData,
    });
  } catch (error) {
    console.error("取引履歴取得エラー:", error);
    res.status(500).json({ error: "取引履歴の取得に失敗しました" });
  }
});

// 顧客別月次売上取得（API）
router.get("/:id/monthly-sales", requireAuth, async (req, res) => {
  try {
    const customerId = req.params.id;
    const { year, month } = req.query;
    const isAdmin = req.session.user.role === "admin";

    // 権限チェック
    let customerQuery = db
      .from("customers")
      .select("id, name, store_id")
      .eq("id", customerId);

    if (!isAdmin) {
      customerQuery = customerQuery.eq("store_id", req.session.user.store_id);
    }

    const { data: customer, error: customerError } =
      await customerQuery.single();

    if (customerError || !customer) {
      return res.status(404).json({ error: "顧客が見つかりません" });
    }

    // 取引データを取得
    let transactionsQuery = db
      .from("customer_transactions")
      .select("transaction_date, amount")
      .eq("customer_id", customerId);

    const { data: transactions, error: transactionsError } =
      await transactionsQuery;

    if (transactionsError) {
      console.error("月次売上取得エラー:", transactionsError);
      return res.status(500).json({ error: "月次売上の取得に失敗しました" });
    }

    // JavaScriptで月次集計
    const monthlySales = {};
    transactions.forEach((t) => {
      const date = new Date(t.transaction_date);
      const txYear = date.getFullYear();
      const txMonth = date.getMonth() + 1;

      // フィルタ条件をチェック
      if (year && txYear !== parseInt(year)) return;
      if (month && txMonth !== parseInt(month)) return;

      const key = `${txYear}-${String(txMonth).padStart(2, "0")}`;
      if (!monthlySales[key]) {
        monthlySales[key] = {
          year: txYear,
          month: txMonth,
          amount: 0,
          transaction_count: 0,
          total_for_avg: 0,
        };
      }
      monthlySales[key].amount += t.amount || 0;
      monthlySales[key].transaction_count += 1;
      monthlySales[key].total_for_avg += t.amount || 0;
    });

    const monthlySalesArray = Object.values(monthlySales)
      .map((row) => ({
        year: row.year,
        month: row.month,
        amount: row.amount,
        transaction_count: row.transaction_count,
        average_amount:
          row.transaction_count > 0
            ? Math.round(row.total_for_avg / row.transaction_count)
            : 0,
      }))
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
      },
      monthly_sales: monthlySalesArray,
    });
  } catch (error) {
    console.error("月次売上取得エラー:", error);
    res.status(500).json({ error: "月次売上の取得に失敗しました" });
  }
});

// 店舗の顧客一覧と売上情報取得（API）
router.get("/store/:storeId/with-sales", requireAuth, async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const isAdmin = req.session.user.role === "admin";

    console.log("顧客売上情報取得リクエスト:", {
      storeId,
      isAdmin,
      isSupabase: true,
    });

    // 権限チェック
    if (!isAdmin && req.session.user.store_id !== parseInt(storeId)) {
      return res.status(403).json({ error: "アクセス権限がありません" });
    }

    // まず顧客一覧を取得
    const { data: customers, error: customersError } = await db
      .from("customers")
      .select(
        "id, customer_code, name, email, phone, total_purchase_amount, visit_count, last_visit_date, created_at"
      )
      .eq("store_id", storeId)
      .order("name");

    if (customersError) {
      console.error("顧客一覧取得エラー:", customersError);
      return res.status(500).json({ error: "顧客情報の取得に失敗しました" });
    }

    console.log("取得した顧客数:", customers.length);

    if (customers.length === 0) {
      return res.json({
        customers: [],
        summary: {
          total_customers: 0,
          active_customers: 0,
          total_revenue: 0,
          average_revenue_per_customer: 0,
        },
      });
    }

    // 各顧客の取引統計を取得
    const customerIds = customers.map((c) => c.id);
    const { data: transactions, error: transactionsError } = await db
      .from("customer_transactions")
      .select("customer_id, amount, transaction_date")
      .in("customer_id", customerIds);

    if (transactionsError) {
      console.error("取引統計取得エラー:", transactionsError);
      return res.status(500).json({ error: "取引統計の取得に失敗しました" });
    }

    console.log("取得した取引数:", transactions.length);

    // 顧客ごとに取引を集計
    const transactionMap = {};
    transactions.forEach((t) => {
      if (!transactionMap[t.customer_id]) {
        transactionMap[t.customer_id] = {
          transaction_count: 0,
          total_amount: 0,
          last_transaction_date: null,
        };
      }
      transactionMap[t.customer_id].transaction_count++;
      transactionMap[t.customer_id].total_amount += t.amount || 0;
      if (
        !transactionMap[t.customer_id].last_transaction_date ||
        t.transaction_date > transactionMap[t.customer_id].last_transaction_date
      ) {
        transactionMap[t.customer_id].last_transaction_date =
          t.transaction_date;
      }
    });

    const enrichedCustomers = customers.map((customer) => ({
      ...customer,
      actual_transactions: transactionMap[customer.id]?.transaction_count || 0,
      actual_total: transactionMap[customer.id]?.total_amount || 0,
      last_transaction_date:
        transactionMap[customer.id]?.last_transaction_date || null,
    }));

    // 実際の売上順でソート
    enrichedCustomers.sort(
      (a, b) => (b.actual_total || 0) - (a.actual_total || 0)
    );

    // 統計情報を計算
    const totalCustomers = enrichedCustomers.length;
    const activeCustomers = enrichedCustomers.filter(
      (c) => c.actual_transactions > 0
    ).length;
    const totalRevenue = enrichedCustomers.reduce(
      (sum, c) => sum + (c.actual_total || 0),
      0
    );
    const averageRevenue =
      totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;

    console.log("最終統計:", {
      totalCustomers,
      activeCustomers,
      totalRevenue,
      averageRevenue,
    });

    res.json({
      customers: enrichedCustomers,
      summary: {
        total_customers: totalCustomers,
        active_customers: activeCustomers,
        total_revenue: totalRevenue,
        average_revenue_per_customer: averageRevenue,
      },
    });
  } catch (error) {
    console.error("顧客売上情報取得エラー:", error);
    res.status(500).json({ error: "顧客情報の取得に失敗しました" });
  }
});

module.exports = router;
