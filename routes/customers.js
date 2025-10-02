const express = require("express");
const router = express.Router();
const db = require("../db");
const { isSupabaseConfigured } = require("../config/database");
const { getSupabaseClient } = require("../config/supabase");

// Vercel環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const supabase = isVercel ? getSupabaseClient() : null;

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
router.get("/list", requireAuth, (req, res) => {
  const isAdmin = req.session.user.role === "admin";

  // 店舗ユーザーの場合は専用ページにリダイレクト
  if (!isAdmin) {
    return res.redirect("/customers/store");
  }

  const selectedStoreId = req.query.store_id;
  const searchTerm = req.query.search || "";

  let query, params;

  if (isAdmin) {
    // 管理者の場合は店舗フィルターと検索に対応
    let whereConditions = [];
    let queryParams = [];

    if (selectedStoreId && selectedStoreId !== "all") {
      whereConditions.push("c.store_id = ?");
      queryParams.push(selectedStoreId);
    }

    if (searchTerm) {
      whereConditions.push(
        "(c.name LIKE ? OR c.customer_code LIKE ? OR c.email LIKE ?)"
      );
      queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    query = `
      SELECT c.*, s.name as store_name 
      FROM customers c 
      LEFT JOIN stores s ON c.store_id = s.id 
      ${whereClause}
      ORDER BY c.created_at DESC
    `;
    params = queryParams;
  } else {
    // 店舗ユーザーは自店舗の顧客のみ表示（検索対応）
    let whereConditions = ["c.store_id = ?"];
    let queryParams = [req.session.user.store_id];

    if (searchTerm) {
      whereConditions.push(
        "(c.name LIKE ? OR c.customer_code LIKE ? OR c.email LIKE ?)"
      );
      queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }

    query = `
      SELECT c.*, s.name as store_name 
      FROM customers c 
      LEFT JOIN stores s ON c.store_id = s.id 
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY c.created_at DESC
    `;
    params = queryParams;
  }

  // 店舗一覧取得（管理者の場合）
  const getStoresList = (callback) => {
    if (isAdmin) {
      db.all("SELECT id, name FROM stores ORDER BY name", [], callback);
    } else {
      callback(null, []);
    }
  };

  getStoresList((storeErr, stores) => {
    if (storeErr) {
      console.error("店舗一覧取得エラー:", storeErr);
      return res.status(500).render("error", {
        message: "店舗一覧の取得に失敗しました",
        session: req.session,
      });
    }

    db.all(query, params, (err, customers) => {
      if (err) {
        console.error("顧客一覧取得エラー:", err);
        console.error("SQL:", query);
        console.error("パラメータ:", params);

        let errorMessage = "顧客一覧の取得に失敗しました";
        if (process.env.NODE_ENV !== "production") {
          errorMessage += ` [詳細: ${err.message}]`;
        }

        return res.status(500).render("error", {
          message: errorMessage,
          session: req.session,
        });
      }

      res.render("customers_list", {
        customers: customers || [],
        stores: stores || [],
        selectedStoreId: selectedStoreId || "all",
        searchTerm: searchTerm,
        session: req.session,
        title: "顧客一覧",
        isAdmin: isAdmin,
        isSupabase: isSupabaseConfigured(),
      });
    });
  });
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

    if (isVercel && supabase) {
      // Vercel + Supabase環境
      console.log("Supabase環境で店舗専用顧客一覧取得");
      console.log("Store ID:", storeId, "Search Term:", searchTerm);

      let query = supabase
        .from("customers")
        .select(
          `
          *,
          stores!inner(name)
        `
        )
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
        isSupabase: isSupabaseConfigured(),
      });
    } else {
      // ローカル環境（SQLite）
      let whereConditions = ["c.store_id = ?"];
      let queryParams = [storeId];

      if (searchTerm) {
        whereConditions.push(
          "(c.name LIKE ? OR c.customer_code LIKE ? OR c.email LIKE ?)"
        );
        queryParams.push(
          `%${searchTerm}%`,
          `%${searchTerm}%`,
          `%${searchTerm}%`
        );
      }

      const query = `
        SELECT c.*, s.name as store_name
        FROM customers c
        LEFT JOIN stores s ON c.store_id = s.id
        WHERE ${whereConditions.join(" AND ")}
        ORDER BY c.created_at DESC
      `;

      db.all(query, queryParams, (err, customers) => {
        if (err) {
          console.error("顧客一覧取得エラー:", err);
          return res.status(500).render("error", {
            message: "顧客一覧の取得に失敗しました",
            session: req.session,
          });
        }

        res.render("customers_store_list", {
          customers: customers || [],
          searchTerm: searchTerm,
          session: req.session,
          title: "顧客一覧",
          isSupabase: isSupabaseConfigured(),
        });
      });
    }
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
    } else {
      // ローカル環境（SQLite）
      let query, params;
      if (isAdmin) {
        query = `
          SELECT c.*, s.name as store_name 
          FROM customers c 
          LEFT JOIN stores s ON c.store_id = s.id 
          WHERE c.id = ?
        `;
        params = [customerId];
      } else {
        query = `
          SELECT c.*, s.name as store_name 
          FROM customers c 
          LEFT JOIN stores s ON c.store_id = s.id 
          WHERE c.id = ? AND c.store_id = ?
        `;
        params = [customerId, req.session.user.store_id];
      }

      const customerResult = await new Promise((resolve, reject) => {
        db.get(query, params, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      if (!customerResult) {
        return res.status(404).render("error", {
          message: "顧客が見つかりません",
          session: req.session,
        });
      }

      customer = customerResult;
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
      if (isVercel && supabase) {
        // Vercel + Supabase環境
        console.log("Supabase環境で店舗一覧取得");
        const { data, error } = await supabase
          .from("stores")
          .select("id, name")
          .order("name");

        if (error) {
          console.error("Supabase店舗一覧取得エラー:", error);
          return res.status(500).render("error", {
            message: "店舗一覧の取得に失敗しました",
            session: req.session,
          });
        }

        stores = data || [];
      } else {
        // ローカル環境（SQLite）
        const storesResult = await new Promise((resolve, reject) => {
          db.all(
            "SELECT id, name FROM stores ORDER BY name",
            [],
            (err, result) => {
              if (err) reject(err);
              else resolve(result);
            }
          );
        });

        stores = storesResult || [];
      }
    }

    res.render("customers_form", {
      customer: null,
      stores: stores,
      session: req.session,
      title: "顧客登録",
      isAdmin: isAdmin,
      isSupabase: isSupabaseConfigured(),
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
router.get("/edit/:id", requireAuth, (req, res) => {
  const customerId = req.params.id;
  const isAdmin = req.session.user.role === "admin";

  let customerQuery, customerParams;
  if (isAdmin) {
    customerQuery = "SELECT * FROM customers WHERE id = ?";
    customerParams = [customerId];
  } else {
    customerQuery = "SELECT * FROM customers WHERE id = ? AND store_id = ?";
    customerParams = [customerId, req.session.user.store_id];
  }

  db.get(customerQuery, customerParams, (err, customer) => {
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

    if (isAdmin) {
      // 管理者の場合は店舗一覧も取得
      db.all("SELECT id, name FROM stores ORDER BY name", [], (err, stores) => {
        if (err) {
          console.error("店舗一覧取得エラー:", err);
          return res.status(500).render("error", {
            message: "店舗一覧の取得に失敗しました",
            session: req.session,
          });
        }

        res.render("customers_form", {
          customer: customer,
          stores: stores || [],
          session: req.session,
          title: "顧客編集",
          isAdmin: isAdmin,
          isSupabase: isSupabaseConfigured(),
        });
      });
    } else {
      res.render("customers_form", {
        customer: customer,
        stores: [],
        session: req.session,
        title: "顧客編集",
        isAdmin: isAdmin,
        isSupabase: isSupabaseConfigured(),
      });
    }
  });
});

// 顧客登録処理
router.post("/create", requireAuth, (req, res) => {
  console.log("=== 顧客登録処理開始 ===");
  console.log("リクエストボディ:", req.body);
  console.log("セッションユーザー:", req.session.user);
  console.log("Supabase設定:", isSupabaseConfigured());

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
    db.get(
      "SELECT id FROM customers WHERE customer_code = ?",
      [customer_code],
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

        // 顧客登録
        insertCustomer();
      }
    );
  } else {
    insertCustomer();
  }

  function insertCustomer() {
    const useSupabase = isSupabaseConfigured();
    console.log("=== INSERT処理開始 ===");
    console.log("useSupabase:", useSupabase);

    const query = useSupabase
      ? `
      INSERT INTO customers (
        store_id, customer_code, name, kana, email, phone, address, birth_date, gender, notes, visit_count, total_purchase_amount, last_visit_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      : `
      INSERT INTO customers (
        store_id, customer_code, name, kana, email, phone, 
        address, birth_date, gender, notes, visit_count, total_purchase_amount, last_visit_date, registration_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const toNull = (v) =>
      v !== undefined && v !== null && String(v).trim() !== "" ? v : null;

    const params = isSupabaseConfigured()
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
          new Date().toISOString().slice(0, 10),
        ];

    console.log("実行SQL:", query);
    console.log("パラメータ:", params);

    db.run(query, params, function (err) {
      if (err) {
        console.error("顧客登録エラー:", err);
        console.error("実行SQL:", query);
        console.error("パラメータ:", params);

        let errorMessage = "顧客の登録に失敗しました";

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

      console.log("顧客登録成功:", this.lastID);
      res.redirect("/customers/list");
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
      const useSupabase = isSupabaseConfigured();
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

      const params = isSupabaseConfigured()
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
router.post("/delete/:id", requireAuth, (req, res) => {
  const customerId = req.params.id;
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

    // 顧客削除
    db.run("DELETE FROM customers WHERE id = ?", [customerId], function (err) {
      if (err) {
        console.error("顧客削除エラー:", err);
        return res.status(500).render("error", {
          message: "顧客の削除に失敗しました",
          session: req.session,
        });
      }

      console.log("顧客削除成功:", customerId);
      res.redirect("/customers/list");
    });
  });
});

// 顧客の取引履歴取得（API）
router.get("/:id/transactions", requireAuth, (req, res) => {
  const customerId = req.params.id;
  const isAdmin = req.session.user.role === "admin";

  console.log("取引履歴取得リクエスト:", {
    customerId,
    userRole: req.session.user.role,
  });

  // 顧客の存在確認と権限チェック
  let customerQuery =
    "SELECT c.*, s.name as store_name FROM customers c LEFT JOIN stores s ON c.store_id = s.id WHERE c.id = ?";
  let customerParams = [customerId];

  // 店舗ユーザーは自店舗の顧客のみアクセス可能
  if (!isAdmin) {
    customerQuery += " AND c.store_id = ?";
    customerParams.push(req.session.user.store_id);
  }

  db.get(customerQuery, customerParams, (err, customer) => {
    if (err) {
      console.error("顧客確認エラー:", err);
      return res.status(500).json({ error: "データベースエラー" });
    }

    if (!customer) {
      return res
        .status(404)
        .json({ error: "顧客が見つからないか、アクセス権限がありません" });
    }

    // 取引履歴を取得
    const useSupabase = isSupabaseConfigured();

    if (useSupabase) {
      // Supabase環境では分離クエリを使用
      db.all(
        `SELECT 
          id,
          transaction_date,
          amount,
          description,
          payment_method,
          created_at,
          store_id
        FROM customer_transactions 
        WHERE customer_id = ?
        ORDER BY transaction_date DESC, created_at DESC`,
        [customerId],
        (err, transactions) => {
          if (err) {
            console.error("Supabase取引履歴取得エラー:", err);
            return res
              .status(500)
              .json({ error: "取引履歴の取得に失敗しました" });
          }

          // 店舗名を別途取得してマージ
          if (transactions.length > 0) {
            const storeIds = [...new Set(transactions.map((t) => t.store_id))];
            const storePlaceholders = storeIds.map(() => "?").join(",");

            db.all(
              `SELECT id, name FROM stores WHERE id IN (${storePlaceholders})`,
              storeIds,
              (err, stores) => {
                if (err) {
                  console.error("店舗情報取得エラー:", err);
                  // エラーでも取引履歴は返す（店舗名なし）
                  processTransactionData(
                    transactions.map((t) => ({ ...t, store_name: null }))
                  );
                  return;
                }

                const storeMap = {};
                stores.forEach((s) => {
                  storeMap[s.id] = s.name;
                });

                const enrichedTransactions = transactions.map((t) => ({
                  ...t,
                  store_name: storeMap[t.store_id] || null,
                }));

                processTransactionData(enrichedTransactions);
              }
            );
          } else {
            processTransactionData(transactions);
          }
        }
      );
    } else {
      // SQLite環境では従来のJOINクエリを使用
      db.all(
        `SELECT 
          customer_transactions.id,
          customer_transactions.transaction_date,
          customer_transactions.amount,
          customer_transactions.description,
          customer_transactions.payment_method,
          customer_transactions.created_at,
          stores.name as store_name
        FROM customer_transactions 
        LEFT JOIN stores ON customer_transactions.store_id = stores.id
        WHERE customer_transactions.customer_id = ?
        ORDER BY customer_transactions.transaction_date DESC, customer_transactions.created_at DESC`,
        [customerId],
        (err, transactions) => {
          if (err) {
            console.error("SQLite取引履歴取得エラー:", err);
            return res
              .status(500)
              .json({ error: "取引履歴の取得に失敗しました" });
          }

          processTransactionData(transactions);
        }
      );
    }

    function processTransactionData(transactions) {
      // 統計情報を計算
      const totalAmount = transactions.reduce(
        (sum, t) => sum + (t.amount || 0),
        0
      );
      const transactionCount = transactions.length;
      const averageAmount =
        transactionCount > 0 ? Math.round(totalAmount / transactionCount) : 0;

      // 月別集計
      const monthlyStats = {};
      transactions.forEach((t) => {
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
        transactions,
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
    }
  });
});

// 顧客別月次売上取得（API）
router.get("/:id/monthly-sales", requireAuth, (req, res) => {
  const customerId = req.params.id;
  const { year, month } = req.query;
  const isAdmin = req.session.user.role === "admin";

  // 権限チェック
  let customerQuery = "SELECT id, name, store_id FROM customers WHERE id = ?";
  let customerParams = [customerId];

  if (!isAdmin) {
    customerQuery += " AND store_id = ?";
    customerParams.push(req.session.user.store_id);
  }

  db.get(customerQuery, customerParams, (err, customer) => {
    if (err) {
      return res.status(500).json({ error: "データベースエラー" });
    }

    if (!customer) {
      return res.status(404).json({ error: "顧客が見つかりません" });
    }

    // 月次売上を取得
    let salesQuery = `
      SELECT 
        strftime('%Y', ct.transaction_date) as year,
        strftime('%m', ct.transaction_date) as month,
        SUM(ct.amount) as monthly_amount,
        COUNT(*) as transaction_count,
        AVG(ct.amount) as average_amount
      FROM customer_transactions ct
      WHERE ct.customer_id = ?
    `;
    let salesParams = [customerId];

    if (year) {
      salesQuery += " AND strftime('%Y', ct.transaction_date) = ?";
      salesParams.push(year);
    }

    if (month) {
      salesQuery += " AND strftime('%m', ct.transaction_date) = ?";
      salesParams.push(String(month).padStart(2, "0"));
    }

    salesQuery += " GROUP BY year, month ORDER BY year DESC, month DESC";

    db.all(salesQuery, salesParams, (err, monthlySales) => {
      if (err) {
        console.error("月次売上取得エラー:", err);
        return res.status(500).json({ error: "月次売上の取得に失敗しました" });
      }

      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
        },
        monthly_sales: monthlySales.map((row) => ({
          year: parseInt(row.year),
          month: parseInt(row.month),
          amount: row.monthly_amount || 0,
          transaction_count: row.transaction_count || 0,
          average_amount: Math.round(row.average_amount || 0),
        })),
      });
    });
  });
});

// 店舗の顧客一覧と売上情報取得（API）
router.get("/store/:storeId/with-sales", requireAuth, (req, res) => {
  const storeId = req.params.storeId;
  const isAdmin = req.session.user.role === "admin";

  console.log("顧客売上情報取得リクエスト:", {
    storeId,
    isAdmin,
    isSupabase: isSupabaseConfigured(),
  });

  // 権限チェック
  if (!isAdmin && req.session.user.store_id !== parseInt(storeId)) {
    return res.status(403).json({ error: "アクセス権限がありません" });
  }

  const useSupabase = isSupabaseConfigured();

  if (useSupabase) {
    // Supabase環境では分離したクエリを使用
    console.log("Supabase環境: 分離クエリを実行");

    // まず顧客一覧を取得
    db.all(
      "SELECT id, customer_code, name, email, phone, total_purchase_amount, visit_count, last_visit_date, registration_date FROM customers WHERE store_id = ? ORDER BY name",
      [storeId],
      (err, customers) => {
        if (err) {
          console.error("Supabase顧客一覧取得エラー:", err);
          return res
            .status(500)
            .json({ error: "顧客情報の取得に失敗しました" });
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

        // 各顧客の取引統計を個別に取得
        const customerIds = customers.map((c) => c.id);
        const placeholders = customerIds.map(() => "?").join(",");

        db.all(
          `SELECT 
            customer_id,
            COUNT(*) as transaction_count,
            SUM(amount) as total_amount,
            MAX(transaction_date) as last_transaction_date
          FROM customer_transactions 
          WHERE customer_id IN (${placeholders})
          GROUP BY customer_id`,
          customerIds,
          (err, transactions) => {
            if (err) {
              console.error("Supabase取引統計取得エラー:", err);
              return res
                .status(500)
                .json({ error: "取引統計の取得に失敗しました" });
            }

            console.log("取得した取引統計数:", transactions.length);

            // 顧客データと取引統計をマージ
            const transactionMap = {};
            transactions.forEach((t) => {
              transactionMap[t.customer_id] = {
                actual_transactions: t.transaction_count || 0,
                actual_total: t.total_amount || 0,
                last_transaction_date: t.last_transaction_date,
              };
            });

            const enrichedCustomers = customers.map((customer) => ({
              ...customer,
              actual_transactions:
                transactionMap[customer.id]?.actual_transactions || 0,
              actual_total: transactionMap[customer.id]?.actual_total || 0,
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
              totalCustomers > 0
                ? Math.round(totalRevenue / totalCustomers)
                : 0;

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
          }
        );
      }
    );
  } else {
    // SQLite環境では従来のJOINクエリを使用
    console.log("SQLite環境: JOINクエリを実行");

    db.all(
      `SELECT 
        customers.id,
        customers.customer_code,
        customers.name,
        customers.email,
        customers.phone,
        customers.total_purchase_amount,
        customers.visit_count,
        customers.last_visit_date,
        customers.registration_date,
        COUNT(customer_transactions.id) as actual_transactions,
        COALESCE(SUM(customer_transactions.amount), 0) as actual_total,
        MAX(customer_transactions.transaction_date) as last_transaction_date
      FROM customers 
      LEFT JOIN customer_transactions ON customers.id = customer_transactions.customer_id
      WHERE customers.store_id = ?
      GROUP BY customers.id, customers.customer_code, customers.name, customers.email, customers.phone, 
               customers.total_purchase_amount, customers.visit_count, customers.last_visit_date, customers.registration_date
      ORDER BY actual_total DESC, customers.name`,
      [storeId],
      (err, customers) => {
        if (err) {
          console.error("SQLite顧客売上情報取得エラー:", err);
          return res
            .status(500)
            .json({ error: "顧客情報の取得に失敗しました" });
        }

        console.log("SQLite取得顧客数:", customers.length);

        // 統計情報を計算
        const totalCustomers = customers.length;
        const activeCustomers = customers.filter(
          (c) => c.actual_transactions > 0
        ).length;
        const totalRevenue = customers.reduce(
          (sum, c) => sum + (c.actual_total || 0),
          0
        );
        const averageRevenue =
          totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;

        res.json({
          customers,
          summary: {
            total_customers: totalCustomers,
            active_customers: activeCustomers,
            total_revenue: totalRevenue,
            average_revenue_per_customer: averageRevenue,
          },
        });
      }
    );
  }
});

module.exports = router;
