# FC 店舗管理システム

FC 店舗の登録・管理、売上データの管理、顧客管理、ロイヤリティ自動算出・請求書発行を行う Web アプリケーションです。

**✨ Vercel & Supabase 対応済み** - 本番環境での簡単デプロイが可能です。

## 🚀 機能概要

### 管理者機能（FC 本部）

- **FC 店舗管理**: FC 店舗の一覧表示、新規登録、プロフィール管理、削除
- **売上管理**: 各店舗の売上データ確認・分析
- **顧客管理**: 全店舗の顧客情報を統合管理
- **ロイヤリティ管理**: 月次売上に基づくロイヤリティ自動算出
- **請求書発行**: PDF 形式の請求書自動生成・ダウンロード
- **グループ管理**: 店舗をグループ別に整理・管理
- **ユーザー管理**: 管理者アカウントの追加・削除
- **商品資料管理**: 店舗向け資料のアップロード・管理
- **レポート機能**: 月次・年次の売上・ロイヤリティレポート

### FC 店舗機能

- **店舗プロフィール管理**: 店舗情報や取り扱い商品の登録・更新
- **売上入力**: 月間売上データの入力・確認
- **顧客管理**: 来店顧客の情報管理・分析
- **商品資料閲覧**: FC 本部がアップロードした資料の閲覧・ダウンロード
- **ロイヤリティ確認**: 自店舗のロイヤリティ計算結果確認

### セキュリティ機能

- **パスワードハッシュ化**: 本番環境での SHA-256 ハッシュ化
- **セッション管理**: セキュアな認証・認可システム
- **権限管理**: 役割ベースのアクセス制御
- **CSP ヘッダー**: XSS 攻撃防止
- **ID 整合性管理**: 自動的な連番 ID の維持

## 🛠️ セットアップ手順

### 1. 必要なパッケージをインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env` ファイルを作成し、以下の設定を記入：

```bash
# 必須設定
SESSION_SECRET=your-very-strong-secret-key-here-min-32-characters
NODE_ENV=development

# 管理者昇格パスワード（推奨）
ADMIN_PROMOTION_PASS=your-admin-promotion-password

# メール通知設定（オプション）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
ADMIN_EMAILS=admin@company.com
```

### 3. サーバーを起動

```bash
# 開発環境
npm run dev

# 本番環境
npm start
```

### 4. アクセス

ブラウザで `http://localhost:3000` にアクセス

**初期ログイン情報:**

- Email: `admin`
- Password: `admin`

⚠️ **初回ログイン後、必ずパスワードを変更してください**

## 🔧 技術スタック

- **Backend**: Node.js + Express.js
- **Database**: SQLite（ローカル開発）/ PostgreSQL・Supabase（本番）
- **デプロイ**: Vercel + Supabase（推奨）
- **View Engine**: EJS
- **Session**: express-session + MemoryStore
- **File Upload**: Multer
- **Email**: Nodemailer
- **UI Framework**: Bootstrap 5 + Bootstrap Icons

## 🗄️ データベース永続化（重要）

### 問題

現在のシステムは SQLite を使用していますが、Railway などのクラウド環境では再デプロイのたびにデータが消えてしまいます。

### 解決策

#### 1. PostgreSQL への移行（推奨）

**Railway 環境での設定:**

1. Railway ダッシュボードを開く: `railway open`
2. 「Add Service」→「Database」→「PostgreSQL」を選択
3. PostgreSQL サービスが作成されると、自動的に`DATABASE_URL`環境変数が設定される
4. アプリケーションを再デプロイ: `railway up`

**手動で DATABASE_URL を設定する場合:**

```bash
# Railwayダッシュボードの環境変数設定で以下を追加
DATABASE_URL=postgresql://username:password@host:port/database
```

#### 2. 永続ボリュームの使用（一時的解決策）

現在のコードは以下の設定で永続ボリュームを使用します：

- SQLite ファイルパス: `/app/data/agency.db`
- ボリューム名: `agency-data`
- マウントパス: `/app/data`

**railway.toml 設定:**

```toml
[[deploy.volumes]]
mountPath = "/app/data"
name = "agency-data"
```

#### 3. データベース環境の確認

アプリケーション起動時のログで使用されているデータベースを確認できます：

- `PostgreSQL環境: 本番データベースを使用` → PostgreSQL 使用中
- `ローカル環境: 通常のデータベース接続` → SQLite 使用中

