# 静的ファイルビルド & X サーバー運用ガイド

## 1. 実現可能性の分析

### ✅ 実現可能な部分

- **フロントエンド（表示部分）**: 完全に静的化可能
- **スタイル・JavaScript**: 問題なく動作
- **読み取り専用データ**: JSON 形式で事前生成可能

### ❌ 制約がある部分

- **データベース操作**: 静的ファイルでは不可能
- **認証・セッション管理**: サーバーサイド処理が必要
- **動的データ更新**: リアルタイム反映が困難

## 2. 推奨アーキテクチャ

### 2.1 ハイブリッド構成（最も実用的）

```
静的部分（HTML/CSS/JS） + 動的部分（PHP API）
```

**構成例**:

```
/
├── index.html              # 静的フロントエンド
├── customers/
│   └── index.html          # 顧客管理画面（静的）
├── sales/
│   └── index.html          # 売上管理画面（静的）
├── api/                    # PHP API（動的処理）
│   ├── customers.php       # 顧客データAPI
│   ├── sales.php           # 売上データAPI
│   └── auth.php            # 認証API
├── assets/
│   ├── css/
│   ├── js/
│   └── data/               # 静的データ（JSON）
└── config/
    └── database.php        # DB接続設定
```

### 2.2 完全静的化（制限付き）

データベース更新を諦めて、完全に静的なレポートサイトとして構築

## 3. 実装方法

### 3.1 静的ビルドツールの作成

```javascript
// build-static.js - 静的ファイル生成スクリプト
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const db = require("./db");

async function buildStaticSite() {
  console.log("静的サイトビルド開始...");

  // 1. データを事前取得
  const stores = await db.all("SELECT * FROM stores");
  const customers = await db.all("SELECT * FROM customers");
  const sales = await db.all("SELECT * FROM sales");

  // 2. 静的データファイル生成
  fs.writeFileSync("./dist/data/stores.json", JSON.stringify(stores));
  fs.writeFileSync("./dist/data/customers.json", JSON.stringify(customers));
  fs.writeFileSync("./dist/data/sales.json", JSON.stringify(sales));

  // 3. HTMLファイル生成
  await buildPage("customers/list", { customers, stores });
  await buildPage("sales/list", { sales, stores });
  await buildPage("royalty/report", {
    reportData: await generateRoyaltyReport(),
  });

  console.log("静的サイトビルド完了");
}

async function buildPage(pageName, data) {
  const template = fs.readFileSync(`./views/${pageName}.ejs`, "utf8");
  const html = ejs.render(template, {
    ...data,
    session: { user: { role: "admin" } }, // 仮のセッション
    title: pageName,
  });

  const outputPath = `./dist/${pageName}.html`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
}

// 実行
buildStaticSite().catch(console.error);
```

### 3.2 package.json にビルドスクリプト追加

```json
{
  "scripts": {
    "build": "node build-static.js",
    "build:prod": "NODE_ENV=production node build-static.js"
  }
}
```

### 3.3 動的機能用 PHP API 作成

```php
<?php
// api/customers.php - 顧客データAPI
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once '../config/database.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $customers = getCustomers();
        echo json_encode($customers);
        break;

    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);
        $result = createCustomer($input);
        echo json_encode($result);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}

function getCustomers() {
    global $pdo;
    $stmt = $pdo->query('SELECT * FROM customers ORDER BY created_at DESC');
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function createCustomer($data) {
    global $pdo;
    $stmt = $pdo->prepare('
        INSERT INTO customers (name, email, phone, store_id)
        VALUES (?, ?, ?, ?)
    ');
    $result = $stmt->execute([
        $data['name'],
        $data['email'],
        $data['phone'],
        $data['store_id']
    ]);

    return ['success' => $result, 'id' => $pdo->lastInsertId()];
}
?>
```

### 3.4 フロントエンド JavaScript（API 連携）

