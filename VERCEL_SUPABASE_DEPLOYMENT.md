# FC 店舗管理システム - Vercel & Supabase デプロイメントガイド

このガイドでは、FC 店舗管理システムを Vercel と Supabase にデプロイする手順を説明します。

## 前提条件

- GitHub アカウント
- Vercel アカウント
- Supabase アカウント

## 1. Supabase プロジェクトの設定

### 1.1 Supabase プロジェクト作成

1. [Supabase](https://supabase.com)にログイン
2. 「New project」をクリック
3. プロジェクト名を入力（例：fc-store-management）
4. データベースパスワードを設定
5. リージョンを選択（推奨：Tokyo）
6. 「Create new project」をクリック

### 1.2 データベーススキーマの作成

1. Supabase ダッシュボードで「SQL Editor」を開く
2. `supabase/schema.sql`の内容をコピー＆ペースト
3. 「Run」をクリックしてスキーマを作成

### 1.3 API キーの取得

1. Supabase ダッシュボードで「Settings」→「API」を開く
2. 以下の値をメモ：
   - `Project URL`
   - `anon public` キー
   - `service_role` キー（管理者操作用）

## 2. Vercel プロジェクトの設定

### 2.1 GitHub リポジトリの作成

1. プロジェクトを GitHub リポジトリにプッシュ

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/fc-store-management.git
git push -u origin main
```

### 2.2 Vercel にデプロイ

1. [Vercel](https://vercel.com)にログイン
2. 「New Project」をクリック
3. GitHub リポジトリを選択
4. プロジェクト設定：
   - Framework Preset: `Other`
   - Root Directory: `./`
   - Build Command: `npm run build`（必要に応じて）
   - Output Directory: `./`

### 2.3 環境変数の設定

Vercel ダッシュボードで「Settings」→「Environment Variables」を開き、以下を設定：

#### 必須設定

```
NODE_ENV=production
SESSION_SECRET=your-very-strong-secret-key-here-min-32-characters
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

#### オプション設定

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
ADMIN_PROMOTION_PASS=your-admin-promotion-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAILS=admin@yourcompany.com
```

## 3. セキュリティ設定

### 3.1 Supabase Row Level Security (RLS)

1. Supabase ダッシュボードで「Authentication」→「Settings」を開く
2. 必要に応じて認証設定を調整
3. 各テーブルの RLS ポリシーを設定

### 3.2 CORS 設定

Supabase ダッシュボードで「Settings」→「API」→「CORS」に Vercel ドメインを追加：

```
https://your-app-name.vercel.app
```

## 4. 初期データの設定

### 4.1 管理者アカウント

デフォルトの管理者アカウント：

- Email: `admin`
- Password: `admin`

**重要**: 本番環境では必ずパスワードを変更してください。

### 4.2 テストデータ

必要に応じて、Supabase SQL Editor でテストデータを投入してください。

## 5. デプロイメント確認

### 5.1 動作確認

1. Vercel から提供された URL にアクセス
2. ログイン機能の確認
3. 基本機能の動作確認

### 5.2 ログ確認

- Vercel Functions: Vercel ダッシュボードの「Functions」タブ
- Supabase: Supabase ダッシュボードの「Logs」

## 6. トラブルシューティング

### よくある問題

#### データベース接続エラー

- Supabase 環境変数が正しく設定されているか確認
- Supabase プロジェクトの API キーが有効か確認

#### セッションエラー

- `SESSION_SECRET`が設定されているか確認
- セッションの暗号化キーが十分に強力か確認

#### CORS エラー

- Supabase の CORS 設定に Vercel ドメインが追加されているか確認

### ログの確認方法

```bash
# Vercelログの確認
vercel logs

# リアルタイムログ
vercel logs --follow
```

## 7. 運用・保守

### 7.1 バックアップ

Supabase は自動バックアップを提供していますが、重要なデータは定期的に手動バックアップを推奨します。

### 7.2 モニタリング

- Vercel Analytics
- Supabase Dashboard
- 外部監視サービス（推奨）

### 7.3 更新手順

1. 開発環境でテスト
2. GitHub にプッシュ
3. Vercel で自動デプロイ
4. 動作確認

## 8. セキュリティチェックリスト

- [ ] 管理者パスワードの変更
- [ ] SESSION_SECRET の設定
- [ ] Supabase RLS の有効化
- [ ] HTTPS 通信の確認
- [ ] 環境変数の暗号化確認
- [ ] 定期的なセキュリティ更新

## サポート

問題が発生した場合は、以下を確認してください：

1. Vercel の Function Logs
2. Supabase の Logs
3. ブラウザの Developer Console
4. Network タブでの API 通信状況

## 参考リンク

- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs) (必要に応じて)
