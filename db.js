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
let isInitialized = false;

// 高速な初期化フラグ
const FAST_INIT = isVercel; // Vercel環境では高速初期化

console.log("=== データベース初期化開始 ===");
console.log("Environment:", { isVercel, FAST_INIT });

try {
  if (isVercel) {
    // Vercel環境では常にメモリDBを使用（高速）
    console.log("Vercel環境: メモリDBを使用");
    db = new sqlite3.Database(":memory:");
    initializeInMemoryDatabase();
  } else {
    // ローカル環境では通常通り
    console.log("ローカル環境: 通常のデータベース接続");
    db = new sqlite3.Database("./agency.db");
    initializeLocalDatabase();
  }
} catch (error) {
  console.error("データベース接続エラー:", error);
  // エラー時はメモリDBにフォールバック
  db = new sqlite3.Database(":memory:");
  initializeInMemoryDatabase();
}

function initializeInMemoryDatabase() {
  console.log("メモリDB初期化中...");
  const startTime = Date.now();

  // 高速初期化（最小限のテーブルのみ）
  if (FAST_INIT) {
    console.log("高速初期化モード");

    // 最重要テーブルのみ作成
    const essentialTables = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'agency')) NOT NULL,
        agency_id INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS agencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER,
        address TEXT,
        bank_info TEXT,
        experience_years INTEGER,
        contract_date DATE,
        start_date DATE,
        product_features TEXT
      )`,
    ];

    // 並列実行で高速化
    Promise.all(
      essentialTables.map(
        (sql) =>
          new Promise((resolve, reject) => {
            db.run(sql, (err) => {
              if (err) reject(err);
              else resolve();
            });
          })
      )
    )
      .then(() => {
        // 管理者アカウントのみ作成
        const adminPassword =
          process.env.NODE_ENV === "production"
            ? hashPassword("admin")
            : "admin";

        db.run(
          `INSERT OR IGNORE INTO users (email, password, role) VALUES ('admin', ?, 'admin')`,
          [adminPassword],
          (err) => {
            if (err) {
              console.error("管理者作成エラー:", err);
            } else {
              console.log("管理者アカウント作成完了");
            }

            isInitialized = true;
            const duration = Date.now() - startTime;
            console.log(`高速初期化完了: ${duration}ms`);
          }
        );
      })
      .catch((err) => {
        console.error("高速初期化エラー:", err);
        isInitialized = true; // エラーでも続行
      });

    return;
  }

  // 通常の初期化（全テーブル）
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
      `INSERT OR IGNORE INTO users (email, password, role) VALUES ('admin', ?, 'admin')`,
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

        isInitialized = true;
        const duration = Date.now() - startTime;
        console.log(`メモリDB初期化完了: ${duration}ms`);
      }
    );
  });
}

function initializeLocalDatabase() {
  console.log("ローカルDB初期化中...");

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

    isInitialized = true;
    console.log("ローカルDB初期化完了");
  });
}

// 初期化完了を待つ関数
function waitForInitialization(callback, timeout = 5000) {
  const startTime = Date.now();
  const checkInterval = setInterval(() => {
    if (isInitialized) {
      clearInterval(checkInterval);
      callback(null);
    } else if (Date.now() - startTime > timeout) {
      clearInterval(checkInterval);
      callback(new Error("Database initialization timeout"));
    }
  }, 100);
}

// データベースオブジェクトをラップして初期化を待つ
const dbWrapper = {
  get: (sql, params, callback) => {
    waitForInitialization((err) => {
      if (err) return callback(err);
      db.get(sql, params, callback);
    });
  },
  run: (sql, params, callback) => {
    waitForInitialization((err) => {
      if (err) return callback(err);
      db.run(sql, params, callback);
    });
  },
  all: (sql, params, callback) => {
    waitForInitialization((err) => {
      if (err) return callback(err);
      db.all(sql, params, callback);
    });
  },
  serialize: (callback) => {
    waitForInitialization((err) => {
      if (err) return callback(err);
      db.serialize(callback);
    });
  },
};

module.exports = dbWrapper;
