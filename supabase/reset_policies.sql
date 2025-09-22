-- Supabase RLSポリシー完全リセット用SQL
-- このSQLを段階的に実行してください

-- 1. 全てのRLSポリシーを削除
DROP POLICY IF EXISTS "stores_select_policy" ON stores;
DROP POLICY IF EXISTS "stores_insert_policy" ON stores;
DROP POLICY IF EXISTS "stores_update_policy" ON stores;
DROP POLICY IF EXISTS "stores_delete_policy" ON stores;

DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_delete_policy" ON users;

DROP POLICY IF EXISTS "customers_select_policy" ON customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON customers;
DROP POLICY IF EXISTS "customers_update_policy" ON customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON customers;

DROP POLICY IF EXISTS "sales_select_policy" ON sales;
DROP POLICY IF EXISTS "sales_insert_policy" ON sales;
DROP POLICY IF EXISTS "sales_update_policy" ON sales;
DROP POLICY IF EXISTS "sales_delete_policy" ON sales;

DROP POLICY IF EXISTS "group_members_select_policy" ON group_members;
DROP POLICY IF EXISTS "group_members_insert_policy" ON group_members;
DROP POLICY IF EXISTS "group_members_update_policy" ON group_members;
DROP POLICY IF EXISTS "group_members_delete_policy" ON group_members;

DROP POLICY IF EXISTS "royalty_calculations_select_policy" ON royalty_calculations;
DROP POLICY IF EXISTS "royalty_calculations_insert_policy" ON royalty_calculations;
DROP POLICY IF EXISTS "royalty_calculations_update_policy" ON royalty_calculations;
DROP POLICY IF EXISTS "royalty_calculations_delete_policy" ON royalty_calculations;

DROP POLICY IF EXISTS "royalty_settings_select_policy" ON royalty_settings;
DROP POLICY IF EXISTS "royalty_settings_insert_policy" ON royalty_settings;
DROP POLICY IF EXISTS "royalty_settings_update_policy" ON royalty_settings;
DROP POLICY IF EXISTS "royalty_settings_delete_policy" ON royalty_settings;

DROP POLICY IF EXISTS "system_settings_select_policy" ON system_settings;
DROP POLICY IF EXISTS "system_settings_insert_policy" ON system_settings;
DROP POLICY IF EXISTS "system_settings_update_policy" ON system_settings;
DROP POLICY IF EXISTS "system_settings_delete_policy" ON system_settings;

-- 2. RLSを一時的に無効化
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_calculations DISABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- 3. 管理者テーブルは常にRLS無効
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
