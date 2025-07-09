# メール通知機能設定手順

代理店プロフィール登録・更新時に管理者へメール通知を送信する機能が実装されています。
**複数の管理者アカウント**に同時に通知を送信することができます。

## 必要な環境変数

`.env`ファイルに以下の環境変数を追加してください：

```env
# Email Configuration (Gmail example)
# SMTPサーバー設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# 送信者のメールアドレス（Gmailアドレス）
SMTP_USER=your-email@gmail.com

# Gmailアプリパスワード（2段階認証要）
SMTP_PASS=your-app-password

# 管理者メールアドレス（複数対応・カンマ区切り）
ADMIN_EMAILS=admin1@example.com,admin2@example.com,admin3@example.com,admin4@example.com,admin5@example.com

# または単一アドレスの場合（後方互換性）
# ADMIN_EMAIL=admin@example.com
```

## 複数管理者アドレス設定

### 複数アドレス設定（推奨）

```env
ADMIN_EMAILS=admin1@company.com, admin2@company.com, ceo@company.com, manager@company.com, director@company.com
```

### 設定のポイント

- **カンマ区切り**で複数のメールアドレスを設定
- **スペースは自動で除去**されるため、見やすく設定可能
- **最大制限なし**: 必要な数だけ管理者アドレスを追加可能
- **後方互換性**: `ADMIN_EMAIL`（単一）も引き続き使用可能

### 例: 5 つの管理者アカウント

```env
ADMIN_EMAILS=ceo@company.com, cto@company.com, manager1@company.com, manager2@company.com, admin@company.com
```

## Gmail 設定手順

### 1. 2 段階認証の有効化

1. Google アカウントにログイン
2. 「セキュリティ」→「2 段階認証プロセス」を有効化

### 2. アプリパスワードの生成

1. 「セキュリティ」→「アプリパスワード」
2. アプリ選択：「その他（カスタム名）」→「代理店管理システム」
3. 生成されたパスワードを`SMTP_PASS`に設定

### 3. 環境変数の設定

- `SMTP_USER`: 送信に使用する Gmail アドレス
- `SMTP_PASS`: 生成したアプリパスワード（通常のパスワードではない）
- `ADMIN_EMAIL`: 通知を受け取る管理者のメールアドレス

## 他のメールプロバイダー

### Outlook/Hotmail

```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
```

### Yahoo Mail

```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
```

## 通知内容

### 新規プロフィール登録時

- 代理店の基本情報（名前、年齢、住所など）
- 商品情報
- 登録したユーザー情報
- 登録日時

### プロフィール更新時

- 更新した代理店名
- 更新者情報
- 更新日時

## トラブルシューティング

### メールが送信されない場合

1. 環境変数が正しく設定されているか確認
2. アプリパスワードが正しく設定されているか確認
3. 2 段階認証が有効になっているか確認
4. サーバーログでエラーメッセージを確認

### エラーメッセージの確認

サーバーのコンソールログで以下のようなメッセージを確認：

- `メール設定が不完全です。環境変数を確認してください。`
- `メール送信をスキップしました（設定不備）`
- `メール送信エラー: [詳細なエラー]`

## 設定なしでの動作

メール設定が不完全でも、システムは正常に動作します。メール送信がスキップされるだけで、プロフィール作成・更新は正常に完了します。
