const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");

// パスワードハッシュ化関数
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const isRailway = process.env.RAILWAY_ENVIRONMENT_NAME;
const databaseUrl = process.env.DATABASE_URL;

// デバッグ情報を追加
console.log("=== 環境変数デバッグ ===");
console.log("DATABASE_URL:", databaseUrl ? "設定済み" : "未設定");
console.log(
  "DATABASE_URL (先頭50文字):",
  databaseUrl ? databaseUrl.substring(0, 50) + "..." : "null"
);
console.log("RAILWAY_ENVIRONMENT_NAME:", isRailway);
console.log("NODE_ENV:", process.env.NODE_ENV);

let db;
let isInitialized = false;
let isPostgres = false;

// 高速な初期化フラグ
const FAST_INIT = isVercel; // Vercel環境では高速初期化

console.log("=== データベース初期化開始 ===");
console.log("Environment:", {
  isVercel,
  isRailway,
  databaseUrl: !!databaseUrl,
  FAST_INIT,
});

try {
  if (databaseUrl && (isRailway || process.env.NODE_ENV === "production")) {
    // PostgreSQL接続（Railway本番環境）
    console.log("PostgreSQL環境: 本番データベースを使用");
    const { Pool } = require("pg");
    db = new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
    isPostgres = true;

    // PostgreSQL初期化を同期的に実行
    (async () => {
      try {
        await initializePostgresDatabase();
      } catch (error) {
        console.error("PostgreSQL初期化失敗:", error);
        // SQLiteにフォールバック
        console.log("SQLiteにフォールバック中...");
        isPostgres = false;
        const dbPath = isRailway ? "/app/data/agency.db" : "./agency.db";

        if (isRailway) {
          const fs = require("fs");
          const path = require("path");
          const dbDir = path.dirname(dbPath);
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
          }
        }

        db = new sqlite3.Database(dbPath);
        initializeLocalDatabase();
      }
    })();
  } else if (isVercel) {
    // Vercel環境では常にメモリDBを使用（高速）
    console.log("Vercel環境: メモリDBを使用");
    db = new sqlite3.Database(":memory:");
    initializeInMemoryDatabase();
  } else {
    // ローカル環境では通常通り
    console.log("ローカル環境: 通常のデータベース接続");

    // Railway環境でも永続化されるパスを使用
    const dbPath = isRailway ? "/app/data/agency.db" : "./agency.db";

    // Railway環境では/app/dataディレクトリを作成
    if (isRailway) {
      const fs = require("fs");
      const path = require("path");
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }

    db = new sqlite3.Database(dbPath);
    initializeLocalDatabase();
  }
} catch (error) {
  console.error("データベース接続エラー:", error);
  // エラー時はメモリDBにフォールバック
  db = new sqlite3.Database(":memory:");
  initializeInMemoryDatabase();
}

