# データベースエクスポート完全ガイド

## 📊 現在のデータベース状況

### **データベース構成**

- **SQLite**: ローカル開発用（`agency.db`）
- **Supabase**: 本番環境用（PostgreSQL）

### **テーブル一覧と件数**

| テーブル名           | 件数 | 説明                 |
| -------------------- | ---- | -------------------- |
| stores               | 1    | FC 店舗情報          |
| customers            | 0    | 顧客情報             |
| sales                | 2    | 売上データ           |
| users                | 1    | 店舗ユーザー         |
| admins               | 1    | 管理者               |
| groups               | -    | グループ管理         |
| royalty_calculations | -    | ロイヤリティ計算結果 |
| royalty_settings     | -    | ロイヤリティ設定     |

## 🔧 方法 1: SQLite データベースのエクスポート

### **1.1 完全エクスポート（推奨）**

```bash
# 1. スキーマとデータを同時にエクスポート
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db .dump > fc_database_backup.sql

# 2. 圧縮してバックアップ
gzip fc_database_backup.sql
```

### **1.2 テーブル別エクスポート**

```bash
# スキーマのみ
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db .schema > schema_only.sql

# 各テーブルのデータのみ
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM stores;" > stores_data.csv
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM sales;" > sales_data.csv
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM users;" > users_data.csv
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM admins;" > admins_data.csv
```

### **1.3 CSV 形式でエクスポート**

```bash
# ヘッダー付きCSV
sqlite3 -header -csv /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM stores;" > stores.csv
sqlite3 -header -csv /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM sales;" > sales.csv
sqlite3 -header -csv /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM users;" > users.csv
sqlite3 -header -csv /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM admins;" > admins.csv
```

### **1.4 JSON 形式でエクスポート**

```bash
# Node.jsスクリプトでJSONエクスポート
node -e "
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('./agency.db');
const tables = ['stores', 'customers', 'sales', 'users', 'admins', 'groups', 'royalty_calculations'];
const result = {};

let completed = 0;
tables.forEach(table => {
  db.all(\`SELECT * FROM \${table}\`, [], (err, rows) => {
    if (!err) result[table] = rows;
    completed++;
    if (completed === tables.length) {
      fs.writeFileSync('database_export.json', JSON.stringify(result, null, 2));
      console.log('JSON export completed: database_export.json');
      db.close();
    }
  });
});
"
```

## 🌐 方法 2: Supabase データのエクスポート

### **2.1 Supabase CLI 使用**

```bash
# 1. Supabase CLIをインストール
npm install -g supabase

# 2. ログイン
supabase login

# 3. プロジェクトにリンク
supabase link --project-ref YOUR_PROJECT_REF

# 4. データベースをダンプ
supabase db dump --data-only > supabase_data.sql
supabase db dump --schema-only > supabase_schema.sql
supabase db dump > supabase_full_backup.sql
```

### **2.2 pg_dump 使用（直接接続）**

```bash
# データベース接続情報が必要
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" > supabase_backup.sql

# データのみ
pg_dump --data-only "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" > supabase_data_only.sql

# スキーマのみ
pg_dump --schema-only "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" > supabase_schema_only.sql
```

### **2.3 Supabase Dashboard 使用**

1. **Supabase ダッシュボード**にログイン
2. **Settings** → **Database**
3. **Connection pooling** → **Connection string**をコピー
4. **Table Editor**で各テーブルを**Export as CSV**

## 🔄 方法 3: MySQL 形式への変換

### **3.1 自動変換スクリプト**

```javascript
// convert_to_mysql.js
const fs = require("fs");

function convertSQLiteToMySQL(sqliteFile, outputFile) {
  let sql = fs.readFileSync(sqliteFile, "utf8");

  // SQLite → MySQL変換
  sql = sql
    // AUTOINCREMENT → AUTO_INCREMENT
    .replace(/AUTOINCREMENT/g, "AUTO_INCREMENT")
    // INTEGER PRIMARY KEY → INT PRIMARY KEY AUTO_INCREMENT
    .replace(
      /INTEGER PRIMARY KEY AUTOINCREMENT/g,
      "INT PRIMARY KEY AUTO_INCREMENT"
    )
    // TEXT → VARCHAR(255) または TEXT
    .replace(/(\w+)\s+TEXT(?!\s+(NOT\s+NULL|DEFAULT|UNIQUE))/g, "$1 TEXT")
    // REAL → DECIMAL
    .replace(/REAL/g, "DECIMAL(10,2)")
    // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    .replace(
      /TIMESTAMP DEFAULT CURRENT_TIMESTAMP/g,
      "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    )
    // SQLiteの日付関数をMySQLに変換
    .replace(/date\('now'\)/g, "CURDATE()")
    .replace(/datetime\('now'\)/g, "NOW()")
    // UNIQUE制約の調整
    .replace(/,\s*UNIQUE\s*\(([^)]+)\)/g, ", UNIQUE KEY ($1)")
    // 外部キー制約の調整
    .replace(/FOREIGN KEY/g, "CONSTRAINT FOREIGN KEY")
    // エンジンとcharsetを追加
    .replace(/\);$/gm, ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

  fs.writeFileSync(outputFile, sql);
  console.log(`MySQL変換完了: ${outputFile}`);
}

// 使用例
convertSQLiteToMySQL("fc_database_backup.sql", "fc_database_mysql.sql");
```

