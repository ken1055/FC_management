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

// グループ一覧表示
router.get("/list", requireRole(["admin"]), (req, res) => {
  db.all(
    `SELECT 
      g.id, 
      g.name, 
      COUNT(ga.store_id) as agency_count
    FROM groups g 
    LEFT JOIN group_members ga ON g.id = ga.group_id 
    GROUP BY g.id, g.name 
    ORDER BY g.name`,
    [],
    (err, groups) => {
      if (err) return res.status(500).send("DBエラー");

      res.render("groups_list", {
        groups,
        session: req.session,
        title: "グループ管理",
      });
    }
  );
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
router.get("/edit/:id", requireRole(["admin"]), (req, res) => {
  db.get("SELECT * FROM groups WHERE id = ?", [req.params.id], (err, group) => {
    if (err || !group) return res.status(404).send("グループが見つかりません");

    res.render("groups_form", {
      group,
      session: req.session,
      title: "グループ編集",
    });
  });
});

// グループ作成
router.post("/new", requireRole(["admin"]), (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.render("groups_form", {
      group: null,
      session: req.session,
      title: "グループ新規作成",
      error: "グループ名を入力してください",
    });
  }

  db.run("INSERT INTO groups (name) VALUES (?)", [name], function (err) {
    if (err) return res.status(500).send("DBエラー");
    res.redirect("/groups/list");
  });
});

// グループ更新
router.post("/edit/:id", requireRole(["admin"]), (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return db.get(
      "SELECT * FROM groups WHERE id = ?",
      [req.params.id],
      (err, group) => {
        if (err || !group)
          return res.status(404).send("グループが見つかりません");

        res.render("groups_form", {
          group,
          session: req.session,
          title: "グループ編集",
          error: "グループ名を入力してください",
        });
      }
    );
  }

  db.run(
    "UPDATE groups SET name = ? WHERE id = ?",
    [name, req.params.id],
    function (err) {
      if (err) return res.status(500).send("DBエラー");
      res.redirect("/groups/list");
    }
  );
});

// グループ削除
router.post("/delete/:id", requireRole(["admin"]), (req, res) => {
  // まず関連する代理店の割り当てを削除
  db.run(
    "DELETE FROM group_store WHERE group_id = ?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).send("DBエラー");

      // グループを削除
      db.run(
        "DELETE FROM groups WHERE id = ?",
        [req.params.id],
        function (err) {
          if (err) return res.status(500).send("DBエラー");
          res.redirect("/groups/list");
        }
      );
    }
  );
});

// グループの代理店管理画面
router.get("/manage/:id", requireRole(["admin"]), (req, res) => {
  const groupId = req.params.id;

  // グループ情報を取得
  db.get("SELECT * FROM groups WHERE id = ?", [groupId], (err, group) => {
    if (err || !group) return res.status(404).send("グループが見つかりません");

    // グループに所属している代理店を取得
    db.all(
      `SELECT a.id, a.name 
       FROM stores a 
       INNER JOIN group_members ga ON a.id = ga.store_id 
       WHERE ga.group_id = ? 
       ORDER BY a.name`,
      [groupId],
      (err, groupAgencies) => {
        if (err) return res.status(500).send("DBエラー");

        // グループに所属していない代理店を取得
        db.all(
          `SELECT a.id, a.name 
           FROM stores a 
           WHERE a.id NOT IN (
             SELECT ga.store_id 
             FROM group_members ga 
             WHERE ga.group_id = ?
           ) 
           ORDER BY a.name`,
          [groupId],
          (err, availableAgencies) => {
            if (err) return res.status(500).send("DBエラー");

            res.render("groups_manage", {
              group,
              groupAgencies,
              availableAgencies,
              session: req.session,
              title: `${group.name} - 代理店管理`,
            });
          }
        );
      }
    );
  });
});

// 代理店をグループに追加
router.post("/add-agency/:id", requireRole(["admin"]), (req, res) => {
  const groupId = req.params.id;
  const { store_id } = req.body;

  if (!store_id) {
    return res.redirect(`/groups/manage/${groupId}`);
  }

  console.log("グループ代理店追加:", { groupId, store_id });

  // 既存の関連をチェック
  db.get(
    "SELECT * FROM group_members WHERE group_id = ? AND store_id = ?",
    [groupId, store_id],
    (err, existing) => {
      if (err) {
        console.error("既存チェックエラー:", err);
        return res.status(500).send(`DBエラー: ${err.message}`);
      }

      if (existing) {
        console.log("既に関連が存在します");
        return res.redirect(`/groups/manage/${groupId}`);
      }

      // 新しい関連を作成
      db.run(
        "INSERT INTO group_members (group_id, store_id) VALUES (?, ?)",
        [groupId, store_id],
        function (err) {
          if (err) {
            console.error("グループ代理店追加エラー:", err);
            return res.status(500).send(`DBエラー: ${err.message}`);
          }
          console.log("グループ代理店追加成功");
          res.redirect(`/groups/manage/${groupId}`);
        }
      );
    }
  );
});

// 代理店をグループから削除
router.post(
  "/remove-agency/:groupId/:agencyId",
  requireRole(["admin"]),
  (req, res) => {
    const { groupId, agencyId } = req.params;

    db.run(
      "DELETE FROM group_members WHERE group_id = ? AND store_id = ?",
      [groupId, agencyId],
      function (err) {
        if (err) return res.status(500).send("DBエラー");
        res.redirect(`/groups/manage/${groupId}`);
      }
    );
  }
);

module.exports = router;
