-- ユーザーを管理者に昇格させるSQLスクリプト
-- 
-- 使い方:
-- 1. メールアドレスを指定して実行してください
-- 2. このスクリプトは既存の店舗ユーザー(users)を管理者(admins)に昇格させます
-- 3. 元の代理店アカウントは削除されません（削除したい場合は方法2を使用してください）

-- ========================================
-- 方法1: 既存のusersテーブルのユーザーを管理者に昇格（元のアカウントは保持）
-- ========================================

-- 昇格させたいユーザーのメールアドレスをここに指定してください
DO $$
DECLARE
    target_email TEXT := 'test@gmail.com';  -- ← ここを変更してください
    user_password TEXT;
BEGIN
    -- usersテーブルからパスワードを取得
    SELECT password INTO user_password
    FROM users
    WHERE email = target_email;
    
    -- ユーザーが存在しない場合
    IF user_password IS NULL THEN
        RAISE NOTICE 'エラー: メールアドレス % のユーザーが見つかりません', target_email;
        RETURN;
    END IF;
    
    -- adminsテーブルに挿入（既に存在する場合はスキップ）
    INSERT INTO admins (email, password)
    VALUES (target_email, user_password)
    ON CONFLICT (email) DO NOTHING;
    
    -- 結果を表示
    IF FOUND THEN
        RAISE NOTICE '成功: % を管理者に昇格させました', target_email;
    ELSE
        RAISE NOTICE '注意: % は既に管理者アカウントが存在します', target_email;
    END IF;
END $$;


-- ========================================
-- 方法2: 店舗ユーザーアカウントを削除（既に管理者として存在する場合）
-- ========================================

-- 既に管理者として存在しているが、店舗ユーザーとしても重複している場合に使用
-- 店舗ユーザー側のアカウントのみを削除します

-- test@gmail.com の店舗ユーザーアカウントを削除
DELETE FROM users WHERE email = 'test@gmail.com';

-- 削除後の確認
SELECT 'test@gmail.com のアカウント状態:' as info;
SELECT 
    'admin' as アカウント種別,
    id,
    email,
    created_at
FROM admins
WHERE email = 'test@gmail.com'

UNION ALL

SELECT 
    'store_user' as アカウント種別,
    id,
    email,
    created_at
FROM users
WHERE email = 'test@gmail.com';


-- ========================================
-- 方法2-B: ユーザーを管理者に昇格し、元の店舗アカウントを削除（汎用版）
-- ========================================
/*
DO $$
DECLARE
    target_email TEXT := 'user@example.com';  -- ← ここを変更してください
    user_password TEXT;
BEGIN
    -- usersテーブルからパスワードを取得
    SELECT password INTO user_password
    FROM users
    WHERE email = target_email;
    
    -- ユーザーが存在しない場合
    IF user_password IS NULL THEN
        RAISE NOTICE 'エラー: メールアドレス % のユーザーが見つかりません', target_email;
        RETURN;
    END IF;
    
    -- adminsテーブルに挿入
    INSERT INTO admins (email, password)
    VALUES (target_email, user_password)
    ON CONFLICT (email) DO NOTHING;
    
    -- 元の店舗アカウントを削除
    DELETE FROM users WHERE email = target_email;
    
    RAISE NOTICE '成功: % を管理者に昇格させ、店舗アカウントを削除しました', target_email;
END $$;
*/


-- ========================================
-- パスワードリセット・変更
-- ========================================

-- test@gmail.com のパスワードを 'password123' に変更
-- ※セキュリティのため、プレーンテキストは開発環境のみで使用してください

-- 管理者アカウントのパスワードを変更
UPDATE admins 
SET password = '0000', 
    updated_at = NOW()
WHERE email = 'test@gmail.com';

-- 確認
SELECT 
    'admin' as アカウント種別,
    id,
    email,
    password,
    updated_at
FROM admins
WHERE email = 'test@gmail.com';


-- ========================================
-- 【本番環境用】bcryptハッシュでパスワードを設定
-- ========================================