### **3.2 手動変換のポイント**

```sql
-- SQLite → MySQL変換例

-- 1. テーブル作成
-- SQLite
CREATE TABLE stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

-- MySQL
CREATE TABLE stores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. データ型変換
-- SQLite → MySQL
-- INTEGER → INT
-- TEXT → VARCHAR(255) または TEXT
-- REAL → DECIMAL(10,2)
-- BLOB → LONGBLOB
```

## 📦 方法 4: 完全バックアップ作成

### **4.1 ワンクリックバックアップスクリプト**

```bash
#!/bin/bash
# backup_database.sh

BACKUP_DIR="./database_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="fc_database_${TIMESTAMP}"

# バックアップディレクトリ作成
mkdir -p $BACKUP_DIR

echo "=== FC店舗管理システム データベースバックアップ開始 ==="

# 1. SQLiteバックアップ
echo "SQLiteデータベースをバックアップ中..."
sqlite3 ./agency.db .dump > "$BACKUP_DIR/${BACKUP_NAME}_sqlite.sql"

# 2. スキーマのみ
sqlite3 ./agency.db .schema > "$BACKUP_DIR/${BACKUP_NAME}_schema.sql"

# 3. CSV形式
echo "CSV形式でエクスポート中..."
sqlite3 -header -csv ./agency.db "SELECT * FROM stores;" > "$BACKUP_DIR/${BACKUP_NAME}_stores.csv"
sqlite3 -header -csv ./agency.db "SELECT * FROM sales;" > "$BACKUP_DIR/${BACKUP_NAME}_sales.csv"
sqlite3 -header -csv ./agency.db "SELECT * FROM users;" > "$BACKUP_DIR/${BACKUP_NAME}_users.csv"
sqlite3 -header -csv ./agency.db "SELECT * FROM admins;" > "$BACKUP_DIR/${BACKUP_NAME}_admins.csv"

# 4. JSON形式
echo "JSON形式でエクスポート中..."
node -e "
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('./agency.db');
const tables = ['stores', 'customers', 'sales', 'users', 'admins', 'groups', 'royalty_calculations', 'royalty_settings'];
const result = {};

let completed = 0;
tables.forEach(table => {
  db.all(\`SELECT * FROM \${table}\`, [], (err, rows) => {
    if (!err) result[table] = rows;
    completed++;
    if (completed === tables.length) {
      fs.writeFileSync('$BACKUP_DIR/${BACKUP_NAME}_data.json', JSON.stringify(result, null, 2));
      db.close();
    }
  });
});
"

# 5. MySQL形式変換
echo "MySQL形式に変換中..."
node convert_to_mysql.js "$BACKUP_DIR/${BACKUP_NAME}_sqlite.sql" "$BACKUP_DIR/${BACKUP_NAME}_mysql.sql"

# 6. 圧縮
echo "バックアップを圧縮中..."
cd $BACKUP_DIR
tar -czf "${BACKUP_NAME}_complete.tar.gz" ${BACKUP_NAME}_*
cd ..

echo "=== バックアップ完了 ==="
echo "バックアップ場所: $BACKUP_DIR"
echo "圧縮ファイル: ${BACKUP_NAME}_complete.tar.gz"
```

### **4.2 使用方法**

```bash
# 実行権限付与
chmod +x backup_database.sh

# バックアップ実行
./backup_database.sh
```

## 🚀 方法 5: 自動エクスポートスクリプト

