-- 売上-顧客連携機能 データベース移行スクリプト（SQLite版）
-- 実行日: 2025-09-25
-- 対象: SQLite専用

-- ==============================================
-- Phase 1: 新テーブル作成
-- ==============================================

-- 顧客取引履歴テーブル（個別取引記録用）
CREATE TABLE IF NOT EXISTS customer_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  transaction_date DATE NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  payment_method TEXT DEFAULT '現金', -- '現金', 'クレジットカード', 'QR決済', 'その他'
  
  -- メタデータ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 外部キー制約
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- ==============================================
-- Phase 2: 既存テーブル拡張
-- ==============================================

-- salesテーブルに顧客関連フィールドを追加
-- SQLiteでは既存テーブルに外部キー制約付きカラムを追加できないため、新しいテーブルを作成して移行

-- 1. 新しいsalesテーブル作成
CREATE TABLE IF NOT EXISTS sales_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER,
  year INTEGER,
  month INTEGER,
  amount INTEGER,
  -- 新しいフィールド
  customer_id INTEGER,
  transaction_date DATE,
  description TEXT,
  payment_method TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 2. 既存データを新テーブルに移行
INSERT INTO sales_new (id, store_id, year, month, amount, created_at, updated_at)
SELECT id, store_id, year, month, amount, 
       COALESCE(created_at, CURRENT_TIMESTAMP),
       COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM sales;

-- 3. 古いテーブルを削除し、新しいテーブルをリネーム
DROP TABLE sales;
ALTER TABLE sales_new RENAME TO sales;

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
CREATE VIEW IF NOT EXISTS customer_monthly_sales AS
SELECT 
  ct.customer_id,
  c.name as customer_name,
  ct.store_id,
  s.name as store_name,
  strftime('%Y', ct.transaction_date) as year,
  strftime('%m', ct.transaction_date) as month,
  SUM(ct.amount) as monthly_amount,
  COUNT(*) as transaction_count,
  AVG(ct.amount) as average_amount,
  MIN(ct.transaction_date) as first_transaction,
  MAX(ct.transaction_date) as last_transaction
FROM customer_transactions ct
JOIN customers c ON ct.customer_id = c.id
JOIN stores s ON ct.store_id = s.id
GROUP BY ct.customer_id, ct.store_id, year, month
ORDER BY year DESC, month DESC;

-- 店舗別顧客売上ランキングビュー
CREATE VIEW IF NOT EXISTS store_customer_ranking AS
SELECT 
  ct.store_id,
  s.name as store_name,
  ct.customer_id,
  c.name as customer_name,
  SUM(ct.amount) as total_amount,
  COUNT(*) as transaction_count,
  AVG(ct.amount) as average_amount,
  MAX(ct.transaction_date) as last_transaction,
  ROW_NUMBER() OVER (PARTITION BY ct.store_id ORDER BY SUM(ct.amount) DESC) as ranking
FROM customer_transactions ct
JOIN customers c ON ct.customer_id = c.id
JOIN stores s ON ct.store_id = s.id
GROUP BY ct.store_id, ct.customer_id
ORDER BY ct.store_id, ranking;

-- ==============================================
-- Phase 5: トリガー作成（自動統計更新）
-- ==============================================

-- 顧客統計自動更新トリガー（INSERT時）
CREATE TRIGGER IF NOT EXISTS update_customer_stats_insert
AFTER INSERT ON customer_transactions
BEGIN
  UPDATE customers SET
    total_purchase_amount = COALESCE(total_purchase_amount, 0) + NEW.amount,
    visit_count = visit_count + 1,
    last_visit_date = NEW.transaction_date,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.customer_id;
END;

-- 顧客統計自動更新トリガー（UPDATE時）
CREATE TRIGGER IF NOT EXISTS update_customer_stats_update
AFTER UPDATE ON customer_transactions
BEGIN
  -- 古い金額を引いて新しい金額を足す
  UPDATE customers SET
    total_purchase_amount = COALESCE(total_purchase_amount, 0) - OLD.amount + NEW.amount,
    last_visit_date = (
      SELECT MAX(transaction_date) 
      FROM customer_transactions 
      WHERE customer_id = NEW.customer_id
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.customer_id;
END;

-- 顧客統計自動更新トリガー（DELETE時）
CREATE TRIGGER IF NOT EXISTS update_customer_stats_delete
AFTER DELETE ON customer_transactions
BEGIN
  UPDATE customers SET
    total_purchase_amount = COALESCE(total_purchase_amount, 0) - OLD.amount,
    visit_count = GREATEST(visit_count - 1, 0),
    last_visit_date = (
      SELECT MAX(transaction_date) 
      FROM customer_transactions 
      WHERE customer_id = OLD.customer_id
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.customer_id;
END;

-- ==============================================
-- Phase 6: 初期データ投入（テスト用）
-- ==============================================

-- テスト用顧客データ（既存データがない場合）
INSERT OR IGNORE INTO customers (
  store_id, customer_code, name, kana, email, phone, 
  total_purchase_amount, visit_count, registration_date
) VALUES 
  (1, 'CUST001', '田中太郎', 'タナカタロウ', 'tanaka@example.com', '090-1234-5678', 0, 0, '2025-01-01'),
  (1, 'CUST002', '佐藤花子', 'サトウハナコ', 'sato@example.com', '090-2345-6789', 0, 0, '2025-01-15'),
  (1, 'CUST003', '山田次郎', 'ヤマダジロウ', 'yamada@example.com', '090-3456-7890', 0, 0, '2025-02-01');

-- テスト用取引データ
INSERT OR IGNORE INTO customer_transactions (
  store_id, customer_id, transaction_date, amount, description, payment_method
) VALUES 
  (1, 1, '2025-01-15', 5000, 'コーヒー豆購入', '現金'),
  (1, 1, '2025-02-10', 3000, 'ドリンク', 'クレジットカード'),
  (1, 2, '2025-01-20', 8000, 'ケーキセット', '現金'),
  (1, 2, '2025-02-15', 4500, 'コーヒー＋デザート', 'QR決済'),
  (1, 3, '2025-02-05', 2500, 'ドリンクのみ', '現金');

-- ==============================================
-- 実行確認用クエリ
-- ==============================================

-- テーブル作成確認
.tables

-- customer_transactions テーブル構造確認
.schema customer_transactions

-- sales テーブル構造確認（拡張後）
.schema sales

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

-- 移行スクリプト実行完了
-- 次のステップ: Node.jsアプリケーションの更新
