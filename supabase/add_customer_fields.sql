-- 顧客テーブルにkana（フリガナ）とgender（性別）列を追加

-- kana列を追加（フリガナ）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS kana TEXT;

-- gender列を追加（性別）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender TEXT;

-- コメント追加
COMMENT ON COLUMN customers.kana IS 'フリガナ（カタカナ）';
COMMENT ON COLUMN customers.gender IS '性別（男性、女性、その他）';
