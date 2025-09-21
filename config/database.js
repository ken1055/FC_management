const { getSupabaseClient, isSupabaseConfigured } = require("./supabase");
const db = require("../db");

// データベース接続タイプを判定
function getDatabaseType() {
  if (isSupabaseConfigured()) {
    return "supabase";
  }
  return "sqlite";
}

// 統合クエリ実行関数
async function executeQuery(query, params = []) {
  const dbType = getDatabaseType();

  if (dbType === "supabase") {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase接続が初期化されていません");
    }

    // Supabaseクエリに変換
    return await executeSupabaseQuery(supabase, query, params);
  } else {
    // SQLiteクエリ実行
    return await executeSQLiteQuery(query, params);
  }
}

// Supabaseクエリ実行
async function executeSupabaseQuery(supabase, query, params) {
  // SQLクエリをSupabaseのクエリビルダーに変換
  // この部分は具体的なクエリに応じて実装
  console.log("Supabaseクエリ実行:", query, params);

  // 例: SELECT文の場合
  if (query.toLowerCase().includes("select")) {
    const tableName = extractTableName(query);
    let queryBuilder = supabase.from(tableName).select("*");

    // WHERE条件の処理
    if (query.toLowerCase().includes("where")) {
      // 簡単な例 - 実際はより複雑な解析が必要
      queryBuilder = queryBuilder.eq("id", params[0]);
    }

    const { data, error } = await queryBuilder;
    if (error) throw error;
    return data;
  }

  throw new Error("未対応のクエリタイプ");
}

// SQLiteクエリ実行
function executeSQLiteQuery(query, params) {
  return new Promise((resolve, reject) => {
    if (query.toLowerCase().startsWith("select")) {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    } else {
      db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    }
  });
}

// テーブル名を抽出する簡単な関数
function extractTableName(query) {
  const match = query.match(/from\s+(\w+)/i);
  return match ? match[1] : null;
}

module.exports = {
  getDatabaseType,
  executeQuery,
  getSupabaseClient,
  isSupabaseConfigured,
};
