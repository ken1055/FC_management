const express = require("express");
const router = express.Router();
const { getSupabaseClient } = require("../config/supabase");

// Supabase接続（Vercel + Supabase専用）
const db = getSupabaseClient();

// 権限チェック関数
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect("/login");
    }
    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).send("アクセス権限がありません");
    }
    next();
  };
}

// 設定一覧表示
router.get("/", requireRole(["admin"]), async (req, res) => {
  try {
    // 公式ラインURLを取得
    const { data, error } = await db
      .from("system_settings")
      .select("value")
      .eq("key", "official_line_url")
      .limit(1);

    if (error) {
      console.error("設定取得エラー:", error);
      return res.status(500).send("設定取得エラー");
    }

    const officialLineUrl = data && data.length > 0 ? data[0].value : "";

    res.render("settings/index", {
      session: req.session,
      title: "システム設定",
      officialLineUrl,
    });
  } catch (error) {
    console.error("設定取得エラー:", error);
    return res.status(500).send("設定取得エラー");
  }
});

// 公式LINE URL設定
router.post("/official-line", requireRole(["admin"]), async (req, res) => {
  const { url } = req.body;

  console.log("=== 公式LINE URL設定保存 ===");
  console.log("受信したURL:", url);
  console.log("管理者:", req.session?.user?.email);

  // URLの妥当性チェック（簡単な形式チェック）
  if (url && !url.match(/^https?:\/\/.+/)) {
    console.log("URL形式エラー:", url);
    return res.status(400).send("有効なURLを入力してください");
  }

  try {
    // Supabase用のUPSERT
    console.log("Supabase用クエリ実行中...");
    const { error } = await db
      .from("system_settings")
      .upsert(
        {
          key: "official_line_url",
          value: url || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      console.error("Supabase設定保存エラー:", error);
      return res.status(500).send("設定保存エラー");
    }

    console.log("Supabase設定保存成功:", url);
    res.redirect("/settings?success=1");
  } catch (error) {
    console.error("設定保存エラー:", error);
    return res.status(500).send("設定保存エラー");
  }
});

// 公式LINE URL取得API（代理店用）
router.get("/api/official-line-url", async (req, res) => {
  console.log("=== 公式LINE URL API呼び出し ===");
  console.log("リクエスト元:", req.headers["user-agent"]);
  console.log("セッション情報:", req.session?.user?.role);

  try {
    // Supabase環境で公式LINE URL取得
    console.log("Supabase環境で公式LINE URL取得");
    const { data, error } = await db
      .from("system_settings")
      .select("value")
      .eq("key", "official_line_url")
      .limit(1);

    if (error) {
      console.error("Supabase設定取得エラー:", error);
      return res.status(500).json({ error: "設定取得エラー" });
    }

    console.log("データベース取得結果:", data);
    const url = data && data.length > 0 ? data[0].value : null;
    console.log("返送するURL:", url);

    res.json({
      url: url,
    });
  } catch (error) {
    console.error("公式LINE URL取得エラー:", error);
    res.status(500).json({ error: "システムエラー" });
  }
});

module.exports = router;
