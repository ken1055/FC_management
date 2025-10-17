const express = require("express");
const router = express.Router();
const db = require("../db");
const { isSupabaseConfigured } = require("../config/database");
const { getSupabaseClient } = require("../config/supabase");
const bcrypt = require("bcryptjs");
const {
  sendProfileRegistrationNotification,
  sendProfileUpdateNotification,
  sendAgencyRegistrationNotification, // 新規追加
  getAdminEmails,
} = require("../config/email");

// Vercel環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const supabase = isVercel ? getSupabaseClient() : null;

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
router.get("/", async (req, res) => {
  try {
    const { data: rows, error } = await db
      .from("stores")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("店舗一覧取得エラー:", error);
      return res.status(500).send("DBエラー");
    }

    res.json(rows || []);
  } catch (error) {
    console.error("店舗一覧取得エラー:", error);
    return res.status(500).send("DBエラー");
  }
});

// ID整合性チェック機能（代理店用）- Supabase対応
async function checkAgencyIdIntegrity(callback) {
  console.log("代理店ID整合性チェック開始（Supabase環境）...");

  try {
    const { data: stores, error } = await db
      .from("stores")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("代理店ID整合性チェック - DB取得エラー:", error);
      return callback(error, null);
    }

    console.log(`取得した代理店数: ${stores?.length || 0}`);

    // Supabaseでは自動インクリメントIDが自動管理されるため、
    // 整合性チェックは常にOKとして返す
    const result = {
      totalAgencies: stores?.length || 0,
      issues: [],
      isIntegrityOk: true,
      message: "Supabase環境ではIDは自動管理されています",
    };

    console.log("代理店ID整合性チェック結果:", result);
    callback(null, result);
  } catch (error) {
    console.error("代理店ID整合性チェックエラー:", error);
    callback(error, null);
  }
}

// ID修正機能（代理店用）- Supabase対応
function fixAgencyIds(callback) {
  console.log("=== 代理店ID修正（Supabase環境） ===");
  console.log("Supabase環境ではIDは自動管理されるため、修正は不要です");
  
  // Supabaseでは自動インクリメントIDが自動管理されるため、何もせずに成功を返す
  callback(null);
}

// 代理店一覧ページ
router.get("/list", requireRole(["admin"]), (req, res) => {
  const { group_id, search, message } = req.query;

  console.log("=== 代理店一覧ページアクセス ===");
  console.log("リクエストパラメータ:", { group_id, search, message });

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

    console.log("代理店ID整合性チェック結果:", integrityInfo);

    // 代理店のID修正処理を無効化
    console.log("=== 代理店ID修正処理は無効化されています ===");
    console.log("ID整合性の問題があっても自動修正は行いません");

    // 整合性チェック結果を表示するが、修正は行わない
    renderAgenciesList(req, res, group_id, search, integrityInfo, message);
  });
});

