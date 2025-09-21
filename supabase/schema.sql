-- FC店舗管理システム用 Supabaseスキーマ

-- 管理者テーブル
CREATE TABLE IF NOT EXISTS admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 店舗テーブル
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 顧客テーブル
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
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
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
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
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- グループメンバーテーブル
CREATE TABLE IF NOT EXISTS group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES groups(id),
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(group_id, store_id)
);

-- ロイヤリティ計算テーブル
CREATE TABLE IF NOT EXISTS royalty_calculations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
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
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  rate DECIMAL(5,2) NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- システム設定テーブル
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
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

-- デフォルトポリシー（管理者は全アクセス、ユーザーは自店舗のみ）
-- 注意: 実際の実装では、認証システムに応じてポリシーを調整する必要があります

-- 初期データ
INSERT INTO admins (email, password) VALUES 
  ('admin', '$2a$10$rXvZfQQgVmkB8Z2QJ9Xz4.CqKqGqGqGqGqGqGqGqGqGqGqGqGqGqGq')
ON CONFLICT (email) DO NOTHING;
