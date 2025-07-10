# Vercel デプロイ手順書

## 🚀 Vercel でのデプロイ方法

### 1. Vercel アカウント作成

1. [Vercel](https://vercel.com/)にアクセス
2. GitHub アカウントでサインアップ

### 2. プロジェクトのデプロイ

1. Vercel ダッシュボードで「New Project」をクリック
2. GitHub リポジトリを選択してインポート
3. プロジェクト設定：
   - **Framework Preset**: Other
   - **Build Command**: `npm install`（自動設定される）
   - **Output Directory**: `.`（自動設定される）
   - **Install Command**: `npm install`（自動設定される）

### 3. 環境変数の設定

Vercel ダッシュボードの「Settings」→「Environment Variables」で以下を設定：

| 変数名           | 値の例                                  | 説明                           |
| ---------------- | --------------------------------------- | ------------------------------ |
| `SESSION_SECRET` | `super-secure-random-string-32-chars`   | セッション暗号化キー（必須）   |
| `NODE_ENV`       | `production`                            | 本番環境設定                   |
| `SMTP_HOST`      | `smtp.gmail.com`                        | メール送信設定（オプション）   |
| `SMTP_PORT`      | `587`                                   | メールポート（オプション）     |
| `SMTP_USER`      | `your-email@gmail.com`                  | メールアドレス（オプション）   |
| `SMTP_PASS`      | `your-app-password`                     | アプリパスワード（オプション） |
| `ADMIN_EMAILS`   | `admin1@company.com,admin2@company.com` | 管理者メール（オプション）     |

### 4. デプロイの実行

1. 環境変数設定後、自動的に再デプロイされます
2. デプロイが完了すると、Vercel が URL を提供します
3. `https://your-project-name.vercel.app`でアクセス可能

## 📝 重要な注意事項

### データベースについて

- **現在**: SQLite ファイルを使用（一時的）
- **制限**: Vercel は読み取り専用ファイルシステムのため、データは永続化されません
- **推奨**: 本格運用では以下のデータベースサービスを利用
  - [Vercel Postgres](https://vercel.com/storage/postgres)（推奨）
  - [PlanetScale](https://planetscale.com/)
  - [Supabase](https://supabase.com/)
  - [Neon](https://neon.tech/)

### セッション管理について

- 現在はメモリストアを使用
- 本格運用では外部セッションストアを推奨：
  - Redis（Upstash Redis 推奨）
  - PostgreSQL
  - MongoDB

## 🔄 継続的デプロイ

GitHub リポジトリにプッシュすると自動的にデプロイされます：

```bash
git add .
git commit -m "更新内容"
git push origin main
```

## 🛠️ トラブルシューティング

### よくある問題

1. **500 エラーが発生する**

   - 環境変数`SESSION_SECRET`が設定されているか確認
   - Vercel の Function Logs を確認

2. **ログイン状態が保持されない**

   - セッション設定を確認
   - HTTPS 環境での Cookie 設定を確認

3. **データが消える**
   - SQLite は一時的なため正常な動作
   - 永続化には外部データベースが必要

### ログの確認方法

1. Vercel ダッシュボード
2. プロジェクト選択
3. 「Functions」タブでエラーログを確認

## 🎯 本番運用時の推奨改善

1. **データベース移行**: PostgreSQL への移行
2. **セッションストア**: Redis の導入
3. **ファイルアップロード**: Vercel Blob または外部ストレージ
4. **監視**: Vercel Analytics の導入
5. **セキュリティ**: CSP ヘッダーの強化