### データベース移行後の確認事項

1. **データの永続化確認**

   - 代理店、ユーザー、売上データの登録
   - アプリケーション再デプロイ後のデータ保持確認

2. **パフォーマンス向上**

   - PostgreSQL による高速なクエリ実行
   - 同時接続数の向上

3. **バックアップ機能**
   - PostgreSQL の自動バックアップ機能
   - データ復旧機能の利用

## 📁 プロジェクト構造

```
代理店管理/
├── server.js              # メインサーバーファイル
├── db.js                   # データベース接続・初期化
├── package.json            # パッケージ設定
├── routes/                 # ルーティング
│   ├── auth.js            # 認証関連
│   ├── users.js           # ユーザー管理
│   ├── agencies.js        # 代理店管理
│   ├── sales.js           # 売上管理
│   ├── groups.js          # グループ管理
│   └── materials.js       # 資料管理
├── views/                  # EJSテンプレート
├── public/                 # 静的ファイル
├── uploads/                # アップロードファイル
├── config/                 # 設定ファイル
└── api/                    # Vercel Functions
```

## 🚀 デプロイ

### Vercel（推奨）

詳細は [DEPLOYMENT.md](./DEPLOYMENT.md) を参照してください。

1. GitHub リポジトリにプッシュ
2. Vercel でインポート
3. 環境変数を設定
4. 自動デプロイ

### 環境変数（Vercel）

必須設定：

- `SESSION_SECRET`: セッション暗号化キー
- `NODE_ENV`: `production`

## 🔒 セキュリティ対策

### 実装済み対策

- パスワードハッシュ化（本番環境）
- セキュリティヘッダー（CSP、XSS Protection 等）
- セッション管理（HTTPOnly、Secure Cookie）
- 権限ベースアクセス制御
- SQL インジェクション対策

### 推奨追加対策

- 定期的なパスワード変更
- 2 要素認証の導入
- API レート制限
- 定期的なセキュリティ監査

## 🎯 今後の拡張予定

### データベース

- PostgreSQL への移行
- Redis セッションストア
- データバックアップ機能

### 機能拡張

- ダッシュボード統計
- CSV エクスポート
- リアルタイム通知
- モバイル対応

### 運用改善

- ログ管理
- 監視・アラート
- パフォーマンス最適化

## 📝 注意事項

1. **初期設定**

   - 初期管理者パスワード（admin/admin）は必ず変更
   - SESSION_SECRET は強力なランダム文字列に設定

2. **データ永続化**

   - ローカル環境: SQLite ファイル
   - Vercel 環境: メモリ DB（一時的）
   - 本番運用: 外部データベース推奨

3. **ファイル管理**

   - アップロードファイルは `uploads/` に保存
   - 本番環境では外部ストレージ推奨

4. **メール機能**
   - Gmail の場合はアプリパスワード必須
   - SMTP 設定なしでも基本機能は利用可能

## 🤝 サポート

問題や質問がある場合は、以下の方法でお問い合わせください：

1. GitHub Issues での報告
2. 公式 LINE 経由での連絡
3. メール（ADMIN_EMAILS で設定）

## 🚀 本番環境デプロイ

### Vercel & Supabase デプロイ（推奨）

本システムは Vercel と Supabase を使用した本番環境デプロイに対応しています。

#### クイックデプロイ手順

1. **Supabase プロジェクト作成**

   - [Supabase](https://supabase.com)でプロジェクトを作成
   - `supabase/schema.sql`を実行してテーブルを作成
   - API キー（URL、anon key）を取得

2. **Vercel デプロイ**

   - GitHub にプッシュ
   - [Vercel](https://vercel.com)でプロジェクトをインポート
   - 環境変数を設定：
     ```
     NODE_ENV=production
     SESSION_SECRET=your-strong-secret
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_ANON_KEY=your-anon-key
     ```

3. **詳細な手順**
   - 詳しくは [`VERCEL_SUPABASE_DEPLOYMENT.md`](VERCEL_SUPABASE_DEPLOYMENT.md) を参照

### その他のデプロイオプション

- **Railway**: PostgreSQL サポート
- **Heroku**: PostgreSQL アドオン使用
- **AWS/GCP**: PostgreSQL マネージドサービス使用

## 📄 ライセンス

MIT License
