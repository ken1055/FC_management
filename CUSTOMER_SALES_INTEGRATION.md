# 売上-顧客連携機能 実装設計書

## 📊 現状分析

### **現在のシステム構成**

#### **売上管理機能**

- **テーブル**: `sales`
- **フィールド**: `id`, `store_id`, `year`, `month`, `amount`
- **特徴**: 月単位の売上集計（店舗レベル）
- **制限**: 顧客情報との関連なし

#### **顧客管理機能**

- **テーブル**: `customers`
- **購入関連フィールド**:
  - `total_purchase_amount`: 総購入金額
  - `visit_count`: 来店回数
  - `last_visit_date`: 最終来店日
- **特徴**: 顧客個別の累計データ

### **問題点**

1. **売上データ**: 月単位集計のみ、顧客紐付けなし
2. **顧客データ**: 累計情報のみ、個別取引履歴なし
3. **データ不整合**: 売上合計と顧客購入合計の不一致リスク
4. **分析制限**: 顧客別売上分析が不可能

## 🔄 提案する改修内容

### **1. データベーススキーマ拡張**

#### **1.1 新テーブル: `customer_transactions`**

```sql
CREATE TABLE customer_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  transaction_date DATE NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  payment_method TEXT, -- '現金', 'カード', 'QR決済' など
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

#### **1.2 sales テーブル拡張**

```sql
-- 既存のsalesテーブルに顧客関連フィールドを追加
ALTER TABLE sales ADD COLUMN customer_id INTEGER;
ALTER TABLE sales ADD COLUMN transaction_date DATE;
ALTER TABLE sales ADD COLUMN description TEXT;

-- 外部キー制約追加
-- ALTER TABLE sales ADD CONSTRAINT fk_sales_customer
--   FOREIGN KEY (customer_id) REFERENCES customers(id);
```

#### **1.3 インデックス追加**

```sql
CREATE INDEX idx_customer_transactions_store_id ON customer_transactions(store_id);
CREATE INDEX idx_customer_transactions_customer_id ON customer_transactions(customer_id);
CREATE INDEX idx_customer_transactions_date ON customer_transactions(transaction_date);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
```

### **2. 機能改修設計**

#### **2.1 売上登録機能の拡張**

**従来の機能**: 月単位集計登録のみ
**新機能**:

- 個別取引登録（顧客選択可能）
- 月単位集計登録（従来通り）
- 自動集計機能

**画面フロー**:

```
売上登録画面
├── 登録タイプ選択
│   ├── 個別取引登録 → 顧客選択 → 取引詳細入力
│   └── 月次集計登録 → 従来通りの入力
└── 自動集計オプション
```

#### **2.2 顧客管理機能の拡張**

**新機能**:

- 取引履歴表示
- 売上貢献度分析
- 購入パターン分析

**顧客詳細画面の追加項目**:

- 取引履歴一覧
- 月別購入推移グラフ
- 平均購入間隔
- お気に入り商品/サービス

### **3. UI/UX 設計**

#### **3.1 売上登録画面の改修**

```html
<!-- 登録タイプ選択 -->
<div class="mb-3">
  <label class="form-label">登録タイプ</label>
  <div class="btn-group" role="group">
    <input
      type="radio"
      class="btn-check"
      name="registrationType"
      id="individual"
      value="individual"
    />
    <label class="btn btn-outline-primary" for="individual">個別取引</label>

    <input
      type="radio"
      class="btn-check"
      name="registrationType"
      id="monthly"
      value="monthly"
      checked
    />
    <label class="btn btn-outline-primary" for="monthly">月次集計</label>
  </div>
</div>

<!-- 個別取引用フィールド（条件表示） -->
<div id="individualFields" style="display: none;">
  <div class="mb-3">
    <label class="form-label">顧客選択</label>
    <select class="form-select" name="customer_id">
      <option value="">顧客を選択してください</option>
      <option value="new">新規顧客として登録</option>
      <!-- 既存顧客一覧 -->
    </select>
  </div>

  <div class="mb-3">
    <label class="form-label">取引日</label>
    <input type="date" class="form-control" name="transaction_date" />
  </div>

  <div class="mb-3">
    <label class="form-label">支払方法</label>
    <select class="form-select" name="payment_method">
      <option value="現金">現金</option>
      <option value="クレジットカード">クレジットカード</option>
      <option value="QR決済">QR決済</option>
      <option value="その他">その他</option>
    </select>
  </div>
</div>
```

#### **3.2 顧客詳細画面の拡張**

```html
<!-- 取引履歴タブ -->
<ul class="nav nav-tabs" id="customerTabs">
  <li class="nav-item">
    <a class="nav-link active" data-bs-toggle="tab" href="#basic-info"
      >基本情報</a
    >
  </li>
  <li class="nav-item">
    <a class="nav-link" data-bs-toggle="tab" href="#transaction-history"
      >取引履歴</a
    >
  </li>
  <li class="nav-item">
    <a class="nav-link" data-bs-toggle="tab" href="#analytics">分析</a>
  </li>
