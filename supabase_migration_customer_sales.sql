-- 売上-顧客連携機能 Supabase移行スクリプト
-- 実行日: 2025-09-25
-- 対象: Supabase (PostgreSQL) 専用
-- 実行方法: Supabase Dashboard の SQL Editor で実行

-- ==============================================
-- Phase 1: 新テーブル作成
-- ==============================================

-- 顧客取引履歴テーブル（個別取引記録用）
CREATE TABLE IF NOT EXISTS customer_transactions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  store_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  transaction_date DATE NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  payment_method TEXT DEFAULT '現金', -- '現金', 'クレジットカード', 'QR決済', 'その他'
  
  -- メタデータ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 外部キー制約
  CONSTRAINT fk_customer_transactions_store 
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_transactions_customer 
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- ==============================================
-- Phase 2: 既存テーブル拡張
-- ==============================================

-- salesテーブルに顧客関連フィールドを追加
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_date DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 外部キー制約追加（既に存在する場合はエラーを無視）
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE sales ADD CONSTRAINT fk_sales_customer 
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_object THEN 
      RAISE NOTICE 'Foreign key constraint already exists, skipping';
  END;
END $$;

-- ==============================================
-- Phase 3: インデックス作成
-- ==============================================

-- customer_transactions テーブル用インデックス
CREATE INDEX IF NOT EXISTS idx_customer_transactions_store_id 
  ON customer_transactions(store_id);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id 
  ON customer_transactions(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_date 
  ON customer_transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_amount 
  ON customer_transactions(amount);

-- sales テーブル用インデックス（新フィールド）
CREATE INDEX IF NOT EXISTS idx_sales_customer_id 
  ON sales(customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_transaction_date 
  ON sales(transaction_date) WHERE transaction_date IS NOT NULL;

-- 複合インデックス
CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_date 
  ON customer_transactions(customer_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_store_date 
  ON customer_transactions(store_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_store_customer 
  ON customer_transactions(store_id, customer_id);

-- ==============================================
-- Phase 4: 集計用ビュー作成
-- ==============================================

-- 顧客別月次売上集計ビュー
CREATE OR REPLACE VIEW customer_monthly_sales AS
SELECT 
  ct.customer_id,
  c.name as customer_name,
  ct.store_id,
  s.name as store_name,
  EXTRACT(YEAR FROM ct.transaction_date)::INTEGER as year,
  EXTRACT(MONTH FROM ct.transaction_date)::INTEGER as month,
  SUM(ct.amount) as monthly_amount,
  COUNT(*) as transaction_count,
  ROUND(AVG(ct.amount), 2) as average_amount,
  MIN(ct.transaction_date) as first_transaction,
  MAX(ct.transaction_date) as last_transaction
FROM customer_transactions ct
JOIN customers c ON ct.customer_id = c.id
JOIN stores s ON ct.store_id = s.id
GROUP BY 
  ct.customer_id, c.name, 
  ct.store_id, s.name,
  EXTRACT(YEAR FROM ct.transaction_date), 
  EXTRACT(MONTH FROM ct.transaction_date)
ORDER BY year DESC, month DESC, monthly_amount DESC;

-- 店舗別顧客売上ランキングビュー
CREATE OR REPLACE VIEW store_customer_ranking AS
SELECT 
  ct.store_id,
  s.name as store_name,
  ct.customer_id,
  c.name as customer_name,
  c.customer_code,
  SUM(ct.amount) as total_amount,
  COUNT(*) as transaction_count,
  ROUND(AVG(ct.amount), 2) as average_amount,
  MAX(ct.transaction_date) as last_transaction,
  MIN(ct.transaction_date) as first_transaction,
  RANK() OVER (PARTITION BY ct.store_id ORDER BY SUM(ct.amount) DESC) as ranking
FROM customer_transactions ct
JOIN customers c ON ct.customer_id = c.id
JOIN stores s ON ct.store_id = s.id
GROUP BY ct.store_id, s.name, ct.customer_id, c.name, c.customer_code
ORDER BY ct.store_id, ranking;

-- 月次売上サマリービュー（店舗別）
CREATE OR REPLACE VIEW monthly_sales_summary AS
SELECT 
  s.id as store_id,
  s.name as store_name,
  EXTRACT(YEAR FROM ct.transaction_date)::INTEGER as year,
  EXTRACT(MONTH FROM ct.transaction_date)::INTEGER as month,
  COUNT(DISTINCT ct.customer_id) as unique_customers,
  COUNT(*) as total_transactions,
  SUM(ct.amount) as total_amount,
  ROUND(AVG(ct.amount), 2) as average_transaction,
  MIN(ct.amount) as min_transaction,
  MAX(ct.amount) as max_transaction
FROM customer_transactions ct
JOIN stores s ON ct.store_id = s.id
GROUP BY s.id, s.name, 
         EXTRACT(YEAR FROM ct.transaction_date), 
         EXTRACT(MONTH FROM ct.transaction_date)
ORDER BY year DESC, month DESC, total_amount DESC;

-- ==============================================
-- Phase 5: 関数とトリガー作成（自動統計更新）
-- ==============================================

-- 顧客統計更新関数
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 新規取引追加時
    UPDATE customers SET
      total_purchase_amount = COALESCE(total_purchase_amount, 0) + NEW.amount,
      visit_count = COALESCE(visit_count, 0) + 1,
      last_visit_date = GREATEST(COALESCE(last_visit_date, NEW.transaction_date), NEW.transaction_date),
      updated_at = NOW()
    WHERE id = NEW.customer_id;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- 取引更新時（顧客が変更される場合も考慮）
    IF OLD.customer_id != NEW.customer_id THEN
      -- 古い顧客の統計を更新
      UPDATE customers SET
        total_purchase_amount = COALESCE(total_purchase_amount, 0) - OLD.amount,
        visit_count = GREATEST(COALESCE(visit_count, 1) - 1, 0),
        last_visit_date = (
          SELECT MAX(transaction_date) 
          FROM customer_transactions 
          WHERE customer_id = OLD.customer_id
        ),
        updated_at = NOW()
      WHERE id = OLD.customer_id;
      
      -- 新しい顧客の統計を更新
      UPDATE customers SET
        total_purchase_amount = COALESCE(total_purchase_amount, 0) + NEW.amount,
        visit_count = COALESCE(visit_count, 0) + 1,
        last_visit_date = GREATEST(COALESCE(last_visit_date, NEW.transaction_date), NEW.transaction_date),
        updated_at = NOW()
      WHERE id = NEW.customer_id;
    ELSE
      -- 同じ顧客の場合は金額差分のみ更新
      UPDATE customers SET
        total_purchase_amount = COALESCE(total_purchase_amount, 0) - OLD.amount + NEW.amount,
        last_visit_date = (
          SELECT MAX(transaction_date) 
          FROM customer_transactions 
          WHERE customer_id = NEW.customer_id
        ),
        updated_at = NOW()
      WHERE id = NEW.customer_id;
    END IF;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- 取引削除時
    UPDATE customers SET
      total_purchase_amount = GREATEST(COALESCE(total_purchase_amount, 0) - OLD.amount, 0),
      visit_count = GREATEST(COALESCE(visit_count, 1) - 1, 0),
      last_visit_date = (
        SELECT MAX(transaction_date) 
        FROM customer_transactions 
        WHERE customer_id = OLD.customer_id
      ),
      updated_at = NOW()
    WHERE id = OLD.customer_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- トリガー作成（既存のものを削除してから作成）
DROP TRIGGER IF EXISTS customer_transactions_stats_trigger ON customer_transactions;
CREATE TRIGGER customer_transactions_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON customer_transactions
  FOR EACH ROW EXECUTE FUNCTION update_customer_stats();

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_transactions_updated_at_trigger ON customer_transactions;
CREATE TRIGGER customer_transactions_updated_at_trigger
  BEFORE UPDATE ON customer_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- Phase 6: RLS (Row Level Security) 設定
-- ==============================================

-- customer_transactionsテーブルのRLS設定
ALTER TABLE customer_transactions ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能、管理者のみ書き込み可能
CREATE POLICY "customer_transactions_select_policy" ON customer_transactions 
  FOR SELECT USING (true);

CREATE POLICY "customer_transactions_insert_policy" ON customer_transactions 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "customer_transactions_update_policy" ON customer_transactions 
  FOR UPDATE USING (true);

CREATE POLICY "customer_transactions_delete_policy" ON customer_transactions 
  FOR DELETE USING (true);

-- ==============================================
-- Phase 7: 初期データ投入（テスト用）
-- ==============================================

-- 既存の顧客データがあるかチェック
DO $$ 
DECLARE
  customer_count INTEGER;
  store_exists BOOLEAN;
BEGIN
  -- 店舗の存在確認
  SELECT EXISTS(SELECT 1 FROM stores LIMIT 1) INTO store_exists;
  
  IF NOT store_exists THEN
    RAISE NOTICE 'No stores found. Please create stores first.';
    RETURN;
  END IF;

  -- 顧客数確認
  SELECT COUNT(*) INTO customer_count FROM customers;
  
  IF customer_count = 0 THEN
    -- テスト用顧客データを追加
    INSERT INTO customers (
      store_id, customer_code, name, kana, email, phone, 
      total_purchase_amount, visit_count, registration_date
    ) 
    SELECT 
      s.id, 
      'CUST' || LPAD((ROW_NUMBER() OVER())::TEXT, 3, '0'),
      customer_data.name,
      customer_data.kana,
      customer_data.email,
      customer_data.phone,
      0, 0, CURRENT_DATE
    FROM stores s
    CROSS JOIN (
      VALUES 
        ('田中太郎', 'タナカタロウ', 'tanaka@example.com', '090-1234-5678'),
        ('佐藤花子', 'サトウハナコ', 'sato@example.com', '090-2345-6789'),
        ('山田次郎', 'ヤマダジロウ', 'yamada@example.com', '090-3456-7890'),
        ('鈴木美咲', 'スズキミサキ', 'suzuki@example.com', '090-4567-8901'),
        ('高橋健太', 'タカハシケンタ', 'takahashi@example.com', '090-5678-9012')
    ) AS customer_data(name, kana, email, phone)
    LIMIT 5;
    
    RAISE NOTICE 'Test customers created successfully';
  ELSE
    RAISE NOTICE 'Customers already exist (%), skipping test data creation', customer_count;
  END IF;
END $$;

-- テスト用取引データ（顧客が存在する場合のみ）
DO $$
DECLARE
  customer_count INTEGER;
  transaction_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO customer_count FROM customers;
  SELECT COUNT(*) INTO transaction_count FROM customer_transactions;
  
  IF customer_count > 0 AND transaction_count = 0 THEN
    -- 過去3ヶ月分のランダム取引データを生成
    INSERT INTO customer_transactions (
      store_id, customer_id, transaction_date, amount, description, payment_method
    )
    SELECT 
      c.store_id,
      c.id,
      CURRENT_DATE - (random() * 90)::INTEGER,
      (1000 + random() * 9000)::INTEGER, -- 1,000円〜10,000円
      CASE 
        WHEN random() < 0.3 THEN 'コーヒー・ドリンク'
        WHEN random() < 0.6 THEN 'フード・軽食'
        WHEN random() < 0.8 THEN 'デザート・ケーキ'
        ELSE 'その他商品'
      END,
      CASE 
        WHEN random() < 0.4 THEN '現金'
        WHEN random() < 0.7 THEN 'クレジットカード'
        WHEN random() < 0.9 THEN 'QR決済'
        ELSE 'その他'
      END
    FROM customers c
    CROSS JOIN generate_series(1, (1 + random() * 4)::INTEGER) -- 顧客ごとに1-5回の取引
    LIMIT 50; -- 最大50件の取引
    
    RAISE NOTICE 'Test transactions created successfully';
  ELSE
    RAISE NOTICE 'Transactions already exist or no customers found, skipping test data creation';
  END IF;
END $$;

-- ==============================================
-- Phase 8: 便利な関数作成
-- ==============================================

-- 顧客の月次売上取得関数
CREATE OR REPLACE FUNCTION get_customer_monthly_sales(
  p_customer_id BIGINT,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS TABLE (
  transaction_date DATE,
  amount INTEGER,
  description TEXT,
  payment_method TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ct.transaction_date,
    ct.amount,
    ct.description,
    ct.payment_method
  FROM customer_transactions ct
  WHERE ct.customer_id = p_customer_id
    AND EXTRACT(YEAR FROM ct.transaction_date) = p_year
    AND EXTRACT(MONTH FROM ct.transaction_date) = p_month
  ORDER BY ct.transaction_date DESC;
END;
$$ LANGUAGE plpgsql;

-- 店舗の売上サマリー取得関数
CREATE OR REPLACE FUNCTION get_store_sales_summary(
  p_store_id BIGINT,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_amount BIGINT,
  transaction_count BIGINT,
  unique_customers BIGINT,
  average_transaction NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(ct.amount), 0) as total_amount,
    COUNT(*) as transaction_count,
    COUNT(DISTINCT ct.customer_id) as unique_customers,
    ROUND(AVG(ct.amount), 2) as average_transaction
  FROM customer_transactions ct
  WHERE ct.store_id = p_store_id
    AND ct.transaction_date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- 実行確認用クエリ
-- ==============================================

-- テーブル作成確認
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
  AND (tablename LIKE '%customer%' OR tablename = 'sales')
ORDER BY tablename;

-- customer_transactions テーブル構造確認
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'customer_transactions'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- インデックス確認
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('customer_transactions', 'sales')
  AND schemaname = 'public'
ORDER BY tablename, indexname;

-- ビュー確認
SELECT 
  viewname,
  definition
FROM pg_views 
WHERE schemaname = 'public'
  AND viewname LIKE '%customer%'
ORDER BY viewname;

-- 関数確認
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND routine_name LIKE '%customer%'
ORDER BY routine_name;

-- データ件数確認
SELECT 
  'customer_transactions' as table_name, 
  COUNT(*) as count 
FROM customer_transactions
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'sales', COUNT(*) FROM sales;

-- ==============================================
-- 使用例とテストクエリ
-- ==============================================

-- 1. 顧客別売上確認
-- SELECT * FROM customer_monthly_sales WHERE year = 2025 AND month = 9;

-- 2. 店舗別ランキング確認
-- SELECT * FROM store_customer_ranking LIMIT 10;

-- 3. 月次売上サマリー確認
-- SELECT * FROM monthly_sales_summary WHERE year = 2025 ORDER BY month DESC;

-- 4. 関数使用例
-- SELECT * FROM get_customer_monthly_sales(1, 2025, 9);
-- SELECT * FROM get_store_sales_summary(1, '2025-09-01', '2025-09-30');

-- 5. 顧客統計確認
-- SELECT 
--   c.name,
--   c.total_purchase_amount,
--   c.visit_count,
--   c.last_visit_date,
--   COUNT(ct.id) as actual_transactions,
--   SUM(ct.amount) as actual_total
-- FROM customers c
-- LEFT JOIN customer_transactions ct ON c.id = ct.customer_id
-- GROUP BY c.id, c.name, c.total_purchase_amount, c.visit_count, c.last_visit_date
-- ORDER BY c.total_purchase_amount DESC;

-- ==============================================
-- 移行完了
-- ==============================================

-- 実行完了メッセージ
DO $$ 
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE '売上-顧客連携機能 Supabase移行完了';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '次のステップ:';
  RAISE NOTICE '1. Node.jsアプリケーションの更新';
  RAISE NOTICE '2. 売上登録画面の改修';
  RAISE NOTICE '3. 顧客詳細画面の拡張';
  RAISE NOTICE '4. APIエンドポイントの追加';
  RAISE NOTICE '==============================================';
END $$;
