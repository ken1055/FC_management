-- Supabaseテーブル完全リセット用SQL
-- このSQLを実行してから、schema.sqlを実行してください

-- 1. 既存のテーブルを削除（外部キー制約も含む）
DROP TABLE IF EXISTS royalty_calculations CASCADE;
DROP TABLE IF EXISTS royalty_settings CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS stores CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- 2. この後、schema.sqlを実行してください