-- 本番環境では、事前にbcryptでハッシュ化したパスワードを使用してください
-- 例: 'password123' をbcryptでハッシュ化した値
-- $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy

/*
UPDATE admins 
SET password = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 
    updated_at = NOW()
WHERE email = 'test@gmail.com';
*/


-- ========================================
-- 方法3: 新しい管理者アカウントを直接作成
-- ========================================

-- 新しい管理者アカウントを作成する場合はこちらを使用してください
-- （既存のユーザーではなく、全く新しい管理者を作成）

/*
INSERT INTO admins (email, password)
VALUES ('newadmin@example.com', 'password123')  -- ← メールアドレスとパスワードを変更してください
ON CONFLICT (email) DO NOTHING;
*/


-- ========================================
-- 確認用クエリ
-- ========================================

-- 特定のアカウント情報を確認（管理者か店舗ユーザーか判定）
-- メールアドレスを指定してください
SELECT 
    'admin' as account_type,
    id,
    email,
    NULL as store_id,
    created_at,
    updated_at
FROM admins
WHERE email = 'benriyamatsueotetsudaiya@gmail.com'

UNION ALL

SELECT 
    'store_user' as account_type,
    id,
    email,
    store_id,
    created_at,
    updated_at
FROM users
WHERE email = 'benriyamatsueotetsudaiya@gmail.com';


-- ========================================
-- すべてのアカウントの全情報を確認（管理者と店舗ユーザー）
-- ========================================

-- 管理者テーブルの全データを表示
SELECT 
    'admin' as account_type,
    id,
    email,
    password,
    NULL as store_id,
    created_at,
    updated_at
FROM admins

UNION ALL

-- 店舗ユーザーテーブルの全データを表示
SELECT 
    'store_user' as account_type,
    id,
    email,
    password,
    store_id,
    created_at,
    updated_at
FROM users

ORDER BY account_type, id;


-- ========================================
-- FC管理システムの全データ確認（店舗・ユーザー・管理者）
-- ========================================

-- 1. FC店舗テーブルの全レコード
SELECT '=== FC店舗一覧 (STORES) ===' as info;
SELECT 
    id,
    name as 店舗名,
    manager_name as 店舗責任者,
    main_phone as 電話番号,
    representative_email as メールアドレス,
    status as ステータス,
    contract_type as 契約タイプ,
    created_at as 作成日時
FROM stores 
ORDER BY id;

-- 2. 店舗ユーザーテーブルの全レコード（FC店舗のログインアカウント）
SELECT '=== FC店舗ユーザー一覧 (USERS) ===' as info;
SELECT 
    u.id,
    u.email,
    u.store_id as 紐付き店舗ID,
    s.name as 店舗名,
    u.created_at as 作成日時
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
ORDER BY u.id;

-- 3. 管理者テーブルの全レコード
SELECT '=== 管理者一覧 (ADMINS) ===' as info;
SELECT 
    id,
    email,
    created_at as 作成日時
FROM admins 
ORDER BY id;

-- 4. テーブルの件数確認
SELECT 
    (SELECT COUNT(*) FROM stores) as FC店舗数,
    (SELECT COUNT(*) FROM users) as 店舗ユーザー数,
    (SELECT COUNT(*) FROM admins) as 管理者数;

-- 5. 全アカウント詳細（パスワード情報含む）
SELECT 
    'admin' as アカウント種別,
    id,
    email,
    password,
    NULL as store_id,
    NULL as 店舗名,
    created_at
FROM admins

UNION ALL

SELECT 
    'store_user' as アカウント種別,
    u.id,
    u.email,
    u.password,
    u.store_id,
    s.name as 店舗名,
    u.created_at
FROM users u
LEFT JOIN stores s ON u.store_id = s.id

ORDER BY アカウント種別, id;


-- 現在の管理者一覧のみを確認
-- SELECT id, email, created_at FROM admins ORDER BY id;

-- 現在の代理店ユーザー一覧のみを確認
-- SELECT id, email, store_id, created_at FROM users ORDER BY id;

