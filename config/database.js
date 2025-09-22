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

// db.queryの代替メソッド
async function query(sql, params = []) {
  return await executeQuery(sql, params);
}

// db.getの代替メソッド
async function get(sql, params = []) {
  const dbType = getDatabaseType();
  
  if (dbType === "supabase") {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase接続が初期化されていません");
    }
    
    try {
      const tableName = extractTableName(sql);
      let queryBuilder = supabase.from(tableName).select("*");
      
      // WHERE条件の処理
      if (sql.toLowerCase().includes("where")) {
        // 簡単な例 - 実際はより複雑な解析が必要
        queryBuilder = queryBuilder.eq("id", params[0]);
      }
      
      const { data, error } = await queryBuilder;
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error("Supabase get実行エラー:", error);
      throw error;
    }
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          console.error("SQLite get実行エラー:", err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }
}

// db.runの代替メソッド
async function run(sql, params = []) {
  const dbType = getDatabaseType();
  
  if (dbType === "supabase") {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase接続が初期化されていません");
    }
    
    try {
      const tableName = extractTableName(sql);
      
      if (sql.toLowerCase().includes("insert")) {
        const { data, error } = await supabase.from(tableName).insert(params);
        if (error) throw error;
        return { lastID: data?.insertId || null, changes: data?.affectedRows || 0 };
      } else if (sql.toLowerCase().includes("update")) {
        const { data, error } = await supabase.from(tableName).update(params).eq("id", params[0]);
        if (error) throw error;
        return { lastID: null, changes: data?.affectedRows || 0 };
      } else if (sql.toLowerCase().includes("delete")) {
        const { data, error } = await supabase.from(tableName).delete().eq("id", params[0]);
        if (error) throw error;
        return { lastID: null, changes: data?.affectedRows || 0 };
      }
      
      throw new Error("未対応のクエリタイプ");
    } catch (error) {
      console.error("Supabase run実行エラー:", error);
      throw error;
    }
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          console.error("SQLite run実行エラー:", err);
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }
}

module.exports = {
  getDatabaseType,
  executeQuery,
  query,
  get,
  run,
  getSupabaseClient,
  isSupabaseConfigured,
};