```javascript
// assets/js/customers.js
class CustomerManager {
  constructor() {
    this.apiBase = "/api";
  }

  async getCustomers() {
    const response = await fetch(`${this.apiBase}/customers.php`);
    return await response.json();
  }

  async createCustomer(customerData) {
    const response = await fetch(`${this.apiBase}/customers.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(customerData),
    });
    return await response.json();
  }

  async refreshCustomerList() {
    const customers = await this.getCustomers();
    this.renderCustomerTable(customers);
  }

  renderCustomerTable(customers) {
    const tableBody = document.getElementById("customer-table-body");
    tableBody.innerHTML = customers
      .map(
        (customer) => `
            <tr>
                <td>${customer.customer_code || "-"}</td>
                <td>${customer.name}</td>
                <td>${customer.email || "-"}</td>
                <td>${customer.phone || "-"}</td>
                <td>
                    <button onclick="editCustomer(${
                      customer.id
                    })" class="btn btn-sm btn-primary">編集</button>
                    <button onclick="deleteCustomer(${
                      customer.id
                    })" class="btn btn-sm btn-danger">削除</button>
                </td>
            </tr>
        `
      )
      .join("");
  }
}

// 初期化
document.addEventListener("DOMContentLoaded", () => {
  const customerManager = new CustomerManager();
  customerManager.refreshCustomerList();
});
```

## 4. ビルド・デプロイフロー

### 4.1 開発フロー

```bash
# 1. 開発中はNode.jsで動作確認
npm start

# 2. 静的ファイル生成
npm run build

# 3. distフォルダをXサーバーにアップロード
# - HTML/CSS/JS: 静的ファイルとして配信
# - PHP API: 動的処理を担当
```

### 4.2 ディレクトリ構成（デプロイ後）

```
public_html/                # Xサーバーのドキュメントルート
├── index.html              # 静的ページ
├── customers/
│   └── index.html
├── sales/
│   └── index.html
├── api/                    # PHP API
│   ├── customers.php
│   ├── sales.php
│   └── auth.php
├── assets/
│   ├── css/
│   ├── js/
│   └── data/              # 事前生成されたJSONデータ
└── config/
    └── database.php
```

## 5. 制約と対処法

### 5.1 主な制約

| 機能             | 静的化可能性 | 対処法                |
| ---------------- | ------------ | --------------------- |
| データ表示       | ✅ 完全対応  | 事前ビルド or PHP API |
| データ登録・更新 | ❌ 要 PHP    | PHP API + AJAX        |
| 認証・セッション | ❌ 要 PHP    | PHP セッション管理    |
| リアルタイム更新 | ❌ 制限あり  | 定期的な再ビルド      |

### 5.2 推奨される運用方法

**パターン A: 準静的サイト（推奨）**

- 表示部分: 静的 HTML
- データ操作: PHP API
- 更新頻度: 必要に応じて手動ビルド

**パターン B: 完全静的サイト**

- 全て事前生成 HTML
- データ更新不可（レポート専用）
- 更新頻度: 定期的な自動ビルド

## 6. 実装支援

以下の作業を支援可能です：

1. **静的ビルドスクリプト作成**
   - 現在の EJS テンプレートから静的 HTML 生成
   - データの JSON 化
2. **PHP API 開発**
   - 既存の Node.js 処理を PHP 化
   - MySQL 接続・CRUD 操作
3. **フロントエンド改修**

   - AJAX 通信の実装
   - 動的な UI 更新

4. **デプロイ設定**
   - X サーバー用の設定最適化
   - ビルド・アップロードの自動化

## 7. 推奨事項

**最も実用的な構成**: **準静的サイト（パターン A）**

**理由**:

- 高速な表示速度（静的 HTML）
- データ操作機能を維持（PHP API）
- X サーバーで完全動作
- 開発・保守コストが適切

この方針で進める場合、具体的な実装を開始できます。どの部分から始めたいかお聞かせください。
