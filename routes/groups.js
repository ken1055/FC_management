const express = require("express");
const router = express.Router();
const { getSupabaseClient } = require("../config/supabase");

// Supabase接続（Vercel + Supabase専用）
const db = getSupabaseClient();

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// グループ一覧表示
router.get("/list", requireRole(["admin"]), async (req, res) => {
  try {
    // グループを取得
    const { data: groups, error: groupsError } = await db
      .from("groups")
      .select("id, name")
      .order("name", { ascending: true });

    if (groupsError) {
      console.error("グループ取得エラー:", groupsError);
      return res.status(500).send("DBエラー");
    }

    // 各グループの所属店舗数を取得
    const groupsWithCounts = [];
    for (const group of groups || []) {
      const { count, error: countError } = await db
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", group.id);

      if (countError) {
        console.error("所属数取得エラー:", countError);
      }

      groupsWithCounts.push({
        id: group.id,
        name: group.name,
        agency_count: count || 0,
      });
    }

    res.render("groups_list", {
      groups: groupsWithCounts,
      session: req.session,
      title: "グループ管理",
    });
  } catch (error) {
    console.error("グループ一覧取得エラー:", error);
    return res.status(500).send("DBエラー");
  }
});

// グループ新規作成フォーム
router.get("/new", requireRole(["admin"]), (req, res) => {
  res.render("groups_form", {
    group: null,
    session: req.session,
    title: "グループ新規作成",
  });
});

// グループ編集フォーム
router.get("/edit/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const { data: groups, error } = await db
      .from("groups")
      .select("*")
      .eq("id", req.params.id)
      .limit(1);

    if (error || !groups || groups.length === 0) {
      return res.status(404).send("グループが見つかりません");
    }

    res.render("groups_form", {
      group: groups[0],
      session: req.session,
      title: "グループ編集",
    });
  } catch (error) {
    console.error("グループ取得エラー:", error);
    return res.status(500).send("DBエラー");
  }
});

// グループ作成
router.post("/new", requireRole(["admin"]), async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.render("groups_form", {
      group: null,
      session: req.session,
      title: "グループ新規作成",
      error: "グループ名を入力してください",
    });
  }

  try {
    const { error } = await db.from("groups").insert({ name });

    if (error) {
      console.error("グループ作成エラー:", error);
      return res.status(500).send("DBエラー");
    }

    res.redirect("/groups/list");
  } catch (error) {
    console.error("グループ作成エラー:", error);
    return res.status(500).send("DBエラー");
  }
});

// グループ更新
router.post("/edit/:id", requireRole(["admin"]), async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    try {
      const { data: groups, error } = await db
        .from("groups")
        .select("*")
        .eq("id", req.params.id)
        .limit(1);

      if (error || !groups || groups.length === 0) {
        return res.status(404).send("グループが見つかりません");
      }

      return res.render("groups_form", {
        group: groups[0],
        session: req.session,
        title: "グループ編集",
        error: "グループ名を入力してください",
      });
    } catch (error) {
      console.error("グループ取得エラー:", error);
      return res.status(500).send("DBエラー");
    }
  }

  try {
    const { error } = await db
      .from("groups")
      .update({ name })
      .eq("id", req.params.id);

    if (error) {
      console.error("グループ更新エラー:", error);
      return res.status(500).send("DBエラー");
    }

    res.redirect("/groups/list");
  } catch (error) {
    console.error("グループ更新エラー:", error);
    return res.status(500).send("DBエラー");
  }
});

// グループ削除
router.post("/delete/:id", requireRole(["admin"]), async (req, res) => {
  try {
    // まず関連する代理店の割り当てを削除
    const { error: membersError } = await db
      .from("group_members")
      .delete()
      .eq("group_id", req.params.id);

    if (membersError) {
      console.error("グループメンバー削除エラー:", membersError);
      return res.status(500).send("DBエラー");
    }

    // グループを削除
    const { error: groupError } = await db
      .from("groups")
      .delete()
      .eq("id", req.params.id);

    if (groupError) {
      console.error("グループ削除エラー:", groupError);
      return res.status(500).send("DBエラー");
    }

    res.redirect("/groups/list");
  } catch (error) {
    console.error("グループ削除エラー:", error);
    return res.status(500).send("DBエラー");
  }
});

