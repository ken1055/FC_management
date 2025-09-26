PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE stores (
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
      );
INSERT INTO stores VALUES(1,'テスト店舗','東京都新宿区テスト町1-2-3','03-1234-5678','田中太郎','090-1234-5678','test@example.com','franchise','2024-01-01',5.0,'T1234567890123','テスト銀行','新宿支店','ordinary','1234567','テスト店舗','have','飲食店営業許可','12345',NULL,'@test_store','test.store@gmail.com','active','2025-09-21 16:08:46','2025-09-21 16:08:46');
CREATE TABLE customers (
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
      );
CREATE TABLE royalty_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        royalty_rate REAL NOT NULL,
        effective_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
CREATE TABLE royalty_calculations (
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
      );
INSERT INTO royalty_calculations VALUES(1,1,2025,1,100000,5.0,5000,'calculated','2025-09-21 16:14:41');
INSERT INTO royalty_calculations VALUES(2,1,2025,2,200000,5.0,10000,'calculated','2025-09-21 16:14:56');
CREATE TABLE admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
INSERT INTO admins VALUES(1,'admin','admin','2025-09-21 16:03:11');
CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        store_id INTEGER,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
INSERT INTO users VALUES(1,'store@test.com','$2a$10$PHUnlp1f7pdz6Addu1271.FP1mJcwHUevQ5IWHR4AnYIEWUaJRm2i',1);
CREATE TABLE store_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        product_name TEXT,
        product_detail TEXT,
        product_url TEXT,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
CREATE TABLE product_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        product_name TEXT,
        file_path TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        year INTEGER,
        month INTEGER,
        amount INTEGER,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
INSERT INTO sales VALUES(1,1,2025,1,100000);
INSERT INTO sales VALUES(2,1,2025,2,200000);
CREATE TABLE groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
CREATE TABLE group_store (
        group_id INTEGER,
        store_id INTEGER,
        PRIMARY KEY (group_id, store_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
CREATE TABLE group_admin (
        group_id INTEGER,
        admin_id INTEGER,
        PRIMARY KEY (group_id, admin_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (admin_id) REFERENCES admins(id)
      );
CREATE TABLE materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalname TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        description TEXT,
        store_id INTEGER,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
CREATE TABLE settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT NOT NULL UNIQUE,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
CREATE TABLE group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        UNIQUE (group_id, store_id),
        FOREIGN KEY (group_id) REFERENCES groups(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      );
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('admins',7);
INSERT INTO sqlite_sequence VALUES('stores',1);
INSERT INTO sqlite_sequence VALUES('users',1);
INSERT INTO sqlite_sequence VALUES('sales',2);
INSERT INTO sqlite_sequence VALUES('royalty_calculations',2);
INSERT INTO sqlite_sequence VALUES('group_members',0);
COMMIT;
