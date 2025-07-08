const express = require("express");
const router = express.Router();
const db = require("../db");

// ログイン画面
router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// ログイン処理
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE email=? AND password=?",
    [email, password],
    (err, user) => {
      if (user) {
        req.session.user = {
          id: user.id,
          role: user.role,
          agency_id: user.agency_id,
        };
        // 権限に応じてリダイレクト
        res.redirect("/");
      } else {
        res.render("login", {
          error: "メールアドレスまたはパスワードが違います",
        });
      }
    }
  );
});

// ログアウト
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
});

// 新規登録画面
router.get("/register", (req, res) => {
  res.render("register", { error: null });
});

// 新規登録処理
router.post("/register", (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.render("register", { error: "全ての項目を入力してください" });
  }
  // 代理店の場合はagency_idを自動で付与（例: nullまたは新規作成時に別途対応）
  let agency_id = null;
  if (role === "agency") agency_id = null; // 必要に応じて割り当て
  // 役員・管理者は1/4制限はusers.jsで管理
  const dbInsert =
    role === "agency"
      ? "INSERT INTO users (email, password, role, agency_id) VALUES (?, ?, ?, ?)"
      : "INSERT INTO users (email, password, role) VALUES (?, ?, ?)";
  const params =
    role === "agency"
      ? [email, password, role, agency_id]
      : [email, password, role];
  db.run(dbInsert, params, function (err) {
    if (err) {
      return res.render("register", {
        error: "登録に失敗しました（重複またはDBエラー）",
      });
    }
    res.redirect("/auth/login");
  });
});

// 昇格申請画面
router.get("/promote", (req, res) => {
  if (!req.session.user) return res.redirect("/auth/login");
  res.render("promote", { error: null });
});

// 昇格申請処理
router.post("/promote", (req, res) => {
  if (!req.session.user) return res.redirect("/auth/login");
  const { promotion_pass, role } = req.body;
  if (role === "admin" && promotion_pass === process.env.ADMIN_PROMOTION_PASS) {
    db.run(
      "UPDATE users SET role=? WHERE id=?",
      [role, req.session.user.id],
      function (err) {
        if (err) return res.render("promote", { error: "昇格に失敗しました" });
        req.session.user.role = role;
        res.redirect("/");
      }
    );
  } else {
    res.render("promote", { error: "パスワードが違います" });
  }
});

module.exports = router;
