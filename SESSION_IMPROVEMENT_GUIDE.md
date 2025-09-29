# 🔐 セッション管理改善ガイド

## 現在の問題

Vercelのサーバーレス環境では、以下の理由でセッションが失われやすい：

1. **メモリストアの制限**: 関数実行終了時にメモリがクリア
2. **コールドスタート**: 5-15分非アクティブ後にセッション消失
3. **スケーリング**: 複数インスタンス間でセッション共有不可

## 実装済み改善

### ✅ 1. セッション設定の最適化
- セッション有効期限を7日間に延長
- `resave: true` でセッション保存を強化
- 本番環境でのHTTPS必須設定

### ✅ 2. デバッグ情報の追加
- セッション失効時の詳細ログ
- ユーザーへの分かりやすいメッセージ

## 長期的解決策

### 🎯 推奨: Supabaseセッションストア

```javascript
// config/session-store.js
const { createClient } = require('@supabase/supabase-js');

class SupabaseSessionStore extends require('express-session').Store {
  constructor(options = {}) {
    super(options);
    this.client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.tableName = options.tableName || 'user_sessions';
  }

  async get(sid, callback) {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('data')
        .eq('sid', sid)
        .single();
      
      if (error || !data) return callback(null, null);
      callback(null, JSON.parse(data.data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, session, callback) {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .upsert({
          sid,
          data: JSON.stringify(session),
          expires_at: new Date(Date.now() + session.cookie.maxAge)
        });
      
      callback(error);
    } catch (err) {
      callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .eq('sid', sid);
      
      callback(error);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = SupabaseSessionStore;
```

### 🗄️ 必要なテーブル作成

```sql
-- Supabaseで実行
CREATE TABLE user_sessions (
  sid VARCHAR(255) PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 期限切れセッションの自動削除
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 定期実行（1日1回）
SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions();');
```

## 代替案

### 🔄 Option 1: Upstash Redis
```javascript
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

app.use(session({
  store: new RedisStore({ client }),
  // ... その他の設定
}));
```

### 📦 Option 2: Vercel KV
```javascript
const { kv } = require('@vercel/kv');

class VercelKVStore extends require('express-session').Store {
  async get(sid, callback) {
    try {
      const session = await kv.get(`session:${sid}`);
      callback(null, session);
    } catch (err) {
      callback(err);
    }
  }
  
  async set(sid, session, callback) {
    try {
      await kv.set(`session:${sid}`, session, {
        ex: Math.floor(session.cookie.maxAge / 1000)
      });
      callback();
    } catch (err) {
      callback(err);
    }
  }
}
```

## 実装優先度

1. **即時対応** ✅: 現在の設定改善（完了）
2. **短期** (1-2日): Supabaseセッションストア
3. **中期** (1週間): Redis/KV導入検討
4. **長期** (1ヶ月): セッション分析・最適化

## 監視・メトリクス

### 追加すべきログ
```javascript
// セッション作成
console.log(`セッション作成: ${sessionId}, ユーザー: ${userId}`);

// セッション失効
console.log(`セッション失効: ${sessionId}, 原因: ${reason}`);

// セッション復旧
console.log(`セッション復旧: ${sessionId}, 継続時間: ${duration}ms`);
```

### 監視指標
- セッション失効率
- 平均セッション継続時間
- ログイン頻度
- エラー率

## まとめ

現在の改善により、セッション切れの頻度は**大幅に減少**するはずです。
ただし、**完全な解決**には外部セッションストア（Supabase推奨）の導入が必要です。

実装が必要でしたら、お知らせください。
