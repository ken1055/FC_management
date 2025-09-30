const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// Supabase接続（Vercel + Supabase専用）
const { getSupabaseClient } = require("../config/supabase");
const db = getSupabaseClient();

console.log("auth.js: Vercel + Supabase環境で初期化完了");

// パスワードハッシュ化関数（後方互換性のため保持）
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 改善されたパスワード認証関数
function verifyPassword(inputPassword, storedPassword) {
  // bcryptハッシュかどうかを判定（bcryptハッシュは$2b$で始まる）
  if (storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2a$")) {
    try {
      return bcrypt.compareSync(inputPassword, storedPassword);
    } catch (error) {
      console.error("bcrypt認証エラー:", error);
      return false;
    }
  }

  // プレーンテキストの場合（開発・デバッグ用）
  if (inputPassword === storedPassword) {
    return true;
  }

  // SHA256ハッシュ化されたパスワードの場合（後方互換性）
  return hashPassword(inputPassword) === storedPassword;
}

// ログイン画面
router.get("/login", (req, res) => {
  try {
    res.render("login_standalone", {
      error: null,
      message: req.query.message,
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
        ${
          req.query.message
            ? `<div style="color: green; margin: 10px 0;">${req.query.message}</div>`
            : ""
        }
        <form method="POST" action="/auth/login">
          <div class="form-group">
            <label>Email:</label><br>
            <input type="text" name="email" required>
          </div>
          <div class="form-group">
            <label>Password:</label><br>
            <input type="password" name="password" required>
          </div>
          <div class="form-group">
            <button type="submit">ログイン</button>
          </div>
        </form>
        <p><a href="/auth/register">新規登録</a></p>
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
    // Supabase環境での認証処理（Vercel + Supabase専用）
    console.log("Supabase認証処理開始");
    handleSupabaseLogin(email, password, req, res);
  } catch (error) {
    console.error("Login error:", error);
    return res.send(`
      <h1>ログインエラー</h1>
      <p>システムエラーが発生しました: ${error.message}</p>
      <a href="/auth/login">ログインに戻る</a>
    `);
  }
});

// Supabase環境でのログイン処理
async function handleSupabaseLogin(email, password, req, res) {
  try {
    // 管理者テーブルから検索
    const { data: admins, error: adminError } = await db
      .from('admins')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (adminError) {
      console.error("Supabase admin query error:", adminError);
      return res.send(`
        <h1>データベースエラー</h1>
        <p>エラー: ${adminError.message}</p>
        <a href="/auth/login">ログインに戻る</a>
      `);
    }

    if (admins && admins.length > 0 && verifyPassword(password, admins[0].password)) {
      console.log("Admin found, creating session");
      req.session.user = {
        id: admins[0].id,
        email: admins[0].email,
        role: "admin",
        store_id: null,
      };

      console.log("Admin session created:", req.session.user);
      
      // Vercel環境でセッションを確実に保存
      req.session.save((err) => {
        if (err) {
          console.error("Admin session save error:", err);
          return res.send(`
            <h1>セッション保存エラー</h1>
            <p>セッションの保存に失敗しました</p>
            <a href="/auth/login">ログインに戻る</a>
          `);
        }
        console.log("Admin session saved successfully");
        return res.redirect("/");
      });
      return;
    }

    // 店舗ユーザーテーブルから検索
    const { data: users, error: userError } = await db
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (userError) {
      console.error("Supabase user query error:", userError);
      return res.send(`
        <h1>データベースエラー</h1>
        <p>エラー: ${userError.message}</p>
        <a href="/auth/login">ログインに戻る</a>
      `);
    }

    if (users && users.length > 0 && verifyPassword(password, users[0].password)) {
      console.log("User found, creating session");
      req.session.user = {
        id: users[0].id,
        email: users[0].email,
        role: "agency",
        store_id: users[0].store_id,
      };

      console.log("User session created:", req.session.user);
      
      // Vercel環境でセッションを確実に保存
      req.session.save((err) => {
        if (err) {
          console.error("User session save error:", err);
          return res.send(`
            <h1>セッション保存エラー</h1>
            <p>セッションの保存に失敗しました</p>
            <a href="/auth/login">ログインに戻る</a>
          `);
        }
        console.log("User session saved successfully");
        return res.redirect("/");
      });
      return;
    }

    console.log("Invalid credentials");
    return res.send(`
      <h1>ログインエラー</h1>
      <p>メールアドレスまたはパスワードが正しくありません</p>
      <a href="/auth/login">ログインに戻る</a>
    `);

  } catch (error) {
    console.error("Supabase login error:", error);
    return res.send(`
      <h1>ログインエラー</h1>
      <p>システムエラー: ${error.message}</p>
      <a href="/auth/login">ログインに戻る</a>
    `);
  }
}


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
    let store_id = null;
    if (role === "agency") store_id = null;

    // bcryptでパスワードをハッシュ化
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error("パスワードハッシュ化エラー:", err);
        return res.send(`
          <h1>登録エラー</h1>
          <p>パスワードのハッシュ化に失敗しました</p>
          <a href="/auth/register">登録に戻る</a>
        `);
      }

      const dbInsert =
        role === "agency"
          ? "INSERT INTO users (email, password, store_id) VALUES (?, ?, ?)"
          : "INSERT INTO admins (email, password) VALUES (?, ?)";
      const params =
        role === "agency"
          ? [email, hashedPassword, store_id]
          : [email, hashedPassword];

      db.run(dbInsert, params, function (err) {
        if (err) {
          console.error("ユーザー作成エラー:", err);

          // PostgreSQL固有のエラーハンドリング
          const constraint =
            role === "agency" ? "users_email_key" : "admins_email_key";
          if (err.code === "23505" && err.constraint === constraint) {
            return res
              .status(400)
              .send(
                `メールアドレス「${email}」は既に使用されています。別のメールアドレスを使用してください。`
              );
          }

          return res.status(500).send(`ユーザー作成エラー: ${err.message}`);
        }

        res.redirect("/auth/login?message=" + encodeURIComponent("登録完了"));
      });
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

  // 代理店ユーザーのみ昇格可能
  if (req.session.user.role !== "agency") {
    return res.send(`
      <h1>昇格エラー</h1>
      <p>代理店ユーザーのみ管理者に昇格できます</p>
      <a href="/auth/promote">昇格申請に戻る</a>
    `);
  }

  try {
    if (
      role === "admin" &&
      promotion_pass === process.env.ADMIN_PROMOTION_PASS
    ) {
      // 現在の代理店ユーザー情報を取得
      db.get(
        "SELECT * FROM users WHERE id = ?",
        [req.session.user.id],
        (err, user) => {
          if (err) {
            console.error("User lookup error:", err);
            return res.send(`
              <h1>昇格エラー</h1>
              <p>ユーザー情報の取得に失敗しました: ${err.message}</p>
              <a href="/auth/promote">昇格申請に戻る</a>
            `);
          }

          if (!user) {
            return res.send(`
              <h1>昇格エラー</h1>
              <p>ユーザーが見つかりません</p>
              <a href="/auth/promote">昇格申請に戻る</a>
            `);
          }

          // 管理者テーブルに新しいレコードを挿入
          db.run(
            "INSERT INTO admins (email, password) VALUES (?, ?)",
            [user.email, user.password],
            function (err) {
              if (err) {
                console.error("Admin creation error:", err);
                return res.send(`
                  <h1>昇格エラー</h1>
                  <p>管理者アカウントの作成に失敗しました: ${err.message}</p>
                  <a href="/auth/promote">昇格申請に戻る</a>
                `);
              }

              const newAdminId = this.lastID;
              console.log(`新しい管理者ID: ${newAdminId}`);

              // 代理店ユーザーテーブルから削除
              db.run(
                "DELETE FROM users WHERE id = ?",
                [req.session.user.id],
                function (err) {
                  if (err) {
                    console.error("User deletion error:", err);
                    // 作成した管理者レコードを削除（ロールバック）
                    db.run("DELETE FROM admins WHERE id = ?", [newAdminId]);
                    return res.send(`
                      <h1>昇格エラー</h1>
                      <p>代理店アカウントの削除に失敗しました: ${err.message}</p>
                      <a href="/auth/promote">昇格申請に戻る</a>
                    `);
                  }

                  console.log(
                    `代理店ユーザーID ${req.session.user.id} を削除完了`
                  );

                  // セッションを更新
                  req.session.user = {
                    id: newAdminId,
                    email: user.email,
                    role: "admin",
                    store_id: null,
                  };

                  console.log("昇格完了:", req.session.user);
                  res.redirect(
                    "/?message=" + encodeURIComponent("管理者に昇格しました")
                  );
                }
              );
            }
          );
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
