const express = require("express");
const router = express.Router();
// Supabase接続を取得
const { getSupabaseClient } = require("../config/supabase");
const db = getSupabaseClient();
const crypto = require("crypto");

// パスワードハッシュ化関数
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 権限チェック機能
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// ID整合性チェック機能（管理者のみ）- Supabase対応
async function checkUserIdIntegrity(callback) {
  try {
    // 管理者一覧を取得（Supabase）
    const { data: admins, error: adminError } = await db
      .from("admins")
      .select("id, email")
      .order("email");

    if (adminError) {
      return callback(adminError, null);
    }

    const issues = [];
    let expectedId = 1;

    (admins || []).forEach((admin, index) => {
      if (admin.id !== expectedId) {
        issues.push({
          currentId: admin.id,
          expectedId: expectedId,
          email: admin.email,
          role: "admin",
        });
      }
      expectedId++;
    });

    callback(null, {
      totalUsers: admins?.length || 0,
      issues: issues,
      isIntegrityOk: issues.length === 0,
    });
  } catch (error) {
    console.error("ID整合性チェックエラー:", error);
    callback(error, null);
  }
}

// ID修正機能（PostgreSQL対応・管理者のみ）
// ID修正機能（管理者用）- Supabase対応
function fixUserIds(callback) {
  console.log("=== 管理者ID修正（Supabase環境） ===");
  console.log("Supabase環境ではIDは自動管理されるため、修正は不要です");

  // Supabaseでは自動インクリメントIDが自動管理されるため、何もせずに成功を返す
  callback(null);
}

// 管理者アカウント一覧表示（管理者のみ）
router.get("/list", requireRole(["admin"]), async (req, res) => {
  console.log("=== ユーザー管理ページアクセス ===");
  console.log("ユーザー:", req.session.user);

  // ユーザーIDの整合性をチェック
  try {
    await new Promise((resolve, reject) => {
      checkUserIdIntegrity((err, integrityInfo) => {
        if (err) {
          console.error("ユーザーID整合性チェックエラー:", err);
          integrityInfo = {
            totalUsers: 0,
            issues: [],
            isIntegrityOk: true,
          };
        }

        console.log("整合性チェック結果:", integrityInfo);

        // 管理者アカウントのID修正処理を無効化
        console.log("=== 管理者アカウントID修正処理は無効化されています ===");
        console.log("ID整合性の問題があっても自動修正は行いません");

        // 整合性チェック結果を表示するが、修正は行わない
        renderUsersList(req, res, integrityInfo);
        resolve();
      });
    });
  } catch (error) {
    console.error("ユーザー管理ページエラー:", error);
    res.status(500).send("システムエラー");
  }
});

// ユーザー一覧画面の描画関数（Supabase対応）
async function renderUsersList(req, res, integrityInfo, autoFixMessage = null) {
  try {
    // 管理者一覧を取得（Supabase）
    const { data: admins, error: adminError } = await db
      .from("admins")
      .select("id, email, created_at")
      .order("id");

    if (adminError) {
      console.error("管理者一覧取得エラー:", adminError);
      return res.status(500).send("DBエラー: " + adminError.message);
    }

    console.log("管理者一覧取得完了:", admins?.length || 0, "件");

    // 成功・エラーメッセージを取得
    const success = req.query.success;
    const error = req.query.error;

    try {
      res.render("users_list", {
        users: admins || [], // 管理者データをusersとして渡す（テンプレート互換性のため）
        admins: admins || [],
        integrityInfo,
        autoFixMessage,
        success: success,
        error: error,
        session: req.session,
        title: "管理者アカウント管理",
      });
    } catch (renderError) {
      console.error("レンダリングエラー:", renderError);
      res.status(500).send("レンダリングエラー: " + renderError.message);
    }
  } catch (error) {
    console.error("管理者一覧取得処理エラー:", error);
    res.status(500).send("システムエラー: " + error.message);
  }
}

// 新規アカウント作成画面
router.get("/new", requireRole(["admin"]), (req, res) => {
  res.render("users_form", {
    user: null,
    session: req.session,
    title: "新規管理者アカウント作成",
  });
});

