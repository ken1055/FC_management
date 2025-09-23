-- FC店舗管理システム用 Supabaseスキーマ

-- 管理者テーブル
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 店舗テーブル
CREATE TABLE IF NOT EXISTS stores (
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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  store_id INTEGER REFERENCES stores(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 顧客テーブル
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  store_id INTEGER REFERENCES stores(id),
  customer_code TEXT UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  birth_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 売上テーブル
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  store_id INTEGER REFERENCES stores(id),
  amount INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- グループテーブル
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- グループメンバーテーブル
CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  group_id INTEGER REFERENCES groups(id),
  store_id INTEGER REFERENCES stores(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, store_id)
);

-- ロイヤリティ計算テーブル
CREATE TABLE IF NOT EXISTS royalty_calculations (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  store_id INTEGER REFERENCES stores(id),
  calculation_year INTEGER NOT NULL,
  calculation_month INTEGER NOT NULL,
  monthly_sales INTEGER DEFAULT 0,
  royalty_rate DECIMAL(5,2) NOT NULL,
  royalty_amount INTEGER NOT NULL,
  status TEXT DEFAULT 'calculated',
  calculated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(store_id, calculation_year, calculation_month)
);

-- ロイヤリティ設定テーブル
CREATE TABLE IF NOT EXISTS royalty_settings (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  store_id INTEGER REFERENCES stores(id),
  rate DECIMAL(5,2) NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- システム設定テーブル
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE (group_id, store_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_year_month ON sales(year, month);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_store_id ON group_members(store_id);
CREATE INDEX IF NOT EXISTS idx_royalty_calculations_store_id ON royalty_calculations(store_id);
CREATE INDEX IF NOT EXISTS idx_royalty_calculations_year_month ON royalty_calculations(calculation_year, calculation_month);
CREATE INDEX IF NOT EXISTS idx_royalty_settings_store_id ON royalty_settings(store_id);

-- RLS (Row Level Security) 設定
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_settings ENABLE ROW LEVEL SECURITY;

-- RLSポリシー設定
-- 管理者テーブルはRLSを無効化（管理者は全アクセス）
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;

-- storesテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "stores_select_policy" ON stores FOR SELECT USING (true);
CREATE POLICY "stores_insert_policy" ON stores FOR INSERT WITH CHECK (true);
CREATE POLICY "stores_update_policy" ON stores FOR UPDATE USING (true);
CREATE POLICY "stores_delete_policy" ON stores FOR DELETE USING (true);

-- usersテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "users_select_policy" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert_policy" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update_policy" ON users FOR UPDATE USING (true);
CREATE POLICY "users_delete_policy" ON users FOR DELETE USING (true);

-- customersテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "customers_select_policy" ON customers FOR SELECT USING (true);
CREATE POLICY "customers_insert_policy" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_update_policy" ON customers FOR UPDATE USING (true);
CREATE POLICY "customers_delete_policy" ON customers FOR DELETE USING (true);

-- salesテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "sales_select_policy" ON sales FOR SELECT USING (true);
CREATE POLICY "sales_insert_policy" ON sales FOR INSERT WITH CHECK (true);
CREATE POLICY "sales_update_policy" ON sales FOR UPDATE USING (true);
CREATE POLICY "sales_delete_policy" ON sales FOR DELETE USING (true);

-- group_membersテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "group_members_select_policy" ON group_members FOR SELECT USING (true);
CREATE POLICY "group_members_insert_policy" ON group_members FOR INSERT WITH CHECK (true);
CREATE POLICY "group_members_update_policy" ON group_members FOR UPDATE USING (true);
CREATE POLICY "group_members_delete_policy" ON group_members FOR DELETE USING (true);

-- royalty_calculationsテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "royalty_calculations_select_policy" ON royalty_calculations FOR SELECT USING (true);
CREATE POLICY "royalty_calculations_insert_policy" ON royalty_calculations FOR INSERT WITH CHECK (true);
CREATE POLICY "royalty_calculations_update_policy" ON royalty_calculations FOR UPDATE USING (true);
CREATE POLICY "royalty_calculations_delete_policy" ON royalty_calculations FOR DELETE USING (true);

-- royalty_settingsテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "royalty_settings_select_policy" ON royalty_settings FOR SELECT USING (true);
CREATE POLICY "royalty_settings_insert_policy" ON royalty_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "royalty_settings_update_policy" ON royalty_settings FOR UPDATE USING (true);
CREATE POLICY "royalty_settings_delete_policy" ON royalty_settings FOR DELETE USING (true);

-- system_settingsテーブル: 全ユーザーが読み取り可能、管理者のみ書き込み可能
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_settings_select_policy" ON system_settings FOR SELECT USING (true);
CREATE POLICY "system_settings_insert_policy" ON system_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "system_settings_update_policy" ON system_settings FOR UPDATE USING (true);
CREATE POLICY "system_settings_delete_policy" ON system_settings FOR DELETE USING (true);

-- 初期データ
INSERT INTO admins (email, password) VALUES 
  ('admin', 'admin')
ON CONFLICT (email) DO NOTHING;
