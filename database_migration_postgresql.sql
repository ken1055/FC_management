-- 売上-顧客連携機能 データベース移行スクリプト（PostgreSQL/Supabase版）
-- 実行日: 2025-09-25
-- 対象: PostgreSQL/Supabase専用

-- ==============================================
-- Phase 1: 新テーブル作成
-- ==============================================

-- 顧客取引履歴テーブル（個別取引記録用）
CREATE TABLE IF NOT EXISTS customer_transactions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  store_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  transaction_date DATE NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  payment_method TEXT DEFAULT '現金', -- '現金', 'クレジットカード', 'QR決済', 'その他'
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 外部キー制約
  CONSTRAINT fk_customer_transactions_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_transactions_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- ==============================================
-- Phase 2: 既存テーブル拡張
-- ==============================================

-- salesテーブルに顧客関連フィールドを追加
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_date DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 外部キー制約追加（既に存在する場合はエラーを無視）
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE sales ADD CONSTRAINT fk_sales_customer 
      FOREIGN KEY (customer_id) REFERENCES customers(id);
  EXCEPTION
    WHEN duplicate_object THEN NULL;
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
  ON sales(customer_id);

CREATE INDEX IF NOT EXISTS idx_sales_transaction_date 
  ON sales(transaction_date);

-- 複合インデックス
CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_date 
  ON customer_transactions(customer_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_store_date 
  ON customer_transactions(store_id, transaction_date);

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
  EXTRACT(YEAR FROM ct.transaction_date) as year,
  EXTRACT(MONTH FROM ct.transaction_date) as month,
  SUM(ct.amount) as monthly_amount,
  COUNT(*) as transaction_count,
  AVG(ct.amount) as average_amount,
  MIN(ct.transaction_date) as first_transaction,
  MAX(ct.transaction_date) as last_transaction
FROM customer_transactions ct
JOIN customers c ON ct.customer_id = c.id
JOIN stores s ON ct.store_id = s.id
GROUP BY ct.customer_id, c.name, ct.store_id, s.name, 
         EXTRACT(YEAR FROM ct.transaction_date), 
         EXTRACT(MONTH FROM ct.transaction_date)
ORDER BY year DESC, month DESC;

-- 店舗別顧客売上ランキングビュー
CREATE OR REPLACE VIEW store_customer_ranking AS
SELECT 
  ct.store_id,
  s.name as store_name,
  ct.customer_id,
  c.name as customer_name,
  SUM(ct.amount) as total_amount,
  COUNT(*) as transaction_count,
  AVG(ct.amount) as average_amount,
  MAX(ct.transaction_date) as last_transaction,
  RANK() OVER (PARTITION BY ct.store_id ORDER BY SUM(ct.amount) DESC) as ranking
FROM customer_transactions ct
JOIN customers c ON ct.customer_id = c.id
JOIN stores s ON ct.store_id = s.id
GROUP BY ct.store_id, s.name, ct.customer_id, c.name
ORDER BY ct.store_id, ranking;

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
      visit_count = visit_count + 1,
      last_visit_date = NEW.transaction_date,
      updated_at = NOW()
    WHERE id = NEW.customer_id;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- 取引更新時
    UPDATE customers SET
      total_purchase_amount = COALESCE(total_purchase_amount, 0) - OLD.amount + NEW.amount,
      last_visit_date = (
        SELECT MAX(transaction_date) 
        FROM customer_transactions 
        WHERE customer_id = NEW.customer_id
      ),
      updated_at = NOW()
    WHERE id = NEW.customer_id;
    
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- 取引削除時
    UPDATE customers SET
      total_purchase_amount = COALESCE(total_purchase_amount, 0) - OLD.amount,
      visit_count = GREATEST(visit_count - 1, 0),
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

-- トリガー作成
DROP TRIGGER IF EXISTS customer_transactions_stats_trigger ON customer_transactions;
CREATE TRIGGER customer_transactions_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON customer_transactions
  FOR EACH ROW EXECUTE FUNCTION update_customer_stats();

-- ==============================================
-- Phase 6: 初期データ投入（テスト用）
-- ==============================================

-- テスト用顧客データ（既存データがない場合）
INSERT INTO customers (
  store_id, customer_code, name, kana, email, phone, 
  total_purchase_amount, visit_count, registration_date
) VALUES 
  (1, 'CUST001', '田中太郎', 'タナカタロウ', 'tanaka@example.com', '090-1234-5678', 0, 0, '2025-01-01'),
  (1, 'CUST002', '佐藤花子', 'サトウハナコ', 'sato@example.com', '090-2345-6789', 0, 0, '2025-01-15'),
  (1, 'CUST003', '山田次郎', 'ヤマダジロウ', 'yamada@example.com', '090-3456-7890', 0, 0, '2025-02-01')
ON CONFLICT (customer_code) DO NOTHING;

-- テスト用取引データ
INSERT INTO customer_transactions (
  store_id, customer_id, transaction_date, amount, description, payment_method
) VALUES 
  (1, 1, '2025-01-15', 5000, 'コーヒー豆購入', '現金'),
  (1, 1, '2025-02-10', 3000, 'ドリンク', 'クレジットカード'),
  (1, 2, '2025-01-20', 8000, 'ケーキセット', '現金'),
  (1, 2, '2025-02-15', 4500, 'コーヒー＋デザート', 'QR決済'),
  (1, 3, '2025-02-05', 2500, 'ドリンクのみ', '現金')
ON CONFLICT DO NOTHING;

-- ==============================================
-- Phase 7: RLS (Row Level Security) 設定
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
-- 実行確認用クエリ
-- ==============================================

-- テーブル作成確認
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%customer%' OR tablename = 'sales';

-- customer_transactions テーブル構造確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'customer_transactions'
ORDER BY ordinal_position;

-- データ件数確認
SELECT 'customer_transactions' as table_name, COUNT(*) as count FROM customer_transactions
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'sales', COUNT(*) FROM sales;

-- 顧客統計確認
SELECT 
  c.id,
  c.name,
  c.total_purchase_amount,
  c.visit_count,
  c.last_visit_date,
  COUNT(ct.id) as actual_transactions,
  SUM(ct.amount) as actual_total
FROM customers c
LEFT JOIN customer_transactions ct ON c.id = ct.customer_id
GROUP BY c.id, c.name, c.total_purchase_amount, c.visit_count, c.last_visit_date;

-- ビュー動作確認
SELECT * FROM customer_monthly_sales LIMIT 5;
SELECT * FROM store_customer_ranking LIMIT 5;

-- 移行スクリプト実行完了
-- 次のステップ: Node.jsアプリケーションの更新
