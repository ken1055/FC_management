const express = require("express");
const router = express.Router();
const db = require("../db");
const crypto = require("crypto");

// パスワードハッシュ化関数
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 開発環境での簡易認証（本番では削除推奨）
function verifyPassword(inputPassword, storedPassword) {
  // プレーンテキストの場合（開発・デバッグ用）
  if (inputPassword === storedPassword) {
    return true;
  }
  // ハッシュ化されたパスワードの場合
  return hashPassword(inputPassword) === storedPassword;
}

// ログイン画面
router.get("/login", (req, res) => {
  try {
    res.render("login_standalone", {
      error: null,
    });
  } catch (error) {
    console.error("Login page error:", error);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ログイン</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 50px; }
          .form-group { margin: 10px 0; }
          input { padding: 8px; width: 200px; }
          button { padding: 10px 20px; background: #007bff; color: white; border: none; }
        </style>
      </head>
      <body>
        <h1>代理店管理システム - ログイン</h1>
        <form method="POST" action="/auth/login">
          <div class="form-group">
            <label>Email:</label><br>
            <input type="text" name="email" value="admin" required>
          </div>
          <div class="form-group">
            <label>Password:</label><br>
            <input type="password" name="password" value="admin" required>
          </div>
          <div class="form-group">
            <button type="submit">ログイン</button>
          </div>
        </form>
        <p><small>初期ログイン: admin / admin</small></p>
      </body>
      </html>
    `);
  }
});

// ログイン処理
router.post("/login", (req, res) => {
  console.log("Login attempt:", req.body);
  const { email, password } = req.body;

  // 入力値検証
  if (!email || !password) {
    return res.send(`
      <h1>ログインエラー</h1>
      <p>メールアドレスとパスワードを入力してください</p>
      <a href="/auth/login">ログインに戻る</a>
    `);
  }

  try {
    db.get("SELECT * FROM users WHERE email=?", [email], (err, user) => {
      console.log("DB query result:", {
        err,
        user: user ? { id: user.id, email: user.email, role: user.role } : null,
      });

      if (err) {
        console.error("Database error:", err);
        return res.send(`
            <h1>データベースエラー</h1>
            <p>エラー: ${err.message}</p>
            <a href="/auth/login">ログインに戻る</a>
          `);
      }

      if (user && verifyPassword(password, user.password)) {
        console.log("User found, creating session");
        req.session.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          agency_id: user.agency_id,
        };

        console.log("Session created:", req.session.user);
        console.log("Redirecting to /");

        // 権限に応じてリダイレクト
        return res.redirect("/");
      } else {
        console.log("Invalid credentials");
        return res.send(`
            <h1>ログインエラー</h1>
            <p>メールアドレスまたはパスワードが違います</p>
            <a href="/auth/login">ログインに戻る</a>
          `);
      }
    });
  } catch (error) {
    console.error("Login process error:", error);
    res.status(500).send(`
      <h1>ログイン処理エラー</h1>
      <p>エラー: ${error.message}</p>
      <a href="/auth/login">ログインに戻る</a>
    `);
  }
});

// ログアウト
router.get("/logout", (req, res) => {
  console.log("Logout requested");
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/auth/login");
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.redirect("/auth/login");
  }
});

// 新規登録画面
router.get("/register", (req, res) => {
  try {
    res.render("register", {
      error: null,
      layout: false,
    });
  } catch (error) {
    console.error("Register page error:", error);
    res.send("<h1>新規登録ページでエラーが発生しました</h1>");
  }
});

// 新規登録処理
router.post("/register", (req, res) => {
  console.log("Registration attempt:", req.body);
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.send(`
      <h1>登録エラー</h1>
      <p>全ての項目を入力してください</p>
      <a href="/auth/register">登録に戻る</a>
    `);
  }

  // パスワードの強度チェック
  if (password.length < 4) {
    return res.send(`
      <h1>登録エラー</h1>
      <p>パスワードは4文字以上で入力してください</p>
      <a href="/auth/register">登録に戻る</a>
    `);
  }

  try {
    let agency_id = null;
    if (role === "agency") agency_id = null;

    // 本番環境ではパスワードをハッシュ化
    const hashedPassword =
      process.env.NODE_ENV === "production" ? hashPassword(password) : password;

    const dbInsert =
      role === "agency"
        ? "INSERT INTO users (email, password, role, agency_id) VALUES (?, ?, ?, ?)"
        : "INSERT INTO users (email, password, role) VALUES (?, ?, ?)";
    const params =
      role === "agency"
        ? [email, hashedPassword, role, agency_id]
        : [email, hashedPassword, role];

    db.run(dbInsert, params, function (err) {
      if (err) {
        console.error("Registration error:", err);
        return res.send(`
          <h1>登録エラー</h1>
          <p>登録に失敗しました: ${err.message}</p>
          <a href="/auth/register">登録に戻る</a>
        `);
      }
      console.log("User registered successfully");
      res.redirect("/auth/login");
    });
  } catch (error) {
    console.error("Registration process error:", error);
    res.status(500).send(`
      <h1>登録処理エラー</h1>
      <p>エラー: ${error.message}</p>
      <a href="/auth/register">登録に戻る</a>
    `);
  }
});

// 昇格申請画面
router.get("/promote", (req, res) => {
  if (!req.session.user) return res.redirect("/auth/login");
  try {
    res.render("promote", {
      error: null,
      layout: false,
    });
  } catch (error) {
    console.error("Promote page error:", error);
    res.send("<h1>昇格申請ページでエラーが発生しました</h1>");
  }
});

// 昇格申請処理
router.post("/promote", (req, res) => {
  if (!req.session.user) return res.redirect("/auth/login");

  console.log("Promotion attempt:", req.body);
  const { promotion_pass, role } = req.body;

  try {
    if (
      role === "admin" &&
      promotion_pass === process.env.ADMIN_PROMOTION_PASS
    ) {
      db.run(
        "UPDATE users SET role=? WHERE id=?",
        [role, req.session.user.id],
        function (err) {
          if (err) {
            console.error("Promotion error:", err);
            return res.send(`
              <h1>昇格エラー</h1>
              <p>昇格に失敗しました: ${err.message}</p>
              <a href="/auth/promote">昇格申請に戻る</a>
            `);
          }
          req.session.user.role = role;
          res.redirect("/");
        }
      );
    } else {
      res.send(`
        <h1>昇格エラー</h1>
        <p>パスワードが違います</p>
        <a href="/auth/promote">昇格申請に戻る</a>
      `);
    }
  } catch (error) {
    console.error("Promotion process error:", error);
    res.status(500).send(`
      <h1>昇格処理エラー</h1>
      <p>エラー: ${error.message}</p>
      <a href="/auth/promote">昇格申請に戻る</a>
    `);
  }
});

module.exports = router;
