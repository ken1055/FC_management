const express = require("express");
const router = express.Router();
const db = require("../db");
const { isSupabaseConfigured } = require("../config/database");

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
        return res.status(500).render("error", {
          message: "顧客一覧の取得に失敗しました",
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
router.get("/store", requireAuth, (req, res) => {
  const isAdmin = req.session.user.role === "admin";

  // 管理者の場合は管理者用ページにリダイレクト
  if (isAdmin) {
    return res.redirect("/customers/list");
  }

  const searchTerm = req.query.search || "";
  const storeId = req.session.user.store_id;

  let whereConditions = ["c.store_id = ?"];
  let queryParams = [storeId];

  if (searchTerm) {
    whereConditions.push(
      "(c.name LIKE ? OR c.customer_code LIKE ? OR c.email LIKE ?)"
    );
    queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
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
});

// 顧客詳細表示
router.get("/detail/:id", requireAuth, (req, res) => {
  const customerId = req.params.id;
  const isAdmin = req.session.user.role === "admin";

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

  db.get(query, params, (err, customer) => {
    if (err) {
      console.error("顧客詳細取得エラー:", err);
      return res.status(500).render("error", {
        message: "顧客詳細の取得に失敗しました",
        session: req.session,
      });
    }

    if (!customer) {
      return res.status(404).render("error", {
        message: "顧客が見つかりません",
        session: req.session,
      });
    }

    res.render("customers_detail", {
      customer: customer,
      session: req.session,
      title: "顧客詳細",
      isAdmin: isAdmin,
    });
  });
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
router.get("/new", requireAuth, (req, res) => {
  const isAdmin = req.session.user.role === "admin";

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
        customer: null,
        stores: stores || [],
        session: req.session,
        title: "顧客登録",
        isAdmin: isAdmin,
        isSupabase: isSupabaseConfigured(),
      });
    });
  } else {
    res.render("customers_form", {
      customer: null,
      stores: [],
      session: req.session,
      title: "顧客登録",
      isAdmin: isAdmin,
      isSupabase: isSupabaseConfigured(),
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
        store_id, customer_code, name, email, phone, address, birth_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      : `
      INSERT INTO customers (
        store_id, customer_code, name, kana, email, phone, 
        address, birth_date, gender, notes, registration_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const toNull = (v) => (v !== undefined && v !== null && String(v).trim() !== "" ? v : null);

    const params = isSupabaseConfigured()
      ? [
          finalStoreId,
          toNull(customer_code),
          name,
          toNull(email),
          toNull(phone),
          toNull(address),
          toNull(birth_date),
          toNull(notes),
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
          new Date().toISOString().slice(0, 10),
        ];

    console.log("実行SQL:", query);
    console.log("パラメータ:", params);

    db.run(query, params, function (err) {
      if (err) {
        console.error("顧客登録エラー:", err);
        return res.status(500).render("error", {
          message: "顧客の登録に失敗しました",
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
      const query = useSupabase
        ? `
        UPDATE customers SET 
          store_id = ?, customer_code = ?, name = ?, email = ?, phone = ?, address = ?, birth_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
        : `
        UPDATE customers SET 
          store_id = ?, customer_code = ?, name = ?, kana = ?, 
          email = ?, phone = ?, address = ?, birth_date = ?, 
          gender = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const toNull = (v) => (v !== undefined && v !== null && String(v).trim() !== "" ? v : null);

      const params = isSupabaseConfigured()
        ? [
            finalStoreId,
            toNull(customer_code),
            name,
            toNull(email),
            toNull(phone),
            toNull(address),
            toNull(birth_date),
            toNull(notes),
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
            customerId,
          ];

      db.run(query, params, function (err) {
        if (err) {
          console.error("顧客更新エラー:", err);
          return res.status(500).render("error", {
            message: "顧客の更新に失敗しました",
            session: req.session,
          });
        }

        console.log("顧客更新成功:", customerId);
        res.redirect("/customers/list");
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

module.exports = router;
