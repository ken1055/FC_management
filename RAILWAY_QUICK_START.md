# 🚂 Railway クイックスタートガイド

## 5 分でデプロイ完了！

### ステップ 1: Railway アカウント準備

1. [Railway](https://railway.app/) にアクセス
2. GitHub アカウントでサインアップ
3. 別のアカウントを使用する場合は、ログアウト後に新しいアカウントでログイン

### ステップ 2: プロジェクトデプロイ

1. 「New Project」をクリック
2. 「Deploy from GitHub repo」を選択
3. このリポジトリを選択
4. 自動的にデプロイが開始されます

### ステップ 3: 必須環境変数設定

Railway ダッシュボードの「Variables」タブで以下を設定：

```
SESSION_SECRET=your-very-strong-secret-key-here-min-32-characters
NODE_ENV=production
ADMIN_PROMOTION_PASS=your-admin-promotion-password
```

**SESSION_SECRET の生成方法:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### ステップ 4: アクセス確認

1. デプロイ完了後、Railway が提供する URL にアクセス
2. 初期ログイン: `admin` / `admin`
3. **必ずパスワードを変更してください！**

## 🎯 完了！

これで代理店管理システムが Railway で稼働中です。

## 📊 Railway の利点

✅ **永続データ**: SQLite ファイルが保持される  
✅ **ファイルアップロード**: アップロードファイルが永続化  
✅ **セッション管理**: メモリベースセッションが機能  
✅ **自動 HTTPS**: SSL 証明書が自動適用  
✅ **簡単スケーリング**: 負荷に応じて自動調整

## 🔧 オプション設定

### PostgreSQL を使用する場合（推奨）

1. Railway で「New」→「Database」→「PostgreSQL」を追加
2. 自動生成される `DATABASE_URL` が環境変数に設定される
3. アプリが自動的に PostgreSQL を使用

### メール通知を設定する場合

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAILS=admin1@company.com,admin2@company.com
```

## 🛠️ トラブルシューティング

**デプロイが失敗する場合:**

- `SESSION_SECRET` が設定されているか確認
- デプロイログを「Deployments」タブで確認

**詳細な手順は `RAILWAY_DEPLOYMENT.md` を参照してください。**
