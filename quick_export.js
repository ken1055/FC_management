// quick_export.js - 簡単データベースエクスポートスクリプト
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

class QuickExporter {
  constructor() {
    this.dbPath = "./agency.db";
    this.exportDir = "./database_exports";
    this.timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
  }

  async init() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
      console.log(`エクスポートディレクトリを作成しました: ${this.exportDir}`);
    }
  }

  // 最も簡単な完全エクスポート
  async quickExport() {
    await this.init();
    console.log("=== 簡単データベースエクスポート開始 ===");

    const db = new sqlite3.Database(this.dbPath);

    return new Promise((resolve, reject) => {
      // テーブル一覧取得
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        [],
        async (err, tables) => {
          if (err) {
            reject(err);
            return;
          }

          const result = {
            schema: {},
            data: {},
            summary: {},
          };

          let completed = 0;
          const totalTables = tables.length;

          if (totalTables === 0) {
            console.log("エクスポート可能なテーブルがありません");
            db.close();
            resolve(result);
            return;
          }

          // 各テーブルのデータを取得
          tables.forEach((table) => {
            const tableName = table.name;

            // テーブル構造取得
            db.all(`PRAGMA table_info(${tableName})`, [], (err, columns) => {
              if (err) {
                console.error(`テーブル ${tableName} の構造取得エラー:`, err);
                completed++;
                if (completed === totalTables)
                  this.finishExport(result, db, resolve);
                return;
              }

              result.schema[tableName] = columns;

              // テーブルデータ取得
              db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
                if (err) {
                  console.error(
                    `テーブル ${tableName} のデータ取得エラー:`,
                    err
                  );
                  result.data[tableName] = [];
                  result.summary[tableName] = { count: 0, error: err.message };
                } else {
                  result.data[tableName] = rows;
                  result.summary[tableName] = {
                    count: rows.length,
                    columns: columns.map((col) => col.name),
                  };
                  console.log(`${tableName}: ${rows.length}件`);
                }

                completed++;
                if (completed === totalTables) {
                  this.finishExport(result, db, resolve);
                }
              });
            });
          });
        }
      );
    });
  }

  finishExport(result, db, resolve) {
    // JSONファイルとして保存
    const filename = `${this.exportDir}/database_export_${this.timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(result, null, 2));

    // サマリー表示
    console.log("\n=== エクスポート完了 ===");
    console.log(`ファイル: ${filename}`);
    console.log("\n=== データサマリー ===");

    Object.entries(result.summary).forEach(([table, info]) => {
      console.log(`${table}: ${info.count}件 [${info.columns?.join(", ")}]`);
    });

    // CSV形式でも保存
    this.saveAsCSV(result.data);

    db.close();
    resolve({
      filename,
      summary: result.summary,
      tables: Object.keys(result.data),
    });
  }

  saveAsCSV(data) {
    Object.entries(data).forEach(([tableName, rows]) => {
      if (rows.length === 0) return;

      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((header) => {
              const value = row[header];
              return value !== null && value !== undefined
                ? `"${String(value).replace(/"/g, '""')}"`
                : "";
            })
            .join(",")
        ),
      ].join("\n");

      const csvFile = `${this.exportDir}/${tableName}_${this.timestamp}.csv`;
      fs.writeFileSync(csvFile, csvContent);
      console.log(`CSV保存: ${csvFile}`);
    });
  }
}

// 実行
if (require.main === module) {
  const exporter = new QuickExporter();
  exporter
    .quickExport()
    .then((result) => {
      console.log("\n✅ エクスポート成功！");
      console.log("結果:", result);
    })
    .catch((error) => {
      console.error("❌ エクスポートエラー:", error);
    });
}

module.exports = QuickExporter;
