# X サーバー MySQL 移行ガイド

## 1. MySQL への移行方法

### 1.1 依存関係の変更

```bash
# Supabaseクライアントを削除
npm uninstall @supabase/supabase-js

# MySQLクライアントを追加
npm install mysql2
```

### 1.2 データベース設定ファイルの変更

`config/database.js` を以下のように変更：

```javascript
const mysql = require("mysql2/promise");

// MySQL接続設定
const mysqlConfig = {
  host: "your-xserver-host.xserver.jp",
  user: "your_mysql_user",
  password: "your_mysql_password",
  database: "your_database_name",
  charset: "utf8mb4",
  timezone: "+09:00",
};

let connection;

async function connectMySQL() {
  if (!connection) {
    connection = await mysql.createConnection(mysqlConfig);
  }
  return connection;
}

// 既存のdb.runをMySQLに対応
async function run(query, params = []) {
  const conn = await connectMySQL();
  const [results] = await conn.execute(query, params);
  return results;
}

// 既存のdb.getをMySQLに対応
async function get(query, params = []) {
  const conn = await connectMySQL();
  const [rows] = await conn.execute(query, params);
  return rows[0];
}

// 既存のdb.allをMySQLに対応
async function all(query, params = []) {
  const conn = await connectMySQL();
  const [rows] = await conn.execute(query, params);
  return rows;
}

module.exports = { run, get, all };
```

### 1.3 スキーマファイルを MySQL 用に変更

`mysql/schema.sql` を作成：

```sql
-- MySQL用スキーマ（AUTO_INCREMENTとTIMESTAMPを使用）
CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  business_address TEXT,
  main_phone VARCHAR(20),
  manager_name VARCHAR(100),
  mobile_phone VARCHAR(20),
  representative_email VARCHAR(255),
  contract_type VARCHAR(50),
  contract_start_date DATE,
  royalty_rate DECIMAL(5,2) DEFAULT 5.00,
  invoice_number VARCHAR(50),
  bank_name VARCHAR(100),
  branch_name VARCHAR(100),
  account_type VARCHAR(20),
  account_number VARCHAR(20),
  account_holder VARCHAR(100),
  license_status VARCHAR(20) DEFAULT 'none',
  license_type VARCHAR(50),
  license_number VARCHAR(50),
  license_file_path TEXT,
  line_official_id VARCHAR(100),
  representative_gmail VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 他のテーブルも同様に変更...
```

### 1.4 環境変数設定

`.env` ファイルを更新：

```env
# MySQLデータベース設定
DB_TYPE=mysql
MYSQL_HOST=your-xserver-host.xserver.jp
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=your_database_name
MYSQL_PORT=3306

# その他の設定
NODE_ENV=production
PORT=3000
SESSION_SECRET=your_session_secret
```

## 2. X サーバーでの Node.js 運用について

### 2.1 制限事項

- X サーバーは PHP 中心のサービス
- Node.js の直接実行は**サポートされていません**
- 静的ファイルと PHP のみ利用可能

### 2.2 推奨される代替案

1. **VPS/専用サーバーへの移行**

   - さくら VPS、ConoHa VPS、AWS EC2 など
   - Node.js が自由に実行可能

2. **Heroku、Railway、Render などのクラウドサービス**
   - Node.js アプリケーションに特化
   - 簡単デプロイ

## 3. PHP での静的化について

### 3.1 実現可能性

✅ **完全に可能**です。以下の方針で実現：

### 3.2 アーキテクチャ変更

```
現在: Node.js + Express + EJS + Supabase
↓
変更後: PHP + MySQL + HTML/CSS/JS
```

### 3.3 必要な変更作業

#### A) テンプレートエンジンの変更

- EJS テンプレート → PHP + HTML
- サーバーサイドレンダリング維持

#### B) ルーティングの変更

- Express.js ルーター → PHP 個別ファイル
- `/customers/list` → `customers/list.php`

#### C) 認証システムの変更

- Express-session → PHP $\_SESSION
- セキュリティ強化（CSRF 対策など）

#### D) データベース操作の変更

- Node.js database.js → PHP PDO/MySQLi

### 3.4 ファイル構成例

```
/
├── index.php              # トップページ
├── config/
│   ├── database.php       # DB接続設定
│   └── auth.php          # 認証設定
├── customers/
│   ├── list.php          # 顧客一覧
│   ├── form.php          # 顧客登録・編集
│   └── detail.php        # 顧客詳細
├── sales/
│   ├── list.php          # 売上一覧
│   └── form.php          # 売上登録・編集
├── royalty/
│   ├── settings.php      # ロイヤリティ設定
│   ├── calculations.php  # 計算実行
│   └── report.php        # レポート
├── includes/
│   ├── header.php        # 共通ヘッダー
│   ├── footer.php        # 共通フッター
│   └── functions.php     # 共通関数
└── assets/
    ├── css/              # スタイルシート
    ├── js/               # JavaScript
    └── images/           # 画像ファイル
```

## 4. 移行の優先順位と推奨事項

### 4.1 推奨順序

1. **MySQL 対応** (比較的簡単)
2. **クラウドサービスでの Node.js 継続** (中程度)
3. **PHP 完全移行** (大規模な変更)

### 4.2 各選択肢の比較

| 選択肢                     | 開発工数 | 保守性 | パフォーマンス | コスト |
| -------------------------- | -------- | ------ | -------------- | ------ |
| Node.js + MySQL + VPS      | 小       | 高     | 高             | 中     |
| Node.js + MySQL + クラウド | 小       | 高     | 高             | 中〜高 |
| PHP + MySQL + X サーバー   | 大       | 中     | 中             | 低     |

### 4.3 推奨事項

**最も効率的**: Node.js + MySQL + Railway/Render

- 現在のコードベースを最大限活用
- 高いパフォーマンスと保守性
- 適切なコスト

## 5. 移行支援

必要に応じて以下の作業を支援できます：

- MySQL スキーマ変換
- database.js の MySQL 対応
- PHP 版の部分的な実装
- デプロイ設定の最適化

どの方針で進めたいかお聞かせください。