// 代理店一覧画面の描画関数
async function renderAgenciesList(
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

  try {
    // グループ一覧を取得
    const { data: groups, error: groupsError } = await db
      .from("groups")
      .select("*");

    if (groupsError) {
      console.error("グループ取得エラー:", groupsError);
      return res.status(500).send("DBエラー: " + groupsError.message);
    }

    // Supabaseでは店舗一覧を取得（シンプルなクエリ）
    let storesQuery = db.from("stores").select(`
      *,
      group_members!left(group_id, groups!left(name))
    `);

    // グループフィルタ
    if (groupId) {
      storesQuery = storesQuery.eq("group_members.group_id", groupId);
    }

    // 検索フィルタ
    if (searchQuery) {
      storesQuery = storesQuery.ilike("name", `%${searchQuery}%`);
    }

    storesQuery = storesQuery.order("id", { ascending: true });

    const { data: rawStores, error: storesError } = await storesQuery;

    if (storesError) {
      console.error("代理店一覧取得エラー:", storesError);
      let errorMessage = "店舗一覧の取得に失敗しました";
      if (process.env.NODE_ENV !== "production") {
        errorMessage += ` [詳細: ${storesError.message}]`;
      }
      return res.status(500).send(errorMessage);
    }

    // データ整形（group_nameを追加）
    const stores = (rawStores || []).map((store) => ({
      ...store,
      group_name: store.group_members?.[0]?.groups?.name || null,
      product_count: null, // Supabaseではstore_productsは使用しない
      product_names: null,
      sales_count: 0, // 簡易的に0を設定（必要に応じて別途集計可能）
      total_sales: 0,
    }));

    if (stores && stores.length > 0) {
      const sample = stores[0];
      console.log("stores_list 表示用フィールド確認:", Object.keys(sample));
      console.log("sample:", {
        id: sample.id,
        name: sample.name,
        manager_name: sample.manager_name,
        business_address: sample.business_address,
        main_phone: sample.main_phone,
        contract_type: sample.contract_type,
        contract_start_date: sample.contract_start_date,
        royalty_rate: sample.royalty_rate,
      });
    }

    console.log("代理店一覧取得完了:", stores.length, "件");

    res.render("stores_list", {
      stores,
      groups: groups || [],
      selectedGroupId: groupId,
      searchQuery,
      session: req.session,
      success: message,
      integrityInfo,
      autoFixMessage,
    });
  } catch (error) {
    console.error("renderAgenciesList実行エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
}

// 新規登録フォーム
router.get("/new", requireRole(["admin"]), (req, res) => {
  res.render("agencies_form", {
    agency: null,
    session: req.session,
    title: "店舗新規登録",
  });
});

// 編集フォーム
router.get("/edit/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const { data: agencies, error } = await db
      .from("stores")
      .select("*")
      .eq("id", req.params.id)
      .limit(1);

    if (error || !agencies || agencies.length === 0) {
      console.error("店舗取得エラー:", error);
      return res.status(404).send("データがありません");
    }

    const agency = agencies[0];

    // Supabaseでは store_products は使用しない
    agency.products = [];

    res.render("agencies_form", {
      agency,
      session: req.session,
      title: "店舗編集",
    });
  } catch (error) {
    console.error("編集フォーム取得エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

// 代理店登録
router.post("/", async (req, res) => {
  const { name, age, address, bank_info, experience_years, contract_date } =
    req.body;
  
  try {
    const { data, error } = await db
      .from("stores")
      .insert({
        name,
        business_address: address,
        contract_start_date: contract_date || null,
      })
      .select();

    if (error) {
      console.error("代理店登録エラー:", error);
      return res.status(500).send("DBエラー");
    }

    res.json({ id: data[0].id });
  } catch (error) {
    console.error("代理店登録エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

// 代理店編集
router.put("/:id", async (req, res) => {
  const { name, age, address, bank_info, experience_years, contract_date } =
    req.body;
  
  try {
    const { error } = await db
      .from("stores")
      .update({
        name,
        business_address: address,
        contract_start_date: contract_date || null,
      })
      .eq("id", req.params.id);

    if (error) {
      console.error("代理店更新エラー:", error);
      return res.status(500).send("DBエラー");
    }

    res.send("更新完了");
  } catch (error) {
    console.error("代理店更新エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

// 新規登録（フォームPOST対応）
router.post("/new", requireRole(["admin"]), async (req, res) => {
  console.log("=== 新規登録処理開始 ===");
  console.log("リクエストボディ:", req.body);

  try {
    const {
      name,
      // 店舗基本情報
      business_address,
      main_phone,
      manager_name,
      mobile_phone,
      representative_email,
      // 契約基本情報
      contract_type,
      contract_start_date,
      royalty_rate,
      // 請求基本情報
      invoice_number,
      bank_name,
      branch_name,
      account_type,
      account_number,
      account_holder,
      // 許認可情報
      license_status,
      license_type,
      license_number,
      license_file_path,
      // 連携ID
      line_official_id,
      representative_gmail,
      // ユーザーアカウント情報
      email,
      password,
      password_confirm,
    } = req.body;

    // 必須フィールドのチェック
    if (!name || name.trim() === "") {
      return res.status(400).send("店舗名は必須です");
    }

    // データ処理: 空文字列をNULLに変換
    const processedRoyaltyRate =
      royalty_rate && royalty_rate.trim() !== ""
        ? parseFloat(royalty_rate)
        : 5.0;
    const processedContractStartDate =
      contract_start_date && contract_start_date.trim() !== ""
        ? contract_start_date
        : null;

    // パスワード確認
    if (email && password && password !== password_confirm) {
      return res.status(400).send("パスワードが一致しません");
    }

    // メールアドレスの重複チェック
    if (email) {
      const { data: existingUsers, error: checkError } = await db
        .from("users")
        .select("id")
        .eq("email", email)
        .limit(1);

      if (checkError) {
        console.error("メールアドレス重複チェックエラー:", checkError);
        return res.status(500).send("DBエラー");
      }

      if (existingUsers && existingUsers.length > 0) {
        return res.status(400).send("このメールアドレスは既に使用されています");
      }
    }

    // 店舗データを作成
    const storeData = {
      name,
      business_address,
      main_phone,
      manager_name,
      mobile_phone,
      representative_email,
      contract_type,
      contract_start_date: processedContractStartDate,
      royalty_rate: processedRoyaltyRate,
      invoice_number,
      bank_name,
      branch_name,
      account_type,
      account_number,
      account_holder,
      license_status: license_status || "none",
      license_type,
      license_number,
      license_file_path,
      line_official_id,
      representative_gmail,
    };

    const { data: stores, error: storeError } = await db
      .from("stores")
      .insert(storeData)
      .select();

    if (storeError) {
      console.error("店舗作成エラー:", storeError);

      let errorMessage = "店舗の作成に失敗しました";
      if (storeError.code === "23505") {
        errorMessage = "重複する店舗名またはデータが存在しています。";
      } else if (storeError.code === "23503") {
        errorMessage = "関連するデータが存在しません。";
      } else if (process.env.NODE_ENV !== "production") {
        errorMessage += ` [詳細: ${storeError.message}]`;
      }

      return res.status(500).send(errorMessage);
    }

    const agencyId = stores[0].id;
    console.log(`店舗作成完了: ID=${agencyId}, 名前=${name}`);

    // ユーザーアカウントを作成（emailが指定されている場合）
    if (email && password) {
      const hashedPassword = await bcrypt.hash(password, 10);

      const { error: userError } = await db
        .from("users")
        .insert({
          email,
          password: hashedPassword,
          store_id: agencyId,
        });

      if (userError) {
        console.error("ユーザー作成エラー:", userError);

        if (userError.code === "23505") {
          return res
            .status(400)
            .send(
              `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
            );
        }

        return res
          .status(500)
          .send(`ユーザーアカウント作成エラー: ${userError.message}`);
      }

      console.log(`店舗ユーザーアカウント作成: ${email} (store_id: ${agencyId})`);
      return res.redirect(
        "/stores/list?message=" +
          encodeURIComponent("店舗とユーザーアカウントを作成しました")
      );
    }

    // メールアドレスが指定されていない場合は店舗のみ作成
    res.redirect(
      "/stores/list?message=" + encodeURIComponent("店舗を作成しました")
    );
  } catch (error) {
    console.error("新規登録エラー:", error);
    res.status(500).send("エラーが発生しました: " + error.message);
  }
});

// 編集（フォームPOST対応）
router.post("/edit/:id", requireRole(["admin"]), async (req, res) => {
  const {
    name,
    // 店舗基本情報
    business_address,
    main_phone,
    manager_name,
    mobile_phone,
    representative_email,
    // 契約基本情報
    contract_type,
    contract_start_date,
    royalty_rate,
    // 請求基本情報
    invoice_number,
    bank_name,
    branch_name,
    account_type,
    account_number,
    account_holder,
    // 許認可情報
    license_status,
    license_type,
    license_number,
    license_file_path,
    // 連携ID
    line_official_id,
    representative_gmail,
  } = req.body;

  try {
    // データ処理: 空文字列をNULLに変換
    const processedRoyaltyRate =
      royalty_rate && royalty_rate.trim() !== "" ? parseFloat(royalty_rate) : 5.0;
    const processedContractStartDate =
      contract_start_date && contract_start_date.trim() !== ""
        ? contract_start_date
        : null;

    const { error } = await db
      .from("stores")
      .update({
        name,
        business_address,
        main_phone,
        manager_name,
        mobile_phone,
        representative_email,
        contract_type,
        contract_start_date: processedContractStartDate,
        royalty_rate: processedRoyaltyRate,
        invoice_number,
        bank_name,
        branch_name,
        account_type,
        account_number,
        account_holder,
        license_status: license_status || "none",
        license_type,
        license_number,
        license_file_path,
        line_official_id,
        representative_gmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id);

    if (error) {
      console.error("店舗更新エラー:", error);
      return res.status(500).send("DBエラー: " + error.message);
    }

    console.log(`店舗更新完了: ID=${req.params.id}, 名前=${name}`);
    res.redirect(
      "/stores/list?success=" +
        encodeURIComponent(`店舗「${name}」を更新しました`)
    );
  } catch (error) {
    console.error("店舗更新エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

// 代理店削除（管理者のみ）
router.post("/delete/:id", requireRole(["admin"]), async (req, res) => {
  const agencyId = parseInt(req.params.id);

  try {
    // 代理店情報を取得
    const { data: stores, error: storeError } = await db
      .from("stores")
      .select("name")
      .eq("id", agencyId)
      .limit(1);

    if (storeError) {
      console.error("店舗取得エラー:", storeError);
      return res.status(500).send("DBエラー");
    }

    if (!stores || stores.length === 0) {
      return res.redirect(
        "/stores/list?error=" +
          encodeURIComponent("指定された代理店が見つかりません")
      );
    }

    const agency = stores[0];

    // 関連するユーザーアカウントを確認
    const { data: relatedUsers, error: usersError } = await db
      .from("users")
      .select("id, email")
      .eq("store_id", agencyId);

    if (usersError) {
      console.error("関連ユーザー確認エラー:", usersError);
    }

    if (relatedUsers && relatedUsers.length > 0) {
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

    // 関連データを順次削除（外部キー制約を考慮した順序）
    console.log(`代理店ID ${agencyId} の関連データ削除を開始`);

    // 削除対象テーブルの配列（削除順序重要：外部キー制約を考慮）
    const deleteTargets = [
      { name: "ユーザーアカウント", table: "users" },
      { name: "売上データ", table: "sales" },
      { name: "商品資料", table: "materials" },
      { name: "グループ所属", table: "group_members" },
      { name: "取り扱い商品", table: "store_products" },
      { name: "製品ファイル", table: "product_files" },
      { name: "顧客データ", table: "customers" },
      { name: "ロイヤリティ計算", table: "royalty_calculations" },
      { name: "ロイヤリティ設定", table: "royalty_settings" },
    ];

    // 各テーブルから関連データを削除
    for (const target of deleteTargets) {
      console.log(`${target.name}を削除中...`);
      const { error: deleteError } = await db
        .from(target.table)
        .delete()
        .eq("store_id", agencyId);

      if (deleteError) {
        console.error(`${target.name}削除エラー:`, deleteError);
        // エラーが発生してもログに記録して続行（外部キー制約により自動削除される場合もある）
      } else {
        console.log(`${target.name}削除完了`);
      }
    }

    // 特別処理：ユーザーアカウント削除時の詳細ログ
    if (relatedUsers && relatedUsers.length > 0) {
      relatedUsers.forEach((user) => {
        console.log(`削除されたユーザー: ID=${user.id}, Email=${user.email}`);
      });
    }

    console.log("すべての関連データ削除完了");

    // 最後に店舗本体を削除
    const { error: storeDeleteError } = await db
      .from("stores")
      .delete()
      .eq("id", agencyId);

    if (storeDeleteError) {
      console.error("代理店削除エラー:", storeDeleteError);
      return res.redirect(
        "/stores/list?error=" +
          encodeURIComponent("削除中にエラーが発生しました")
      );
    }

    console.log(`代理店「${agency.name}」(ID: ${agencyId}) を削除しました`);

    res.redirect(
      "/stores/list?success=" +
        encodeURIComponent(
          `「${agency.name}」の代理店データと関連するユーザーアカウントを削除しました`
        )
    );
  } catch (error) {
    console.error("店舗削除処理エラー:", error);
    return res.redirect(
      "/stores/list?error=" +
        encodeURIComponent("削除処理中にエラーが発生しました")
    );
  }
});

// 代理店プロフィール表示
router.get(
  "/profile/:id",
  requireRole(["admin", "agency"]),
  async (req, res) => {
    const agencyId = req.params.id;

    // 代理店ユーザーは自分のプロフィールのみ閲覧可能
    if (req.session.user.role === "agency") {
      if (req.session.user.store_id !== parseInt(agencyId)) {
        return res.status(403).send("自分のプロフィールのみ閲覧可能です");
      }
    }

    try {
      // 店舗情報を取得
      const { data: stores, error: storeError } = await db
        .from("stores")
        .select("*")
        .eq("id", agencyId)
        .limit(1);

      if (storeError || !stores || stores.length === 0) {
        console.error("店舗取得エラー:", storeError);
        return res.status(404).send("代理店が見つかりません");
      }

      const agency = stores[0];

      // グループ名を取得
      const { data: groupMembers } = await db
        .from("group_members")
        .select("group_id, groups(name)")
        .eq("store_id", agencyId)
        .limit(1);

      const groupName = groupMembers?.[0]?.groups?.name || null;

      // 商品はSupabaseでは使用しない
      agency.products = [];
      agency.group_name = groupName;

      res.render("agencies_profile", {
        agency,
        session: req.session,
        title: agency.name + "のプロフィール",
      });
    } catch (error) {
      console.error("代理店プロフィール表示エラー:", error);
      res.status(500).send("システムエラーが発生しました");
    }
  }
);

// 代理店プロフィール編集フォーム
router.get(
  "/profile/:id/edit",
  requireRole(["admin", "agency"]),
  async (req, res) => {
    const agencyId = req.params.id;

    // 代理店ユーザーは自分のプロフィールのみ編集可能
    if (req.session.user.role === "agency") {
      if (req.session.user.store_id !== parseInt(agencyId)) {
        return res.status(403).send("自分のプロフィールのみ編集可能です");
      }
    }

    try {
      const { data: stores, error } = await db
        .from("stores")
        .select("*")
        .eq("id", agencyId)
        .limit(1);

      if (error || !stores || stores.length === 0) {
        console.error("店舗取得エラー:", error);
        return res.status(404).send("代理店が見つかりません");
      }

      const agency = stores[0];

      // Supabaseでは store_products は使用しない
      agency.products = [];

      res.render("agencies_form", {
        agency,
        session: req.session,
        title: agency.name + "のプロフィール編集",
        isProfile: true,
      });
    } catch (error) {
      console.error("編集フォーム取得エラー:", error);
      return res.status(500).send(`エラー: ${error.message}`);
    }
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
      if (req.session.user.store_id !== parseInt(agencyId)) {
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
      product_names,
      product_details,
      product_urls,
      products, // 旧形式との互換性のため残す
      // 店舗基本情報
      manager_name,
      business_address,
      main_phone,
      mobile_phone,
      representative_email,
      // 契約基本情報
      contract_type,
      contract_start_date,
      royalty_rate,
      // 請求基本情報
      invoice_number,
      bank_name,
      branch_name,
      account_type,
      account_number,
      account_holder,
      // 許認可情報
      license_status,
      license_type,
      license_number,
      license_file_path,
      // 連携ID
      line_official_id,
      representative_gmail,
    } = req.body;

    // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
    const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
    const processedExperienceYears =
      experience_years && experience_years.trim() !== ""
        ? parseInt(experience_years)
        : null;
    const processedContractDate =
      contract_date && contract_date.trim() !== "" ? contract_date : null;
    // start_date は廃止（Supabaseスキーマ未定義）

    // 空文字はNULLに正規化
    const toNull = (v) =>
      v !== undefined && v !== null && String(v).trim() !== "" ? v : null;

    // 数値系（royalty_rate）は数値へ
    const normalizedRoyaltyRate =
      royalty_rate !== undefined && royalty_rate !== ""
        ? parseFloat(royalty_rate)
        : null;

    const updateSql = `
      UPDATE stores SET 
        name = ?,
        manager_name = ?,
        business_address = ?,
        main_phone = ?,
        mobile_phone = ?,
        representative_email = ?,
        contract_type = ?,
        contract_start_date = ?,
        royalty_rate = ?,
        invoice_number = ?,
        bank_name = ?,
        branch_name = ?,
        account_type = ?,
        account_number = ?,
        account_holder = ?,
        license_status = ?,
        license_type = ?,
        license_number = ?,
        license_file_path = ?,
        line_official_id = ?,
        representative_gmail = ?
      WHERE id = ?
    `;

    const updateParams = [
      toNull(name),
      toNull(manager_name),
      toNull(address || business_address),
      toNull(main_phone),
      toNull(mobile_phone),
      toNull(representative_email),
      toNull(contract_type),
      toNull(processedContractDate || contract_start_date),
      normalizedRoyaltyRate,
      toNull(invoice_number),
      toNull(bank_name),
      toNull(branch_name),
      toNull(account_type),
      toNull(account_number),
      toNull(account_holder),
      toNull(license_status),
      toNull(license_type),
      toNull(license_number),
      toNull(license_file_path),
      toNull(line_official_id),
      toNull(representative_gmail),
      agencyId,
    ];

    // Supabase対応: async/awaitで更新
    (async () => {
      try {
        const { error } = await db
          .from("stores")
          .update({
            name: toNull(name),
            manager_name: toNull(manager_name),
            business_address: toNull(address || business_address),
            main_phone: toNull(main_phone),
            mobile_phone: toNull(mobile_phone),
            representative_email: toNull(representative_email),
            contract_type: toNull(contract_type),
            contract_start_date: toNull(processedContractDate || contract_start_date),
            royalty_rate: normalizedRoyaltyRate,
            invoice_number: toNull(invoice_number),
            bank_name: toNull(bank_name),
            branch_name: toNull(branch_name),
            account_type: toNull(account_type),
            account_number: toNull(account_number),
            account_holder: toNull(account_holder),
            license_status: toNull(license_status),
            license_type: toNull(license_type),
            license_number: toNull(license_number),
            license_file_path: toNull(license_file_path),
            line_official_id: toNull(line_official_id),
            representative_gmail: toNull(representative_gmail),
            updated_at: new Date().toISOString(),
          })
          .eq("id", agencyId);

        if (error) {
          console.error("店舗更新エラー:", error);
          return res.status(500).send("DBエラー");
        }

        // Supabaseでは store_products は使用しない

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

      res.redirect("/stores/profile/" + agencyId);
    });
  }
);

// 代理店プロフィール作成フォーム（代理店ユーザー用）
router.get("/create-profile", requireRole(["agency"]), (req, res) => {
  // 既にプロフィールが存在する場合はリダイレクト
  if (req.session.user.store_id) {
    return res.redirect("/stores/profile/" + req.session.user.store_id);
  }

  res.render("agencies_form", {
    agency: null,
    session: req.session,
    title: "店舗プロフィール作成",
    isCreateProfile: true,
  });
});

// 代理店プロフィール作成（代理店ユーザー用）
router.post("/create-profile", requireRole(["agency"]), async (req, res) => {
  // 既にプロフィールが存在する場合はエラー
  if (req.session.user.store_id) {
    return res.status(400).send("既にプロフィールが存在します");
  }

  const {
    name,
    age,
    address,
    bank_info,
    experience_years,
    contract_date,
    product_names,
    product_details,
    product_urls,
    products, // 旧形式との互換性のため残す
  } = req.body;

  // PostgreSQL対応: 数値フィールドの空文字列をNULLに変換
  const processedAge = age && age.trim() !== "" ? parseInt(age) : null;
  const processedExperienceYears =
    experience_years && experience_years.trim() !== ""
      ? parseInt(experience_years)
      : null;
  const processedContractDate =
    contract_date && contract_date.trim() !== "" ? contract_date : null;
  // start_date は廃止（Supabaseスキーマ未定義）

  try {
    // Supabase環境での店舗作成
    const { data: stores, error: storeError } = await db
      .from("stores")
      .insert({
        name,
        business_address: address,
        bank_info,
        contract_start_date: processedContractDate,
      })
      .select();

    if (storeError) {
      console.error("店舗作成エラー:", storeError);
      return res.status(500).send(`DBエラー: ${storeError.message}`);
    }

    const agencyId = stores[0].id;

    // 新形式: 配列形式での商品データ処理
    if (
      product_names &&
      Array.isArray(product_names) &&
      product_names.length > 0
    ) {
      console.log("プロフィール作成: 新形式の商品データを処理");
      const productInserts = product_names
        .filter((productName) => productName && productName.trim() !== "")
        .map((productName) => ({
          store_id: agencyId,
          product_name: productName.trim(),
        }));

      if (productInserts.length > 0) {
        const { error: productError } = await db
          .from("store_products")
          .insert(productInserts);
        if (productError) {
          console.error("商品保存エラー:", productError);
        }
      }
    }
    // 旧形式: JSON文字列での商品データ処理（互換性のため）
    else if (products) {
      console.log("プロフィール作成: 旧形式の商品データを処理");
      const productList = Array.isArray(products) ? products : [products];
      const productInserts = [];

      for (const productStr of productList) {
        try {
          const product = JSON.parse(productStr);
          productInserts.push({
            store_id: agencyId,
            product_name: product.product_name,
          });
        } catch (parseErr) {
          console.error("商品データパースエラー:", parseErr);
          // JSON解析に失敗した場合は文字列として扱う
          productInserts.push({
            store_id: agencyId,
            product_name: productStr,
          });
        }
      }

      if (productInserts.length > 0) {
        const { error: productError } = await db
          .from("store_products")
          .insert(productInserts);
        if (productError) {
          console.error("商品保存エラー:", productError);
        }
      }
    }

    // ユーザーテーブルのstore_idを更新
    console.log("=== アカウント連携開始 ===");
    console.log("agencyId:", agencyId, "type:", typeof agencyId);
    console.log(
      "session.user.id:",
      req.session.user.id,
      "type:",
      typeof req.session.user.id
    );
    console.log("session.user:", req.session.user);

    const { error: updateError } = await db
      .from("users")
      .update({ store_id: agencyId })
      .eq("id", req.session.user.id);

    if (updateError) {
      console.error("=== ユーザーのstore_id更新エラー ===");
      console.error("エラー詳細:", updateError);
      console.error("エラーコード:", updateError.code);
      console.error("エラーメッセージ:", updateError.message);
      console.error("更新対象のagencyId:", agencyId);
      console.error("更新対象のuserId:", req.session.user.id);
      return res
        .status(500)
        .send(
          `プロフィール作成は完了しましたが、アカウント連携でエラーが発生しました。<br>エラー詳細: ${updateError.message}<br><a href="/">ダッシュボードに戻る</a>`
        );
    }

    console.log("=== アカウント連携成功 ===");

    // セッションのstore_idも更新
    req.session.user.store_id = agencyId;

    // プロフィール作成時のメール通知を送信
    const agencyData = {
      id: agencyId,
      name,
      age,
      address,
      bank_info,
      experience_years,
      contract_date,
    };

    const userData = {
      email: req.session.user.email,
      id: req.session.user.id,
    };

    // 非同期でメール送信（エラーがあってもリダイレクトは継続）
    sendProfileRegistrationNotification(agencyData, userData).catch((error) => {
      console.error("メール送信エラー:", error);
    });

    res.redirect("/stores/profile/" + agencyId);
  } catch (error) {
    console.error("プロフィール作成エラー:", error);
    return res.status(500).send(`プロフィール作成エラー: ${error.message}`);
  }
});

module.exports = router;
module.exports.checkAgencyIdIntegrity = checkAgencyIdIntegrity;
module.exports.fixAgencyIds = fixAgencyIds;
