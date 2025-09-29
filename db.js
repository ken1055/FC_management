// Vercel環境での緊急修正
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;

// Vercel環境では早期リターン
if (isVercel) {
  console.log("Vercel環境: db.js をスキップ（Supabase使用）");
  module.exports = null;
  return;
}

const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const {
  getSupabaseClient,
  isSupabaseConfigured,
} = require("./config/supabase");
const { query, get, run, all } = require("./config/database");

// パスワードハッシュ化関数
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// 環境の検出
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const isRailway =
  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT;
const databaseUrl = process.env.DATABASE_URL;
const isSupabase = isSupabaseConfigured();

// デバッグ情報を追加
console.log("=== 環境変数デバッグ ===");
console.log("DATABASE_URL:", databaseUrl ? "設定済み" : "未設定");
console.log(
  "DATABASE_URL (先頭50文字):",
  databaseUrl ? databaseUrl.substring(0, 50) + "..." : "null"
);
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "設定済み" : "未設定");
console.log(
  "SUPABASE_ANON_KEY:",
  process.env.SUPABASE_ANON_KEY ? "設定済み" : "未設定"
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
  isSupabase,
  databaseUrl: !!databaseUrl,
  FAST_INIT,
});

try {
  if (isSupabase) {
    // Supabase接続
    console.log("Supabase環境: Supabaseデータベースを使用");
    const supabase = getSupabaseClient();
    if (supabase) {
      db = supabase;
      isPostgres = true;
      console.log("Supabase接続完了");
      // Supabaseの場合、テーブル作成は手動またはマイグレーションで行う
      isInitialized = true;
    } else {
      throw new Error("Supabase初期化失敗");
    }
  } else if (
    databaseUrl &&
    (isRailway || process.env.NODE_ENV === "production")
  ) {
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
        console.log(`Railway: データディレクトリを作成しました: ${dbDir}`);
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
    // FC店舗情報テーブル（旧agencies）
    `CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      -- 店舗基本情報
      name TEXT NOT NULL,
      business_address TEXT,
      main_phone TEXT,
      manager_name TEXT,
      mobile_phone TEXT,
      representative_email TEXT,
      -- 契約基本情報
      contract_type TEXT,
      contract_start_date DATE,
      royalty_rate DECIMAL(5,2) DEFAULT 5.00,
      -- 請求基本情報
      invoice_number TEXT,
      bank_name TEXT,
      branch_name TEXT,
      account_type TEXT,
      account_number TEXT,
      account_holder TEXT,
      -- 許認可情報
      license_status TEXT DEFAULT 'none',
      license_type TEXT,
      license_number TEXT,
      license_file_path TEXT,
      -- 連携ID
      line_official_id TEXT,
      representative_gmail TEXT,
      -- システム情報
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // 顧客情報管理テーブル（新規追加）
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      store_id INTEGER,
      customer_code TEXT UNIQUE,
      name TEXT NOT NULL,
      kana TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      birth_date DATE,
      gender TEXT,
      registration_date DATE DEFAULT CURRENT_DATE,
      last_visit_date DATE,
      total_purchase_amount INTEGER DEFAULT 0,
      visit_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // ロイヤリティ設定テーブル（新規追加）
    `CREATE TABLE IF NOT EXISTS royalty_settings (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      store_id INTEGER,
      royalty_rate DECIMAL(5,2) NOT NULL,
      effective_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // ロイヤリティ計算結果テーブル（新規追加）
    `CREATE TABLE IF NOT EXISTS royalty_calculations (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      store_id INTEGER,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      sales_amount INTEGER NOT NULL,
      royalty_rate DECIMAL(5,2) NOT NULL,
      royalty_amount INTEGER NOT NULL,
      status TEXT DEFAULT 'calculated',
      invoice_generated BOOLEAN DEFAULT FALSE,
      invoice_path TEXT,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, year, month)
    )`,
    `CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      name TEXT NOT NULL
    )`,
    // 管理者アカウント専用テーブル
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // 店舗アカウント専用テーブル（roleフィールドを削除）
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      store_id INTEGER,
      FOREIGN KEY (store_id) REFERENCES stores(id)
    )`,
    `CREATE TABLE IF NOT EXISTS store_products (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      store_id INTEGER,
      product_name TEXT,
      product_detail TEXT,
      product_url TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS product_files (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      store_id INTEGER,
      product_name TEXT,
      file_path TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      store_id INTEGER,
      year INTEGER,
      month INTEGER,
      amount INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      group_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      UNIQUE (group_id, store_id)
    )`,
    `CREATE TABLE IF NOT EXISTS group_admin (
      group_id INTEGER,
      admin_id INTEGER,
      PRIMARY KEY (group_id, admin_id)
    )`,
    `CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      filename TEXT NOT NULL,
      originalname TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      description TEXT,
      store_id INTEGER,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      key_name TEXT NOT NULL UNIQUE,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  try {
    // テーブルを順番に作成
    for (const sql of tables) {
      console.log("テーブル作成中:", sql.substring(0, 50) + "...");
      await query(sql);
    }

    // 外部キー制約を後で追加（エラーを無視）
    const foreignKeys = [
      `ALTER TABLE users ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE customers ADD CONSTRAINT fk_customers_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE royalty_settings ADD CONSTRAINT fk_royalty_settings_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE royalty_calculations ADD CONSTRAINT fk_royalty_calculations_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE store_products ADD CONSTRAINT fk_store_products_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE product_files ADD CONSTRAINT fk_product_files_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE sales ADD CONSTRAINT fk_sales_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE group_members ADD CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES groups(id)`,
      `ALTER TABLE group_members ADD CONSTRAINT fk_group_members_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
      `ALTER TABLE group_admin ADD CONSTRAINT fk_group_admin_group FOREIGN KEY (group_id) REFERENCES groups(id)`,
      `ALTER TABLE group_admin ADD CONSTRAINT fk_group_admin_admin FOREIGN KEY (admin_id) REFERENCES admins(id)`,
      `ALTER TABLE materials ADD CONSTRAINT fk_materials_store FOREIGN KEY (store_id) REFERENCES stores(id)`,
    ];

    for (const fkSql of foreignKeys) {
      try {
        await query(fkSql);
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

    await run(
      `INSERT INTO admins (email, password) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      ["admin", adminPassword]
    );

    // 既存のagenciesテーブルからstoresテーブルへのデータ移行
    console.log("既存の代理店データをFC店舗データに移行中...");
    try {
      const existingAgencies = await query("SELECT * FROM agencies");

      if (existingAgencies.rows && existingAgencies.rows.length > 0) {
        console.log(
          `${existingAgencies.rows.length}件の代理店データを店舗データに移行します`
        );

        for (const agency of existingAgencies.rows) {
          await run(
            `INSERT INTO stores (id, name, owner_name, address, bank_info, contract_date, start_date, royalty_rate, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
             ON CONFLICT (id) DO NOTHING`,
            [
              agency.id,
              agency.name,
              agency.name, // owner_nameとしてnameを使用
              agency.address,
              agency.bank_info,
              agency.contract_date,
              agency.start_date,
              5.0, // デフォルトロイヤリティ率
            ]
          );
          console.log(`店舗移行完了: ${agency.name}`);
        }
      } else {
        console.log("移行する代理店データがありません");
      }
    } catch (migrationError) {
      console.log(
        "代理店データ移行エラー（新規DBの可能性）:",
        migrationError.message
      );
    }

    // 既存のusersテーブルから管理者データを移行
    console.log("既存の管理者データを移行中...");
    try {
      // 既存のusersテーブルから管理者を取得
      const existingAdmins = await query(
        "SELECT id, email, password FROM users WHERE role = 'admin'"
      );

      if (existingAdmins.rows && existingAdmins.rows.length > 0) {
        console.log(
          `${existingAdmins.rows.length}件の管理者データを移行します`
        );

        for (const admin of existingAdmins.rows) {
          await run(
            "INSERT INTO admins (email, password) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
            [admin.email, admin.password]
          );
          console.log(`管理者移行完了: ${admin.email}`);
        }

        // 移行後、usersテーブルから管理者データを削除
        await run("DELETE FROM users WHERE role = 'admin'");
        console.log("usersテーブルから管理者データを削除完了");
      }
    } catch (migrationError) {
      console.log(
        "管理者データ移行エラー（新規DBの可能性）:",
        migrationError.message
      );
    }

    // usersテーブルのagency_id → store_idの移行
    console.log("usersテーブルのagency_id → store_idの移行中...");
    try {
      // agency_idカラムが存在するかチェックし、存在する場合は移行
      await run("ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id INTEGER");
      await run(
        "UPDATE users SET store_id = agency_id WHERE agency_id IS NOT NULL AND store_id IS NULL"
      );
      await run("ALTER TABLE users DROP COLUMN IF EXISTS agency_id");
      console.log("usersテーブルのカラム移行完了");
    } catch (columnError) {
      console.log("usersテーブルカラム移行スキップ:", columnError.message);
    }

    // その他のテーブルのagency_id → store_idの移行
    const tablesToMigrate = ["sales", "materials", "product_files"];
    for (const table of tablesToMigrate) {
      try {
        console.log(`${table}テーブルのagency_id → store_idの移行中...`);
        await run(
          `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS store_id INTEGER`
        );
        await run(
          `UPDATE ${table} SET store_id = agency_id WHERE agency_id IS NOT NULL AND store_id IS NULL`
        );
        await run(`ALTER TABLE ${table} DROP COLUMN IF EXISTS agency_id`);
        console.log(`${table}テーブルのカラム移行完了`);
      } catch (tableError) {
        console.log(`${table}テーブルカラム移行スキップ:`, tableError.message);
      }
    }

    // usersテーブルからroleカラムを削除（PostgreSQL）
    try {
      await run("ALTER TABLE users DROP COLUMN IF EXISTS role");
      console.log("usersテーブルからroleカラムを削除完了");
    } catch (alterError) {
      console.log("roleカラム削除スキップ:", alterError.message);
    }

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

  // Vercel環境では超高速初期化
  if (isVercel) {
    console.log("Vercel超高速初期化: 最小構成でテーブル作成");
    
    // 必要最小限のテーブルを同期的に作成
    db.serialize(() => {
      // 最小限のテーブル構造
      db.run("CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT)", (err) => {
        if (err) console.log("adminsテーブル作成スキップ:", err.message);
      });
      
      db.run("CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY, name TEXT)", (err) => {
        if (err) console.log("storesテーブル作成スキップ:", err.message);
      });
      
      db.run("CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, store_id INTEGER, name TEXT, customer_code TEXT, total_purchase_amount INTEGER DEFAULT 0)", (err) => {
        if (err) console.log("customersテーブル作成スキップ:", err.message);
      });
      
      db.run("CREATE TABLE IF NOT EXISTS customer_transactions (id INTEGER PRIMARY KEY, store_id INTEGER, customer_id INTEGER, transaction_date DATE, amount INTEGER, description TEXT, payment_method TEXT DEFAULT '現金', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)", (err) => {
        if (err) console.log("customer_transactionsテーブル作成スキップ:", err.message);
      });
      
      db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT, store_id INTEGER)", (err) => {
        if (err) console.log("usersテーブル作成スキップ:", err.message);
      });

      // デフォルトデータ挿入
      db.run("INSERT OR IGNORE INTO admins (email, password) VALUES ('admin', 'admin')", (err) => {
        if (!err) console.log("管理者アカウント作成完了");
      });

      db.run("INSERT OR IGNORE INTO stores (id, name) VALUES (1, 'テスト店舗')", (err) => {
        if (!err) console.log("テスト店舗作成完了");
      });

      db.run("INSERT OR IGNORE INTO users (email, password, store_id) VALUES ('store@test.com', 'store123', 1)", (err) => {
        if (!err) console.log("店舗ユーザー作成完了");
      });

      db.run("INSERT OR IGNORE INTO customers (id, store_id, name, customer_code) VALUES (1, 1, '田中太郎', 'CUST001')", (err) => {
        if (!err) console.log("テスト顧客作成完了");
      });

      // サンプル取引データ
      db.run("INSERT OR IGNORE INTO customer_transactions (store_id, customer_id, transaction_date, amount, description, payment_method) VALUES (1, 1, '2025-01-15', 5000, 'コーヒー豆購入', '現金')");
      db.run("INSERT OR IGNORE INTO customer_transactions (store_id, customer_id, transaction_date, amount, description, payment_method) VALUES (1, 1, '2025-02-10', 3000, 'ドリンク', 'クレジットカード')");
      db.run("INSERT OR IGNORE INTO customer_transactions (store_id, customer_id, transaction_date, amount, description, payment_method) VALUES (1, 1, '2025-02-15', 7000, 'ケーキセット', '現金')");

      isInitialized = true;
      const duration = Date.now() - startTime;
      console.log(`Vercel超高速初期化完了: ${duration}ms`);
    });

    return;
  }

  // 高速初期化（最小限のテーブルのみ）
  if (FAST_INIT) {
    console.log("高速初期化モード");

    // 最重要テーブルのみ作成
    const essentialTables = [
      `CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
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
        const isPostgres = !!process.env.DATABASE_URL;
        const insertQuery = isPostgres
          ? "INSERT INTO admins (email, password) VALUES (?, ?) ON CONFLICT (email) DO NOTHING"
          : "INSERT OR IGNORE INTO admins (email, password) VALUES (?, ?)";

        db.run(insertQuery, ["admin", adminPassword], (err) => {
          if (err) {
            console.error("管理者作成エラー:", err);
          } else {
            console.log("管理者アカウント作成完了");
          }

          // 既存のusersテーブルから管理者データを移行
          console.log("既存の管理者データを移行中...");
          db.all(
            "SELECT id, email, password FROM users WHERE role = 'admin'",
            [],
            (err, existingAdmins) => {
              if (err) {
                console.log(
                  "管理者データ移行エラー（新規DBの可能性）:",
                  err.message
                );
                isInitialized = true;
                const duration = Date.now() - startTime;
                console.log(`高速初期化完了: ${duration}ms`);
                return;
              }

              if (existingAdmins && existingAdmins.length > 0) {
                console.log(
                  `${existingAdmins.length}件の管理者データを移行します`
                );

                let migrationCompleted = 0;
                existingAdmins.forEach((admin) => {
                  db.run(
                    "INSERT OR IGNORE INTO admins (email, password) VALUES (?, ?)",
                    [admin.email, admin.password],
                    function (err) {
                      if (err) {
                        console.error(`管理者移行エラー ${admin.email}:`, err);
                      } else {
                        console.log(`管理者移行完了: ${admin.email}`);
                      }

                      migrationCompleted++;
                      if (migrationCompleted === existingAdmins.length) {
                        // 移行後、usersテーブルから管理者データを削除
                        db.run(
                          "DELETE FROM users WHERE role = 'admin'",
                          (err) => {
                            if (err) {
                              console.error(
                                "usersテーブルから管理者データ削除エラー:",
                                err
                              );
                            } else {
                              console.log(
                                "usersテーブルから管理者データを削除完了"
                              );
                            }

                            // usersテーブルからroleカラムを削除（SQLite）
                            db.run(
                              "ALTER TABLE users DROP COLUMN role",
                              (err) => {
                                if (err) {
                                  console.log(
                                    "roleカラム削除スキップ:",
                                    err.message
                                  );
                                } else {
                                  console.log(
                                    "usersテーブルからroleカラムを削除完了"
                                  );
                                }

                                isInitialized = true;
                                const duration = Date.now() - startTime;
                                console.log(`高速初期化完了: ${duration}ms`);
                              }
                            );
                          }
                        );
                      }
                    }
                  );
                });
              } else {
                console.log("移行する管理者データがありません");
                isInitialized = true;
                const duration = Date.now() - startTime;
                console.log(`高速初期化完了: ${duration}ms`);
              }
            }
          );
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
    // 管理者アカウント専用テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 代理店アカウント専用テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
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
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER,
        product_name TEXT,
        product_detail TEXT,
        product_url TEXT,
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
        FOREIGN KEY (admin_id) REFERENCES admins(id)
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

    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT NOT NULL UNIQUE,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 初期化完了
    isInitialized = true;
    console.log("メモリDB初期化完了");
  });
}

function initializeLocalDatabase() {
  console.log("ローカルDB初期化中（FC店舗管理システム用）...");

  db.serialize(() => {
    // FC店舗情報テーブル（旧agencies）
    db.run(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 店舗基本情報
        name TEXT NOT NULL,
        business_address TEXT,
        main_phone TEXT,
        manager_name TEXT,
        mobile_phone TEXT,
        representative_email TEXT,
        -- 契約基本情報
        contract_type TEXT,
        contract_start_date DATE,
        royalty_rate REAL DEFAULT 5.0,
        -- 請求基本情報
        invoice_number TEXT,
        bank_name TEXT,
        branch_name TEXT,
        account_type TEXT,
        account_number TEXT,
        account_holder TEXT,
        -- 許認可情報
        license_status TEXT DEFAULT 'none',
        license_type TEXT,
        license_number TEXT,
        license_file_path TEXT,
        -- 連携ID
        line_official_id TEXT,
        representative_gmail TEXT,
        -- システム情報
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 顧客情報管理テーブル（新規追加）
    db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        customer_code TEXT UNIQUE,
        name TEXT NOT NULL,
        kana TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        birth_date DATE,
        gender TEXT,
        registration_date DATE DEFAULT (date('now')),
        last_visit_date DATE,
        total_purchase_amount INTEGER DEFAULT 0,
        visit_count INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // ロイヤリティ設定テーブル（新規追加）
    db.run(`
      CREATE TABLE IF NOT EXISTS royalty_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        royalty_rate REAL NOT NULL,
        effective_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // ロイヤリティ計算結果テーブル（新規追加）
    db.run(`
      CREATE TABLE IF NOT EXISTS royalty_calculations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        calculation_year INTEGER NOT NULL,
        calculation_month INTEGER NOT NULL,
        monthly_sales INTEGER DEFAULT 0,
        royalty_rate REAL NOT NULL,
        royalty_amount INTEGER NOT NULL,
        status TEXT DEFAULT 'calculated',
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id),
        UNIQUE(store_id, calculation_year, calculation_month)
      )
    `);

    // 管理者アカウント専用テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 店舗アカウント専用テーブル（旧users）
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        store_id INTEGER,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // 店舗商品テーブル（旧agency_products）
    db.run(`
      CREATE TABLE IF NOT EXISTS store_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        product_name TEXT,
        product_detail TEXT,
        product_url TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // 商品ファイルテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS product_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        product_name TEXT,
        file_path TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // 売上テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        year INTEGER,
        month INTEGER,
        amount INTEGER,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // グループテーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);

    // グループ-店舗関連テーブル（group_membersに統一）
    db.run(`
      CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        UNIQUE (group_id, store_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // 互換: 旧group_storeが存在する場合はデータ移行
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='group_store'",
      [],
      (err, row) => {
        if (!err && row) {
          db.run(
            `INSERT OR IGNORE INTO group_members (group_id, store_id)
             SELECT group_id, store_id FROM group_store`,
            function (e) {
              if (!e && this.changes > 0) {
                console.log(
                  `group_store から group_members へ ${this.changes} 件を移行しました`
                );
              }
            }
          );
        }
      }
    );

    // グループ-管理者関連テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS group_admin (
        group_id INTEGER,
        admin_id INTEGER,
        PRIMARY KEY (group_id, admin_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (admin_id) REFERENCES admins(id)
      )
    `);

    // 資料テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalname TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        description TEXT,
        store_id INTEGER,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `);

    // 設定テーブル
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT NOT NULL UNIQUE,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 既存データの移行処理
    console.log("データ移行処理を実行中...");

    // agenciesテーブルからstoresテーブルへの移行
    db.run(
      `INSERT OR IGNORE INTO stores (id, name, address, bank_info, contract_date, start_date)
             SELECT id, name, address, bank_info, contract_date, start_date FROM agencies WHERE EXISTS (SELECT name FROM sqlite_master WHERE type='table' AND name='agencies')`,
      function (err) {
        if (!err && this.changes > 0) {
          console.log(`${this.changes}件の店舗データを移行しました`);
        }
      }
    );

    // store_idをagency_idから更新
    db.run(
      `UPDATE users SET store_id = (SELECT agency_id FROM users u2 WHERE u2.id = users.id) WHERE agency_id IS NOT NULL AND EXISTS (SELECT name FROM sqlite_master WHERE type='table' AND name='agencies')`,
      function (err) {
        if (!err && this.changes > 0) {
          console.log(`${this.changes}件のユーザーデータを更新しました`);
        }
      }
    );

    // 初期化完了
    isInitialized = true;
    console.log("ローカルDB初期化完了");

    // デフォルトの管理者アカウントを作成
    const adminPassword =
      process.env.NODE_ENV === "production" ? hashPassword("admin") : "admin";

    db.run(
      "INSERT OR IGNORE INTO admins (email, password) VALUES (?, ?)",
      ["admin", adminPassword],
      (err) => {
        if (err) {
          console.error("デフォルト管理者作成エラー:", err);
        } else {
          console.log("デフォルト管理者アカウント作成完了");
        }

        // 既存のusersテーブルから管理者データを移行
        console.log("既存の管理者データを移行中...");
        db.all(
          "SELECT id, email, password FROM users WHERE role = 'admin'",
          [],
          (err, existingAdmins) => {
            if (err) {
              console.log(
                "管理者データ移行エラー（新規DBの可能性）:",
                err.message
              );
              return;
            }

            if (existingAdmins && existingAdmins.length > 0) {
              console.log(
                `${existingAdmins.length}件の管理者データを移行します`
              );

              let migrationCompleted = 0;
              existingAdmins.forEach((admin) => {
                db.run(
                  "INSERT OR IGNORE INTO admins (email, password) VALUES (?, ?)",
                  [admin.email, admin.password],
                  function (err) {
                    if (err) {
                      console.error(`管理者移行エラー ${admin.email}:`, err);
                    } else {
                      console.log(`管理者移行完了: ${admin.email}`);
                    }

                    migrationCompleted++;
                    if (migrationCompleted === existingAdmins.length) {
                      // 移行後、usersテーブルから管理者データを削除
                      db.run(
                        "DELETE FROM users WHERE role = 'admin'",
                        (err) => {
                          if (err) {
                            console.error(
                              "usersテーブルから管理者データ削除エラー:",
                              err
                            );
                          } else {
                            console.log(
                              "usersテーブルから管理者データを削除完了"
                            );
                          }

                          // usersテーブルからroleカラムを削除（SQLite）
                          db.run(
                            "ALTER TABLE users DROP COLUMN role",
                            (err) => {
                              if (err) {
                                console.log(
                                  "roleカラム削除スキップ:",
                                  err.message
                                );
                              } else {
                                console.log(
                                  "usersテーブルからroleカラムを削除完了"
                                );
                              }
                            }
                          );
                        }
                      );
                    }
                  }
                );
              });
            } else {
              console.log("移行する管理者データがありません");
            }
          }
        );
      }
    );
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

      try {
        const result = await get(sql, params);
        callback(null, result);
      } catch (error) {
        callback(error);
      }
    });
  },

  run: (sql, params, callback) => {
    waitForInitialization(async (err) => {
      if (err) return callback(err);

      try {
        const result = await run(sql, params);

        // SQLiteのthis.lastIDを模倣
        const mockThis = {
          lastID: result.lastID,
          changes: result.changes,
        };
        callback.call(mockThis, null);
      } catch (error) {
        callback(error);
      }
    });
  },

  all: (sql, params, callback) => {
    waitForInitialization(async (err) => {
      if (err) return callback(err);

      try {
        const result = await query(sql, params);
        callback(null, result.rows);
      } catch (error) {
        callback(error);
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