async function initializePostgresDatabase() {
  console.log("PostgreSQL初期化中...");
  const startTime = Date.now();

  // PostgreSQL用のテーブル作成SQL（外部キー制約なし）
  const tables = [
    // 最初に参照されるテーブルを作成
    `CREATE TABLE IF NOT EXISTS agencies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER,
      address TEXT,
      bank_info TEXT,
      experience_years INTEGER,
      contract_date DATE,
      start_date DATE,
      product_features TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )`,
    // 次に参照するテーブルを作成
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'agency')) NOT NULL,
      agency_id INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS agency_products (
      agency_id INTEGER,
      product_name TEXT,
      PRIMARY KEY (agency_id, product_name)
    )`,
    `CREATE TABLE IF NOT EXISTS product_files (
      id SERIAL PRIMARY KEY,
      agency_id INTEGER,
      product_name TEXT,
      file_path TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      agency_id INTEGER,
      year INTEGER,
      month INTEGER,
      amount INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS group_agency (
      group_id INTEGER,
      agency_id INTEGER,
      PRIMARY KEY (group_id, agency_id),
      UNIQUE (group_id, agency_id)
    )`,
    `CREATE TABLE IF NOT EXISTS group_admin (
      group_id INTEGER,
      admin_id INTEGER,
      PRIMARY KEY (group_id, admin_id)
    )`,
    `CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      originalname TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      description TEXT,
      agency_id INTEGER,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  try {
    // テーブルを順番に作成
    for (const sql of tables) {
      console.log("テーブル作成中:", sql.substring(0, 50) + "...");
      await db.query(sql);
    }

    // 外部キー制約を後で追加（エラーを無視）
    const foreignKeys = [
      `ALTER TABLE users ADD CONSTRAINT fk_users_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)`,
      `ALTER TABLE agency_products ADD CONSTRAINT fk_agency_products_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)`,
      `ALTER TABLE product_files ADD CONSTRAINT fk_product_files_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)`,
      `ALTER TABLE sales ADD CONSTRAINT fk_sales_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)`,
      `ALTER TABLE group_agency ADD CONSTRAINT fk_group_agency_group FOREIGN KEY (group_id) REFERENCES groups(id)`,
      `ALTER TABLE group_agency ADD CONSTRAINT fk_group_agency_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)`,
      `ALTER TABLE group_admin ADD CONSTRAINT fk_group_admin_group FOREIGN KEY (group_id) REFERENCES groups(id)`,
      `ALTER TABLE group_admin ADD CONSTRAINT fk_group_admin_user FOREIGN KEY (admin_id) REFERENCES users(id)`,
      `ALTER TABLE materials ADD CONSTRAINT fk_materials_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)`,
    ];

    for (const fkSql of foreignKeys) {
      try {
        await db.query(fkSql);
      } catch (fkError) {
        // 外部キー制約が既に存在する場合は無視
        if (fkError.code !== "42710") {
          console.log("外部キー制約スキップ:", fkError.message);
        }
      }
    }

    // 管理者アカウントの作成
    const adminPassword =
      process.env.NODE_ENV === "production" ? hashPassword("admin") : "admin";

    await db.query(
      `INSERT INTO users (email, password, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`,
      ["admin", adminPassword, "admin"]
    );

    console.log("管理者アカウント作成完了");
    isInitialized = true;
    const duration = Date.now() - startTime;
    console.log(`PostgreSQL初期化完了: ${duration}ms`);
  } catch (error) {
    console.error("PostgreSQL初期化エラー:", error);
    throw error; // エラーを再投げして上位でキャッチ
  }
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

        // PostgreSQL互換のINSERT文を使用
        const isPostgres =
          process.env.DATABASE_URL &&
          (process.env.RAILWAY_ENVIRONMENT_NAME ||
            process.env.NODE_ENV === "production");
        const insertQuery = isPostgres
          ? "INSERT INTO users (email, password, role) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING"
          : "INSERT OR IGNORE INTO users (email, password, role) VALUES (?, ?, ?)";

        db.run(insertQuery, ["admin", adminPassword, "admin"], (err) => {
          if (err) {
            console.error("管理者作成エラー:", err);
          } else {
            console.log("管理者アカウント作成完了");
          }

          isInitialized = true;
          const duration = Date.now() - startTime;
          console.log(`高速初期化完了: ${duration}ms`);
        });
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
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    // 初期化完了
    isInitialized = true;
    const duration = Date.now() - startTime;
    console.log(`メモリDB初期化完了: ${duration}ms`);
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
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies(id)
      )
    `);

    // 初期化完了
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

// PostgreSQL用のクエリ変換関数
function convertSqlToPostgres(sql) {
  // SQLiteの?をPostgreSQLの$1, $2, ...に変換
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

// データベースオブジェクトをラップして初期化を待つ
const dbWrapper = {
  get: (sql, params, callback) => {
    waitForInitialization(async (err) => {
      if (err) return callback(err);

      if (isPostgres) {
        try {
          const convertedSql = convertSqlToPostgres(sql);
          const result = await db.query(convertedSql, params);
          callback(null, result.rows[0] || null);
        } catch (error) {
          callback(error);
        }
      } else {
        db.get(sql, params, callback);
      }
    });
  },

  run: (sql, params, callback) => {
    waitForInitialization(async (err) => {
      if (err) return callback(err);

      if (isPostgres) {
        try {
          let convertedSql = convertSqlToPostgres(sql);

          // INSERT文の場合はRETURNING idを追加
          if (convertedSql.toLowerCase().includes("insert into")) {
            convertedSql += " RETURNING id";
          }

          const result = await db.query(convertedSql, params);

          // SQLiteのthis.lastIDを模倣
          const mockThis = {
            lastID: result.rows[0] ? result.rows[0].id : null,
            changes: result.rowCount,
          };
          callback.call(mockThis, null);
        } catch (error) {
          callback(error);
        }
      } else {
        db.run(sql, params, callback);
      }
    });
  },

  all: (sql, params, callback) => {
    waitForInitialization(async (err) => {
      if (err) return callback(err);

      if (isPostgres) {
        try {
          const convertedSql = convertSqlToPostgres(sql);
          const result = await db.query(convertedSql, params);
          callback(null, result.rows);
        } catch (error) {
          callback(error);
        }
      } else {
        db.all(sql, params, callback);
      }
    });
  },

  serialize: (callback) => {
    waitForInitialization((err) => {
      if (err) return callback(err);

      if (isPostgres) {
        // PostgreSQLでは直接実行
        callback();
      } else {
        db.serialize(callback);
      }
    });
  },
};

module.exports = dbWrapper;