```javascript
// database_export.js - 完全自動エクスポートスクリプト
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

class DatabaseExporter {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = new sqlite3.Database(dbPath);
    this.exportDir = "./exports";
    this.timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
  }

  async init() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  // テーブル一覧取得
  async getTables() {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map((row) => row.name));
        }
      );
    });
  }

  // テーブルデータ取得
  async getTableData(tableName) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // JSON形式エクスポート
  async exportJSON() {
    const tables = await this.getTables();
    const data = {};

    for (const table of tables) {
      data[table] = await this.getTableData(table);
    }

    const filename = `${this.exportDir}/database_${this.timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`JSON export completed: ${filename}`);
    return filename;
  }

  // CSV形式エクスポート
  async exportCSV() {
    const tables = await this.getTables();
    const files = [];

    for (const table of tables) {
      const data = await this.getTableData(table);
      if (data.length === 0) continue;

      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(","),
        ...data.map((row) => headers.map((h) => `"${row[h] || ""}"`).join(",")),
      ].join("\n");

      const filename = `${this.exportDir}/${table}_${this.timestamp}.csv`;
      fs.writeFileSync(filename, csvContent);
      files.push(filename);
    }

    console.log(`CSV export completed: ${files.length} files`);
    return files;
  }

  // SQL形式エクスポート
  async exportSQL() {
    const { exec } = require("child_process");
    const filename = `${this.exportDir}/database_${this.timestamp}.sql`;

    return new Promise((resolve, reject) => {
      exec(`sqlite3 ${this.dbPath} .dump > ${filename}`, (error) => {
        if (error) reject(error);
        else {
          console.log(`SQL export completed: ${filename}`);
          resolve(filename);
        }
      });
    });
  }

  // MySQL形式変換
  convertToMySQL(sqlFile) {
    const sql = fs.readFileSync(sqlFile, "utf8");
    const mysqlSql = sql
      .replace(/AUTOINCREMENT/g, "AUTO_INCREMENT")
      .replace(
        /INTEGER PRIMARY KEY AUTOINCREMENT/g,
        "INT PRIMARY KEY AUTO_INCREMENT"
      )
      .replace(/TEXT/g, "VARCHAR(255)")
      .replace(/REAL/g, "DECIMAL(10,2)")
      .replace(/\);$/gm, ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    const mysqlFile = sqlFile.replace(".sql", "_mysql.sql");
    fs.writeFileSync(mysqlFile, mysqlSql);
    console.log(`MySQL conversion completed: ${mysqlFile}`);
    return mysqlFile;
  }

  // 完全エクスポート実行
  async exportAll() {
    await this.init();
    console.log("=== データベース完全エクスポート開始 ===");

    try {
      const jsonFile = await this.exportJSON();
      const csvFiles = await this.exportCSV();
      const sqlFile = await this.exportSQL();
      const mysqlFile = this.convertToMySQL(sqlFile);

      console.log("=== エクスポート完了 ===");
      return {
        json: jsonFile,
        csv: csvFiles,
        sql: sqlFile,
        mysql: mysqlFile,
      };
    } catch (error) {
      console.error("エクスポートエラー:", error);
      throw error;
    } finally {
      this.db.close();
    }
  }
}

// 使用例
if (require.main === module) {
  const exporter = new DatabaseExporter("./agency.db");
  exporter
    .exportAll()
    .then((result) => {
      console.log("エクスポート結果:", result);
    })
    .catch((error) => {
      console.error("エラー:", error);
    });
}

module.exports = DatabaseExporter;
```

## 📋 推奨エクスポート手順

### **Step 1: 即座実行可能**

```bash
# 最も簡単な方法
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db .dump > fc_complete_backup.sql
```

### **Step 2: 詳細データ確認**

```bash
# データ件数確認
sqlite3 /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT 'stores' as table_name, COUNT(*) as count FROM stores UNION ALL SELECT 'sales', COUNT(*) FROM sales UNION ALL SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'admins', COUNT(*) FROM admins;"

# 実際のデータ確認
sqlite3 -header -column /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM stores;"
sqlite3 -header -column /Users/hanmayuujirou/Documents/FC管理/agency.db "SELECT * FROM sales;"
```

### **Step 3: 用途別エクスポート**

- **開発用**: JSON 形式
- **Excel 分析用**: CSV 形式
- **移行用**: SQL 形式（MySQL 変換済み）
- **バックアップ用**: 圧縮 SQL 形式

## ⚠️ 注意事項

1. **パスワード情報**: 管理者パスワードはハッシュ化されています
2. **ファイルパス**: アップロードファイルのパスは相対パスです
3. **外部キー**: SQLite → MySQL 移行時は外部キー制約の調整が必要
4. **文字エンコーディング**: UTF-8 で統一されています

**どの方法を試したいかお聞かせください！**