</ul>

<div class="tab-content">
  <!-- 取引履歴タブ内容 -->
  <div class="tab-pane fade" id="transaction-history">
    <div class="table-responsive">
      <table class="table table-striped">
        <thead>
          <tr>
            <th>日付</th>
            <th>金額</th>
            <th>支払方法</th>
            <th>備考</th>
          </tr>
        </thead>
        <tbody id="transactionList">
          <!-- 取引履歴をAJAXで読み込み -->
        </tbody>
      </table>
    </div>
  </div>
</div>
```

### **4. API 設計**

#### **4.1 新規 API エンドポイント**

```javascript
// 顧客取引履歴取得
GET /api/customers/:id/transactions
// レスポンス例
{
  "transactions": [
    {
      "id": 1,
      "date": "2025-09-25",
      "amount": 5000,
      "payment_method": "現金",
      "description": "コーヒー豆購入"
    }
  ],
  "summary": {
    "total_amount": 50000,
    "transaction_count": 10,
    "average_amount": 5000
  }
}

// 個別取引登録
POST /api/sales/transaction
{
  "customer_id": 1,
  "store_id": 1,
  "amount": 5000,
  "transaction_date": "2025-09-25",
  "payment_method": "現金",
  "description": "コーヒー豆購入"
}

// 顧客別売上集計
GET /api/customers/:id/sales-summary
{
  "monthly_sales": [
    {"year": 2025, "month": 1, "amount": 15000},
    {"year": 2025, "month": 2, "amount": 20000}
  ],
  "yearly_total": 35000
}
```

#### **4.2 既存 API 拡張**

```javascript
// 売上登録API拡張
POST /api/sales
{
  "type": "individual", // "individual" or "monthly"
  "store_id": 1,
  "amount": 5000,

  // 個別取引の場合
  "customer_id": 1,
  "transaction_date": "2025-09-25",
  "payment_method": "現金",
  "description": "商品購入",

  // 月次集計の場合（従来通り）
  "year": 2025,
  "month": 9
}
```

### **5. データ移行戦略**

#### **5.1 段階的移行**

**Phase 1**: テーブル追加

```sql
-- 新テーブル作成
CREATE TABLE customer_transactions (...);

-- 既存テーブル拡張
ALTER TABLE sales ADD COLUMN customer_id INTEGER;
ALTER TABLE sales ADD COLUMN transaction_date DATE;
```

**Phase 2**: 機能追加

- 個別取引登録機能
- 顧客選択機能
- 取引履歴表示

**Phase 3**: データ整合性

- 既存データの整合性チェック
- 自動集計機能
- レポート機能拡張

#### **5.2 後方互換性**

```javascript
// 既存の月次売上登録は引き続き動作
// customer_id = NULL の場合は従来の集計データとして扱う

function registerSales(data) {
  if (data.customer_id) {
    // 個別取引として登録
    registerIndividualTransaction(data);
    // 顧客統計を更新
    updateCustomerStats(data.customer_id, data.amount);
  } else {
    // 従来の月次集計として登録
    registerMonthlySales(data);
  }
}
```

### **6. 実装スケジュール**

#### **6.1 開発工程（2 週間）**

**Week 1**: データベース・バックエンド

- Day 1-2: スキーマ設計・テーブル作成
- Day 3-4: API 実装（取引登録・履歴取得）
- Day 5: 顧客統計更新ロジック

**Week 2**: フロントエンド・統合

- Day 1-2: 売上登録画面改修
- Day 3-4: 顧客詳細画面拡張
- Day 5: 統合テスト・デバッグ

#### **6.2 リリース戦略**

1. **ベータ版**: 管理者のみ利用可能
2. **段階リリース**: 一部店舗でテスト運用
3. **本格運用**: 全店舗展開

### **7. 期待効果**

#### **7.1 業務効率化**

- 顧客別売上分析が可能
- 個別取引履歴の管理
- データ入力の柔軟性向上

#### **7.2 分析能力向上**

- 顧客ライフタイムバリュー分析
- 購入パターン分析
- リピート率計算
- セグメント別売上分析

#### **7.3 顧客サービス向上**

- 個別対応の質向上
- 購入履歴に基づく提案
- ロイヤルティプログラム基盤

## 🚀 次のステップ

1. **要件確認**: 上記設計内容の確認・調整
2. **プロトタイプ作成**: 核心機能の実装
3. **テストデータ準備**: 動作確認用データ作成
4. **段階的実装**: Phase 1 から順次実装

**この設計で進めてよろしいでしょうか？**
