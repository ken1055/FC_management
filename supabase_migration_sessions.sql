-- Supabase: user_sessions テーブル
CREATE TABLE IF NOT EXISTS user_sessions (
  sid text PRIMARY KEY,
  data text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);