// グループの代理店管理画面
router.get("/manage/:id", requireRole(["admin"]), async (req, res) => {
  const groupId = req.params.id;

  try {
    // グループ情報を取得
    const { data: groups, error: groupError } = await db
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .limit(1);

    if (groupError || !groups || groups.length === 0) {
      return res.status(404).send("グループが見つかりません");
    }

    const group = groups[0];

    // グループに所属している代理店を取得
    const { data: members, error: membersError } = await db
      .from("group_members")
      .select("store_id")
      .eq("group_id", groupId);

    if (membersError) {
      console.error("グループメンバー取得エラー:", membersError);
      return res.status(500).send("DBエラー");
    }

    const memberStoreIds = (members || []).map((m) => m.store_id);

    // 所属している店舗の情報を取得
    let groupAgencies = [];
    if (memberStoreIds.length > 0) {
      const { data: stores, error: storesError } = await db
        .from("stores")
        .select("id, name")
        .in("id", memberStoreIds)
        .order("name", { ascending: true });

      if (storesError) {
        console.error("店舗取得エラー:", storesError);
        return res.status(500).send("DBエラー");
      }

      groupAgencies = stores || [];
    }

    // 全ての店舗を取得
    const { data: allStores, error: allStoresError } = await db
      .from("stores")
      .select("id, name")
      .order("name", { ascending: true });

    if (allStoresError) {
      console.error("全店舗取得エラー:", allStoresError);
      return res.status(500).send("DBエラー");
    }

    // 所属していない店舗をフィルタリング
    const availableAgencies = (allStores || []).filter(
      (store) => !memberStoreIds.includes(store.id)
    );

    res.render("groups_manage", {
      group,
      groupAgencies,
      availableAgencies,
      session: req.session,
      title: `${group.name} - 代理店管理`,
    });
  } catch (error) {
    console.error("グループ管理画面エラー:", error);
    return res.status(500).send("DBエラー");
  }
});

// 代理店をグループに追加
router.post("/add-agency/:id", requireRole(["admin"]), async (req, res) => {
  const groupId = req.params.id;
  const { store_id } = req.body;

  if (!store_id) {
    return res.redirect(`/groups/manage/${groupId}`);
  }

  console.log("グループ代理店追加:", { groupId, store_id });

  try {
    // 既存の関連をチェック
    const { data: existing, error: checkError } = await db
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .eq("store_id", store_id)
      .limit(1);

    if (checkError) {
      console.error("既存チェックエラー:", checkError);
      return res.status(500).send(`DBエラー: ${checkError.message}`);
    }

    if (existing && existing.length > 0) {
      console.log("既に関連が存在します");
      return res.redirect(`/groups/manage/${groupId}`);
    }

    // 新しい関連を作成
    const { error: insertError } = await db
      .from("group_members")
      .insert({ group_id: groupId, store_id: store_id });

    if (insertError) {
      console.error("グループ代理店追加エラー:", insertError);
      return res.status(500).send(`DBエラー: ${insertError.message}`);
    }

    console.log("グループ代理店追加成功");
    res.redirect(`/groups/manage/${groupId}`);
  } catch (error) {
    console.error("グループ代理店追加エラー:", error);
    return res.status(500).send(`DBエラー: ${error.message}`);
  }
});

// 代理店をグループから削除
router.post(
  "/remove-agency/:groupId/:agencyId",
  requireRole(["admin"]),
  async (req, res) => {
    const { groupId, agencyId } = req.params;
    console.log("グループ代理店削除: ", { groupId, agencyId });

    try {
      const { error } = await db
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("store_id", agencyId);

      if (error) {
        console.error("グループ代理店削除エラー:", error);
        return res.status(500).send(`DBエラー: ${error.message}`);
      }

      console.log("グループ代理店削除成功");
      res.redirect(`/groups/manage/${groupId}`);
    } catch (error) {
      console.error("グループ代理店削除エラー:", error);
      return res.status(500).send(`DBエラー: ${error.message}`);
    }
  }
);

module.exports = router;