// 管理者アカウント追加
router.post("/", requireRole(["admin"]), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.render("users_form", {
      user: null,
      error: "必須項目が不足しています",
      session: req.session,
      title: "新規管理者アカウント作成",
    });

  try {
    // 管理者数を確認
    const { count, error: countError } = await db
      .from("admins")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("管理者数確認エラー:", countError);
      return res.status(500).send("DBエラー");
    }

    if (count >= 5) {
      return res.render("users_form", {
        user: null,
        error: "管理者アカウントは5つまでです",
        session: req.session,
        title: "新規管理者アカウント作成",
      });
    }

    // 本番環境ではパスワードをハッシュ化
    const hashedPassword =
      process.env.NODE_ENV === "production" ? hashPassword(password) : password;

    console.log("管理者アカウント作成:", { email, role: "admin" });

    const { data, error } = await db
      .from("admins")
      .insert({ email, password: hashedPassword })
      .select();

    if (error) {
      console.error("管理者アカウント作成エラー:", error);

      if (error.code === "23505") {
        return res.render("users_form", {
          user: null,
          error: `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`,
          session: req.session,
          title: "新規管理者アカウント作成",
        });
      }

      return res.render("users_form", {
        user: null,
        error: `アカウント作成に失敗しました: ${error.message}`,
        session: req.session,
        title: "新規管理者アカウント作成",
      });
    }

    console.log("管理者アカウント作成成功:", email);
    res.redirect("/users/list");
  } catch (error) {
    console.error("管理者アカウント作成エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

// 新規ユーザー作成（管理者のみ）
router.post("/create", requireRole(["admin"]), async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "全ての項目を入力してください",
    });
  }

  if (password.length < 4) {
    return res.status(400).json({
      success: false,
      message: "パスワードは4文字以上で入力してください",
    });
  }

  try {
    // 本番環境ではパスワードをハッシュ化
    const hashedPassword =
      process.env.NODE_ENV === "production" ? hashPassword(password) : password;

    // 管理者アカウントの場合はadminsテーブルに挿入
    if (role === "admin") {
      const { data, error } = await db
        .from("admins")
        .insert({ email, password: hashedPassword })
        .select();

      if (error) {
        console.error("管理者作成エラー:", error);

        if (error.code === "23505") {
          return res
            .status(400)
            .send(
              `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
            );
        }

        return res.status(500).send(`管理者作成エラー: ${error.message}`);
      }

      res.json({
        success: true,
        message: "管理者が正常に作成されました",
        userId: data[0].id,
      });
    } else {
      // 代理店アカウントの場合はusersテーブルに挿入
      const { data, error } = await db
        .from("users")
        .insert({ email, password: hashedPassword, store_id: null })
        .select();

      if (error) {
        console.error("代理店ユーザー作成エラー:", error);

        if (error.code === "23505") {
          return res
            .status(400)
            .send(
              `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
            );
        }

        return res
          .status(500)
          .send(`代理店ユーザー作成エラー: ${error.message}`);
      }

      res.json({
        success: true,
        message: "代理店ユーザーが正常に作成されました",
        userId: data[0].id,
      });
    }
  } catch (error) {
    console.error("ユーザー作成エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

// Webインターフェースでのアカウント削除
router.post("/delete/:id", requireRole(["admin"]), async (req, res) => {
  const adminId = req.params.id;

  // 自分自身を削除しようとしていないかチェック
  if (req.session.user.id == adminId) {
    return res.redirect(
      "/users/list?error=" +
        encodeURIComponent("自分自身のアカウントは削除できません")
    );
  }

  try {
    // 管理者情報を取得
    const { data: admins, error: fetchError } = await db
      .from("admins")
      .select("*")
      .eq("id", adminId)
      .limit(1);

    if (fetchError) {
      console.error("管理者取得エラー:", fetchError);
      return res.status(500).send("DBエラー");
    }

    if (!admins || admins.length === 0) {
      return res.redirect(
        "/users/list?error=" +
          encodeURIComponent("指定された管理者が見つかりません")
      );
    }

    const admin = admins[0];

    const { error: deleteError } = await db
      .from("admins")
      .delete()
      .eq("id", adminId);

    if (deleteError) {
      console.error("管理者削除エラー:", deleteError);
      return res.status(500).send("削除エラー");
    }

    console.log(`管理者削除完了: ${admin.email} (ID: ${adminId})`);
    console.log("=== 管理者削除後のID自動修正処理は無効化されています ===");

    // ID修正処理を無効化し、削除完了メッセージのみ表示
    res.redirect(
      "/users/list?success=" +
        encodeURIComponent(`${admin.email} のアカウントを削除しました`)
    );
  } catch (error) {
    console.error("管理者削除エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

// API: アカウント削除（従来の機能を維持）
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await db.from("users").delete().eq("id", req.params.id);

    if (error) {
      console.error("ユーザー削除エラー:", error);
      return res.status(500).send("DBエラー");
    }

    res.send("削除完了");
  } catch (error) {
    console.error("ユーザー削除エラー:", error);
    return res.status(500).send(`エラー: ${error.message}`);
  }
});

module.exports = router;
