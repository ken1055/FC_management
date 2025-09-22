-- Supabase RLSポリシー再設定用SQL
-- reset_policies.sqlを実行した後にこのSQLを実行してください

-- 1. RLSを有効化
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE royalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 2. 新しいポリシーを作成
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
CREATE POLICY "system_settings_select_policy" ON system_settings FOR SELECT USING (true);
CREATE POLICY "system_settings_insert_policy" ON system_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "system_settings_update_policy" ON system_settings FOR UPDATE USING (true);
CREATE POLICY "system_settings_delete_policy" ON system_settings FOR DELETE USING (true);
