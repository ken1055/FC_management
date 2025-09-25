-- 顧客テーブルにkana（フリガナ）とgender（性別）列を追加

-- kana列を追加（フリガナ）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS kana TEXT;

-- gender列を追加（性別）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender TEXT;

-- 購入履歴情報の列を追加
ALTER TABLE customers ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_purchase_amount INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_date DATE;

-- コメント追加
COMMENT ON COLUMN customers.kana IS 'フリガナ（カタカナ）';
COMMENT ON COLUMN customers.gender IS '性別（男性、女性、その他）';
COMMENT ON COLUMN customers.visit_count IS '来店回数';
COMMENT ON COLUMN customers.total_purchase_amount IS '総購入金額';
COMMENT ON COLUMN customers.last_visit_date IS '最終来店日';
