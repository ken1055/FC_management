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

// 売上一覧取得（API）
router.get("/", (req, res) => {
  if (req.session.user.role === "agency") {
    // 代理店は自分のデータのみ
    if (!req.session.user.agency_id) {
      return res.status(400).send("代理店IDが設定されていません");
    }
    db.all(
      "SELECT * FROM sales WHERE agency_id = ? ORDER BY year DESC, month DESC",
      [req.session.user.agency_id],
      (err, rows) => {
        if (err) return res.status(500).send("DBエラー");
        res.json(rows);
      }
    );
  } else {
    // 役員・管理者は全て
    db.all(
      "SELECT s.*, a.name as agency_name FROM sales s LEFT JOIN agencies a ON s.agency_id = a.id ORDER BY s.year DESC, s.month DESC",
      [],
      (err, rows) => {
        if (err) return res.status(500).send("DBエラー");
        res.json(rows);
      }
    );
  }
});

// 売上登録（API）
router.post("/", requireRole(["executive", "admin", "agency"]), (req, res) => {
  const { agency_id, year, month, amount } = req.body;

  // 代理店は自分のagency_idのみ登録可能
  if (req.session.user.role === "agency") {
    if (!req.session.user.agency_id) {
      return res.status(400).send("代理店IDが設定されていません");
    }
    if (req.session.user.agency_id !== Number(agency_id)) {
      return res.status(403).send("自分の売上のみ登録可能です");
    }
  }

  // 重複チェック
  db.get(
    "SELECT id FROM sales WHERE agency_id = ? AND year = ? AND month = ?",
    [agency_id, year, month],
    (err, existing) => {
      if (err) return res.status(500).send("DBエラー");
      if (existing) {
        return res.status(400).send("同じ年月の売上データが既に存在します");
      }

      db.run(
        "INSERT INTO sales (agency_id, year, month, amount) VALUES (?, ?, ?, ?)",
        [agency_id, year, month, amount],
        function (err) {
          if (err) return res.status(500).send("DBエラー");
          res.json({ id: this.lastID });
        }
      );
    }
  );
});

// 売上管理画面（一覧・可視化）
router.get(
  "/list",
  requireRole(["executive", "admin", "agency"]),
  (req, res) => {
    if (req.session.user.role === "agency") {
      // 代理店は自分のデータのみ
      if (!req.session.user.agency_id) {
        return res.redirect("/agencies/create-profile");
      }

      // 代理店情報を取得
      db.get(
        "SELECT name FROM agencies WHERE id = ?",
        [req.session.user.agency_id],
        (err, agency) => {
          if (err) return res.status(500).send("DBエラー");

          // 売上データを取得
          db.all(
            "SELECT * FROM sales WHERE agency_id = ? ORDER BY year DESC, month DESC",
            [req.session.user.agency_id],
            (err, sales) => {
              if (err) return res.status(500).send("DBエラー");

              // 月間売上推移データを作成
              const chartData = sales.reverse().map((s) => ({
                period: `${s.year}年${s.month}月`,
                amount: s.amount,
              }));

              res.render("sales_list", {
                sales: sales.reverse(),
                chartData: JSON.stringify(chartData),
                agencyName: agency ? agency.name : "未設定",
                groups: [],
                selectedGroupId: null,
                session: req.session,
                title: "売上管理",
              });
            }
          );
        }
      );
    } else {
      // 管理者・役員は代理店選択画面を表示
      db.all(
        `SELECT 
          a.id, 
          a.name,
          COUNT(s.id) as sales_count,
          SUM(s.amount) as total_sales
        FROM agencies a 
        LEFT JOIN sales s ON a.id = s.agency_id 
        GROUP BY a.id, a.name 
        ORDER BY a.name`,
        [],
        (err, agencies) => {
          if (err) return res.status(500).send("DBエラー");

          res.render("sales_agency_list", {
            agencies,
            session: req.session,
            title: "売上管理 - 代理店選択",
          });
        }
      );
    }
  }
);

// 個別代理店の売上表示
router.get("/agency/:id", requireRole(["executive", "admin"]), (req, res) => {
  const agencyId = req.params.id;

  // 代理店情報を取得
  db.get(
    "SELECT name FROM agencies WHERE id = ?",
    [agencyId],
    (err, agency) => {
      if (err || !agency) return res.status(404).send("代理店が見つかりません");

      // 売上データを取得
      db.all(
        "SELECT * FROM sales WHERE agency_id = ? ORDER BY year DESC, month DESC",
        [agencyId],
        (err, sales) => {
          if (err) return res.status(500).send("DBエラー");

          // 月間売上推移データを作成
          const chartData = sales.reverse().map((s) => ({
            period: `${s.year}年${s.month}月`,
            amount: s.amount,
          }));

          res.render("sales_list", {
            sales: sales.reverse(),
            chartData: JSON.stringify(chartData),
            agencyName: agency.name,
            agencyId: agencyId,
            groups: [],
            selectedGroupId: null,
            session: req.session,
            title: `${agency.name}の売上管理`,
            isAdmin: true,
          });
        }
      );
    }
  );
});

