const { createClient } = require("@supabase/supabase-js");

// Supabase設定
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

// Supabase接続の初期化
function initializeSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.log("Supabase設定なし - SQLiteを使用");
    return null;
  }

  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase接続を初期化しました");
    return supabase;
  } catch (error) {
    console.error("Supabase初期化エラー:", error);
    return null;
  }
}

// Supabaseクライアントを取得
function getSupabaseClient() {
  if (!supabase && supabaseUrl && supabaseKey) {
    return initializeSupabase();
  }
  return supabase;
}

module.exports = {
  initializeSupabase,
  getSupabaseClient,
  isSupabaseConfigured: () => !!(supabaseUrl && supabaseKey),
};
