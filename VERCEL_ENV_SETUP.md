# 🔧 Vercel環境変数設定ガイド

## 必須環境変数

### 1. セッション管理
```bash
SESSION_SECRET=your-very-strong-secret-key-here-min-32-characters
```

### 2. Supabase設定
```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 3. Node.js環境
```bash
NODE_ENV=production
TZ=Asia/Tokyo
```

## オプション環境変数

### HTTPS設定
```bash
DISABLE_HTTPS=false
```

### メール設定（オプション）
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAILS=admin@company.com
```

### 管理者昇格パスワード
```bash
ADMIN_PROMOTION_PASS=your-admin-promotion-password
```

## Vercelダッシュボードでの設定方法

1. Vercelダッシュボードにログイン
2. プロジェクトを選択
3. Settings → Environment Variables
4. 上記の環境変数を一つずつ追加

## セキュリティ強化

### SESSION_SECRET生成
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 推奨設定
- SESSION_SECRET: 64文字以上のランダム文字列
- 定期的なキーローテーション
- 最小権限の原則でSupabaseキーを設定