// 売上登録フォーム
router.get(
  "/new",
  requireRole(["executive", "admin", "agency"]),
  (req, res) => {
    const preselectedAgencyId = req.query.agency_id; // クエリパラメータから代理店IDを取得

    if (req.session.user.role === "agency") {
      if (!req.session.user.agency_id) {
        return res.redirect("/agencies/create-profile");
      }

      // 代理店情報を取得
      db.get(
        "SELECT name FROM agencies WHERE id = ?",
        [req.session.user.agency_id],
        (err, agency) => {
          if (err) return res.status(500).send("DBエラー");

          res.render("sales_form", {
            session: req.session,
            agencies: [],
            agencyName: agency ? agency.name : "未設定",
            title: "売上登録",
          });
        }
      );
    } else {
      // 管理者は代理店一覧を取得
      db.all("SELECT * FROM agencies ORDER BY name", [], (err, agencies) => {
        if (err) return res.status(500).send("DBエラー");

        // 事前選択された代理店の情報を取得
        let preselectedAgency = null;
        if (preselectedAgencyId) {
          preselectedAgency = agencies.find((a) => a.id == preselectedAgencyId);
        }

        res.render("sales_form", {
          session: req.session,
          agencies,
          agencyName: null,
          preselectedAgencyId: preselectedAgencyId,
          preselectedAgencyName: preselectedAgency
            ? preselectedAgency.name
            : null,
          title: "売上登録",
        });
      });
    }
  }
);

// 売上登録（フォームPOST）
router.post(
  "/new",
  requireRole(["executive", "admin", "agency"]),
  (req, res) => {
    const { agency_id, year, month, amount } = req.body;

    if (req.session.user.role === "agency") {
      if (!req.session.user.agency_id) {
        return res.status(400).send("代理店IDが設定されていません");
      }
      if (req.session.user.agency_id !== Number(agency_id)) {
        return res.status(403).send("自分の売上のみ登録可能です");
      }
    }

    // 重複チェック
    db.get(
      "SELECT id FROM sales WHERE agency_id = ? AND year = ? AND month = ?",
      [agency_id, year, month],
      (err, existing) => {
        if (err) return res.status(500).send("DBエラー");
        if (existing) {
          return res.render("sales_form", {
            session: req.session,
            agencies: [],
            agencyName: null,
            title: "売上登録",
            error: "同じ年月の売上データが既に存在します",
          });
        }

        db.run(
          "INSERT INTO sales (agency_id, year, month, amount) VALUES (?, ?, ?, ?)",
          [agency_id, year, month, amount],
          function (err) {
            if (err) return res.status(500).send("DBエラー");
            res.redirect("/sales/list");
          }
        );
      }
    );
  }
);

// 売上編集フォーム
router.get(
  "/edit/:id",
  requireRole(["executive", "admin", "agency"]),
  (req, res) => {
    db.get("SELECT * FROM sales WHERE id = ?", [req.params.id], (err, sale) => {
      if (err || !sale) return res.status(404).send("データがありません");

      // 代理店は自分のデータのみ編集可能
      if (req.session.user.role === "agency") {
        if (sale.agency_id !== req.session.user.agency_id) {
          return res.status(403).send("自分の売上のみ編集可能です");
        }
      }

      if (req.session.user.role === "agency") {
        db.get(
          "SELECT name FROM agencies WHERE id = ?",
          [sale.agency_id],
          (err, agency) => {
            if (err) return res.status(500).send("DBエラー");

            res.render("sales_form", {
              session: req.session,
              agencies: [],
              agencyName: agency ? agency.name : "未設定",
              sale: sale,
              title: "売上編集",
            });
          }
        );
      } else {
        db.all("SELECT * FROM agencies ORDER BY name", [], (err, agencies) => {
          if (err) return res.status(500).send("DBエラー");
          res.render("sales_form", {
            session: req.session,
            agencies,
            agencyName: null,
            sale: sale,
            title: "売上編集",
          });
        });
      }
    });
  }
);

// 売上編集（フォームPOST）
router.post(
  "/edit/:id",
  requireRole(["executive", "admin", "agency"]),
  (req, res) => {
    const { agency_id, year, month, amount } = req.body;

    db.get("SELECT * FROM sales WHERE id = ?", [req.params.id], (err, sale) => {
      if (err || !sale) return res.status(404).send("データがありません");

      // 代理店は自分のデータのみ編集可能
      if (req.session.user.role === "agency") {
        if (sale.agency_id !== req.session.user.agency_id) {
          return res.status(403).send("自分の売上のみ編集可能です");
        }
      }

      db.run(
        "UPDATE sales SET agency_id=?, year=?, month=?, amount=? WHERE id=?",
        [agency_id, year, month, amount, req.params.id],
        function (err) {
          if (err) return res.status(500).send("DBエラー");
          res.redirect("/sales/list");
        }
      );
    });
  }
);

// 売上削除
router.post(
  "/delete/:id",
  requireRole(["executive", "admin", "agency"]),
  (req, res) => {
    db.get("SELECT * FROM sales WHERE id = ?", [req.params.id], (err, sale) => {
      if (err || !sale) return res.status(404).send("データがありません");

      // 代理店は自分のデータのみ削除可能
      if (req.session.user.role === "agency") {
        if (sale.agency_id !== req.session.user.agency_id) {
          return res.status(403).send("自分の売上のみ削除可能です");
        }
      }

      db.run("DELETE FROM sales WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).send("DBエラー");
        res.redirect("/sales/list");
      });
    });
  }
);

module.exports = router;
