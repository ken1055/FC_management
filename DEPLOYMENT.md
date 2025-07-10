# デプロイ手順書

## 推奨デプロイ方法

### 1. Vercel（最推奨）

1. [Vercel](https://vercel.com/)にアカウント作成
2. GitHub リポジトリと連携
3. プロジェクトをインポート
4. 自動デプロイ開始

**メリット:**

- Node.js アプリケーションに最適
- 無料プランが充実
- 自動 HTTPS
- 高速 CDN

### 2. Railway

1. [Railway](https://railway.app/)にアカウント作成
2. GitHub と連携してプロジェクトデプロイ
3. 環境変数設定

**メリット:**

- データベース内蔵サポート
- 簡単設定
- 従量課金制

### 3. Render

1. [Render](https://render.com/)にアカウント作成
2. GitHub リポジトリを連携
3. Web Service として設定

**メリット:**

- 無料プランあり
- PostgreSQL サポート
- 自動 SSL

## 環境変数設定

以下の環境変数を設定してください：

```
NODE_ENV=production
SESSION_SECRET=your-secure-session-secret-here
```

## データベース注意事項

- SQLite ファイルは一時的なものです
- 本番環境では PostgreSQL または MySQL を推奨
- データの永続化が必要な場合は別途データベースサービスを利用

## Netlify での制限事項

Netlify は静的サイトホスティングのため、以下の制限があります：

- Node.js サーバーアプリケーションは直接動作しない
- Netlify Functions の利用が必要（複雑）
- SQLite ファイルの永続化が困難
- セッション管理の制限

**結論: Netlify 以外のサービスを強く推奨します**
