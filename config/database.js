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

  const originalQuery = query;
  const lower = query.toLowerCase().trim();

  try {
    // SELECT
    if (lower.startsWith("select")) {
      const tableName = extractTableName(query);
      if (!tableName) throw new Error("テーブル名を特定できません");

      let qb = supabase.from(tableName).select("*");

      if (lower.includes(" where ")) {
        const { filters } = parseWhereEqConditions(originalQuery, params, 0);
        filters.forEach(({ column, value }) => {
          qb = qb.eq(column, value);
        });
      }

      const { data, error } = await qb;
      if (error) throw error;
      return { rows: data || [] };
    }

    // INSERT / INSERT OR REPLACE
    if (lower.startsWith("insert")) {
      const tableName = extractTableName(query);
      if (!tableName) throw new Error("テーブル名を特定できません");

      // カラム配列を抽出
      const colsMatch = query.match(
        /insert\s+(?:or\s+replace\s+)?into\s+\w+\s*\(([^)]+)\)/i
      );
      const valsMatch = query.match(/values\s*\(([^)]+)\)/i);
      if (!colsMatch || !valsMatch)
        throw new Error("INSERTのカラム/値を解析できません");

      const columns = colsMatch[1].split(",").map((c) => c.trim());
      const valueTokens = valsMatch[1].split(",").map((v) => v.trim());
      if (columns.length !== valueTokens.length)
        throw new Error("INSERTのカラム数と値数が一致しません");

      const insertData = {};
      let p = 0;
      for (let i = 0; i < columns.length; i++) {
        const token = valueTokens[i];
        if (token === "?") {
          insertData[columns[i]] = params[p++];
        } else {
          insertData[columns[i]] = token.replace(/^['"]|['"]$/g, "");
        }
      }

      // insert or replace → upsert 対応（既知テーブルのみ）
      const isReplace = /insert\s+or\s+replace/i.test(query);
      if (isReplace && tableName === "royalty_calculations") {
        const { data, error } = await supabase
          .from(tableName)
          .upsert(insertData, {
            onConflict: "store_id,calculation_year,calculation_month",
          })
          .select();
        if (error) throw error;
        return {
          rows: data || [],
          lastID: data?.[0]?.id || null,
          changes: data?.length || 0,
        };
      }

      const { data, error } = await supabase
        .from(tableName)
        .insert(insertData)
        .select();
      if (error) throw error;
      return {
        rows: data || [],
        lastID: data?.[0]?.id || null,
        changes: data?.length || 0,
      };
    }

    // UPDATE
    if (lower.startsWith("update")) {
      const tableName = extractTableName(query);
      if (!tableName) throw new Error("テーブル名を特定できません");

      const setMatch = query.match(/set\s+(.+?)\s+(where|$)/i);
      if (!setMatch) throw new Error("UPDATEのSET句を解析できません");

      const setClause = setMatch[1];
      const setPairs = setClause.split(",");
      const updateData = {};

      let paramIndex = 0;
      for (const pair of setPairs) {
        const m = pair.match(/(\w+)\s*=\s*\?/);
        if (m) {
          updateData[m[1]] = params[paramIndex++];
        } else {
          const m2 = pair.match(/(\w+)\s*=\s*(['"])(.*?)\2/);
          if (m2) updateData[m2[1]] = m2[3];
        }
      }

      let qb = supabase.from(tableName).update(updateData);

      if (lower.includes(" where ")) {
        const { filters, usedParams } = parseWhereEqConditions(
          originalQuery,
          params,
          paramIndex
        );
        filters.forEach(({ column, value }) => {
          qb = qb.eq(column, value);
        });
        paramIndex += usedParams;
      }

      const { data, error } = await qb.select();
      if (error) throw error;
      return { rows: data || [], changes: data?.length || 0 };
    }

    // DELETE
    if (lower.startsWith("delete")) {
      const tableName = extractTableName(query);
      if (!tableName) throw new Error("テーブル名を特定できません");

      let qb = supabase.from(tableName).delete();
      if (lower.includes(" where ")) {
        const { filters } = parseWhereEqConditions(originalQuery, params, 0);
        filters.forEach(({ column, value }) => {
          qb = qb.eq(column, value);
        });
      }

      const { data, error } = await qb.select();
      if (error) throw error;
      return { rows: data || [], changes: data?.length || 0 };
    }

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
  match = query.match(/insert\s+(?:or\s+replace\s+)?into\s+(\w+)/i);
  if (match) return match[1];

  // UPDATE文の場合
  match = query.match(/update\s+(\w+)/i);
  if (match) return match[1];

  // DELETE文の場合
  match = query.match(/delete\s+from\s+(\w+)/i);
  if (match) return match[1];

  return null;
}

// WHERE句の単純な col = ? AND col2 = ? を解析
function parseWhereEqConditions(query, params, startIndex) {
  const whereMatch = query.match(/where\s+(.+?)(order\s+by|limit|$)/i);
  const filters = [];
  let usedParams = 0;
  if (whereMatch) {
    const condStr = whereMatch[1];
    const parts = condStr.split(/\s+and\s+/i);
    for (const part of parts) {
      const mQ = part.match(/(\w+)\s*=\s*\?/);
      if (mQ) {
        filters.push({ column: mQ[1], value: params[startIndex + usedParams] });
        usedParams += 1;
        continue;
      }
      const mL = part.match(/(\w+)\s*=\s*(['"])(.*?)\2/);
      if (mL) {
        filters.push({ column: mL[1], value: mL[3] });
      }
    }
  }
  return { filters, usedParams };
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
      db.run(sql, params, function (err) {
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
