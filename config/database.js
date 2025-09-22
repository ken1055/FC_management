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
  console.log("Supabaseクエリ実行:", query, params);

  try {
    // Supabaseでは生のSQLクエリを実行するためにrpc関数を使用
    // ただし、Supabaseの制限により、複雑なクエリは制限される場合がある
    
    // 簡単なSELECT文の場合
    if (query.toLowerCase().trim().startsWith("select")) {
      const tableName = extractTableName(query);
      if (tableName) {
        let queryBuilder = supabase.from(tableName).select("*");
        
        // WHERE条件の処理
        if (query.toLowerCase().includes("where")) {
          // WHERE句を解析して適切なカラムと値を設定
          const whereMatch = query.match(/WHERE\s+(\w+)\s*=\s*\?/i);
          if (whereMatch && params.length > 0) {
            const columnName = whereMatch[1];
            const paramValue = params[0];
            queryBuilder = queryBuilder.eq(columnName, paramValue);
          }
        }
        
        const { data, error } = await queryBuilder;
        if (error) throw error;
        return { rows: data || [] };
      }
    }
    
    // INSERT文の場合
    if (query.toLowerCase().trim().startsWith("insert")) {
      const tableName = extractTableName(query);
      if (tableName) {
        // INSERT文からカラムと値を抽出（簡単な例）
        const insertMatch = query.match(/INSERT INTO \w+ \((.+?)\) VALUES \((.+?)\)/i);
        if (insertMatch) {
          const columns = insertMatch[1].split(',').map(col => col.trim());
          const values = insertMatch[2].split(',').map(val => val.trim().replace(/['"]/g, ''));
          
          const insertData = {};
          columns.forEach((col, index) => {
            if (values[index] !== '?') {
              insertData[col] = values[index];
            } else if (params[index] !== undefined) {
              insertData[col] = params[index];
            }
          });
          
          const { data, error } = await supabase.from(tableName).insert(insertData).select();
          if (error) throw error;
          return { rows: data || [], lastID: data?.[0]?.id || null, changes: data?.length || 0 };
        }
      }
    }
    
    // UPDATE文の場合
    if (query.toLowerCase().trim().startsWith("update")) {
      const tableName = extractTableName(query);
      if (tableName) {
        // UPDATE文の処理（簡単な例）
        const { data, error } = await supabase.from(tableName).update({}).eq("id", params[0] || 1);
        if (error) throw error;
        return { rows: data || [], changes: data?.length || 0 };
      }
    }
    
    // DELETE文の場合
    if (query.toLowerCase().trim().startsWith("delete")) {
      const tableName = extractTableName(query);
      if (tableName) {
        const { data, error } = await supabase.from(tableName).delete().eq("id", params[0] || 1);
        if (error) throw error;
        return { rows: data || [], changes: data?.length || 0 };
      }
    }
    
    // その他のクエリはエラー
    throw new Error(`未対応のクエリタイプ: ${query.substring(0, 50)}...`);
    
  } catch (error) {
    console.error("Supabaseクエリ実行エラー:", error);
    throw error;
  }
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

// テーブル名を抽出する関数
function extractTableName(query) {
  // SELECT文の場合
  let match = query.match(/from\s+(\w+)/i);
  if (match) return match[1];
  
  // INSERT文の場合
  match = query.match(/insert\s+into\s+(\w+)/i);
  if (match) return match[1];
  
  // UPDATE文の場合
  match = query.match(/update\s+(\w+)/i);
  if (match) return match[1];
  
  // DELETE文の場合
  match = query.match(/delete\s+from\s+(\w+)/i);
  if (match) return match[1];
  
  return null;
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
      const result = await executeSupabaseQuery(supabase, sql, params);
      return result.rows && result.rows.length > 0 ? result.rows[0] : null;
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
      const result = await executeSupabaseQuery(supabase, sql, params);
      return { lastID: result.lastID || null, changes: result.changes || 0 };
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
