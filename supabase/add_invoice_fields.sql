-- royalty_calculationsテーブルに請求書関連のカラムを追加

-- invoice_generatedカラムを追加（請求書生成済みフラグ）
ALTER TABLE royalty_calculations 
ADD COLUMN IF NOT EXISTS invoice_generated BOOLEAN DEFAULT FALSE;

-- invoice_pathカラムを追加（請求書ファイルパス）
ALTER TABLE royalty_calculations 
ADD COLUMN IF NOT EXISTS invoice_path TEXT;

-- インデックスを追加（請求書生成済みで検索することが多いため）
CREATE INDEX IF NOT EXISTS idx_royalty_calculations_invoice_generated 
ON royalty_calculations(invoice_generated);

-- 確認用
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'royalty_calculations'
ORDER BY ordinal_position;

