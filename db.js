const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");

// パスワードハッシュ化関数
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Vercel環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;

let db;

try {
  if (isVercel) {
    // Vercel環境では読み取り専用でデータベースを開く
    console.log("Vercel環境: 読み取り専用でデータベースを開きます");
    db = new sqlite3.Database(
      path.join(__dirname, "agency.db"),
      sqlite3.OPEN_READONLY,
      (err) => {
        if (err) {
          console.log("読み取り専用で開けませんでした。メモリDBを使用します。");
          // 読み取り専用で開けない場合はメモリDBを使用
          db = new sqlite3.Database(":memory:");
          initializeInMemoryDatabase();
        } else {
          console.log("データベースを読み取り専用で開きました");
        }
      }
    );
  } else {
    // ローカル環境では通常通り
    console.log("ローカル環境: 通常のデータベース接続");
    db = new sqlite3.Database("./agency.db");
  }
} catch (error) {
  console.error("データベース接続エラー:", error);
  // エラー時はメモリDBにフォールバック
  db = new sqlite3.Database(":memory:");
  initializeInMemoryDatabase();
}

function initializeInMemoryDatabase() {
  console.log("メモリDBを初期化中...");

  db.serialize(() => {
    // テーブル作成
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'agency')) NOT NULL,
        agency_id INTEGER,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS agencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER,
        address TEXT,
        bank_info TEXT,
        experience_years INTEGER,
        contract_date DATE,
        start_date DATE,
        product_features TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS agency_products (
        agency_id INTEGER,
        product_name TEXT,
        PRIMARY KEY (agency_id, product_name),
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS product_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER,
        product_name TEXT,
        file_path TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER,
        year INTEGER,
        month INTEGER,
        amount INTEGER,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS group_agency (
        group_id INTEGER,
        agency_id INTEGER,
        PRIMARY KEY (group_id, agency_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS group_admin (
        group_id INTEGER,
        admin_id INTEGER,
        PRIMARY KEY (group_id, admin_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (admin_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalname TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        description TEXT,
        agency_id INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    // 初期管理者アカウントを作成
    const adminPassword =
      process.env.NODE_ENV === "production" ? hashPassword("admin") : "admin";

    db.run(
      `
      INSERT OR IGNORE INTO users (email, password, role) 
      VALUES ('admin', ?, 'admin')
    `,
      [adminPassword],
      (err) => {
        if (err) {
          console.error("初期管理者作成エラー:", err);
        } else {
          console.log("初期管理者アカウントを作成しました");
          if (process.env.NODE_ENV === "production") {
            console.log("⚠️  本番環境では初期パスワードを必ず変更してください");
          }
        }
      }
    );

    console.log("メモリDBの初期化完了");
  });
}

// ローカル環境での通常の初期化
if (!isVercel) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'agency')) NOT NULL,
        agency_id INTEGER,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS agencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER,
        address TEXT,
        bank_info TEXT,
        experience_years INTEGER,
        contract_date DATE,
        start_date DATE,
        product_features TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS agency_products (
        agency_id INTEGER,
        product_name TEXT,
        PRIMARY KEY (agency_id, product_name),
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS product_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER,
        product_name TEXT,
        file_path TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER,
        year INTEGER,
        month INTEGER,
        amount INTEGER,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS group_agency (
        group_id INTEGER,
        agency_id INTEGER,
        PRIMARY KEY (group_id, agency_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS group_admin (
        group_id INTEGER,
        admin_id INTEGER,
        PRIMARY KEY (group_id, admin_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (admin_id) REFERENCES users(id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalname TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        description TEXT,
        agency_id INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);
  });
}

module.exports = db;
