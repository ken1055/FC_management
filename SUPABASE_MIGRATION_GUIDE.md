# Supabase 売上-顧客連携機能 移行ガイド

## 📋 実行手順

### **Step 1: Supabase Dashboard にアクセス**

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. 対象のプロジェクトを選択
3. 左メニューから **SQL Editor** を選択

### **Step 2: SQL スクリプト実行**

1. **New query** をクリック
2. `supabase_migration_customer_sales.sql` の内容をコピー＆ペースト
3. **Run** ボタンをクリックして実行

### **Step 3: 実行結果確認**

実行後、以下のメッセージが表示されれば成功：

```
==============================================
売上-顧客連携機能 Supabase移行完了
==============================================
```

## 🔍 作成される要素

### **新テーブル**

- `customer_transactions`: 個別取引履歴

### **既存テーブル拡張**

- `sales`: 顧客関連フィールド追加
  - `customer_id`: 顧客 ID
  - `transaction_date`: 取引日
  - `description`: 取引内容
  - `payment_method`: 支払方法

### **ビュー**

- `customer_monthly_sales`: 顧客別月次売上
- `store_customer_ranking`: 店舗別顧客ランキング
- `monthly_sales_summary`: 月次売上サマリー

### **関数**

- `update_customer_stats()`: 顧客統計自動更新
- `get_customer_monthly_sales()`: 顧客月次売上取得
- `get_store_sales_summary()`: 店舗売上サマリー取得

### **トリガー**

- 取引データ変更時の顧客統計自動更新
- `updated_at`フィールド自動更新

## 🔧 Supabase 固有の対応

### **データ型**

- `BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY`
- `TIMESTAMP WITH TIME ZONE`
- PostgreSQL 標準関数使用

### **RLS (Row Level Security)**

- 全テーブルで RLS 有効化
- 適切なポリシー設定

### **インデックス最適化**

- 部分インデックス使用（`WHERE` 条件付き）
- 複合インデックスで検索性能向上

## 📊 テストデータ

スクリプト実行時に自動的に作成されるテスト用データ：

### **顧客データ（5 名）**

- 田中太郎 (CUST001)
- 佐藤花子 (CUST002)
- 山田次郎 (CUST003)
- 鈴木美咲 (CUST004)
- 高橋健太 (CUST005)

### **取引データ**

- 過去 3 ヶ月分のランダム取引
- 1,000 円〜10,000 円の範囲
- 様々な支払方法・商品

## 🚀 実行後の確認方法

### **1. テーブル確認**

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND (tablename LIKE '%customer%' OR tablename = 'sales');
```

### **2. データ件数確認**

```sql
SELECT
  'customer_transactions' as table_name, COUNT(*) as count
FROM customer_transactions
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'sales', COUNT(*) FROM sales;
```

### **3. 顧客統計確認**

```sql
SELECT
  c.name,
  c.total_purchase_amount,
  c.visit_count,
  c.last_visit_date
FROM customers c
WHERE c.total_purchase_amount > 0
ORDER BY c.total_purchase_amount DESC;
```

### **4. 月次売上確認**

```sql
SELECT * FROM customer_monthly_sales
WHERE year = 2025
ORDER BY year DESC, month DESC, monthly_amount DESC;
```

## ⚠️ 注意事項

### **実行前の確認**

1. **バックアップ作成**: 重要なデータがある場合は事前バックアップ
2. **権限確認**: Supabase プロジェクトの管理者権限が必要
3. **既存データ**: 既存の`customers`や`sales`データは保持されます

### **エラーが発生した場合**

1. **外部キー制約エラー**: 既存データの整合性を確認
2. **権限エラー**: プロジェクトの権限設定を確認
3. **構文エラー**: PostgreSQL 14+ の機能を使用

## 🔄 ロールバック方法

問題が発生した場合のロールバック手順：

```sql
-- 新しいテーブルとビューを削除
DROP VIEW IF EXISTS customer_monthly_sales CASCADE;
DROP VIEW IF EXISTS store_customer_ranking CASCADE;
DROP VIEW IF EXISTS monthly_sales_summary CASCADE;
DROP TABLE IF EXISTS customer_transactions CASCADE;

-- salesテーブルから追加カラムを削除
ALTER TABLE sales DROP COLUMN IF EXISTS customer_id;
ALTER TABLE sales DROP COLUMN IF EXISTS transaction_date;
ALTER TABLE sales DROP COLUMN IF EXISTS description;
ALTER TABLE sales DROP COLUMN IF EXISTS payment_method;

-- 関数とトリガーを削除
DROP FUNCTION IF EXISTS update_customer_stats() CASCADE;
DROP FUNCTION IF EXISTS get_customer_monthly_sales(BIGINT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_store_sales_summary(BIGINT, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
```

## 📞 サポート

実行中に問題が発生した場合：

1. **Supabase Logs**: Dashboard の Logs セクションでエラー確認
2. **SQL Editor**: エラーメッセージの詳細確認
3. **Database**: Table Editor でテーブル作成状況確認

**準備完了です！Supabase Dashboard で SQL スクリプトを実行してください。**
