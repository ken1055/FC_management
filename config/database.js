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
    // 0) ロイヤリティ計算用: 指定年月の売上を店舗別に集計し店舗名/率を付与（JOIN有無どちらも対応）
    //    SELECT s.store_id, s.year, s.month, SUM(s.amount) as total_sales, ...
    //    FROM sales s [LEFT JOIN stores st ...]
    //    WHERE s.year = ? AND s.month = ? GROUP BY ...
    if (
      lower.startsWith("select") &&
      /from\s+sales\s+s/i.test(query) &&
      /where\s+s\.year\s*=\s*\?\s+and\s+s\.month\s*=\s*\?/i.test(lower) &&
      /sum\s*\(/i.test(lower) &&
      /group\s+by/i.test(lower)
    ) {
      const targetYear = Number(params[0]);
      const targetMonth = Number(params[1]);

      // 該当年月の売上取得
      const { data: salesRows, error: salesErr } = await supabase
        .from("sales")
        .select("store_id,year,month,amount")
        .eq("year", targetYear)
        .eq("month", targetMonth);
      if (salesErr) throw salesErr;

      // 店舗別に集計
      const byStore = new Map();
      for (const r of salesRows || []) {
        const sid = r.store_id;
        const amount = Number(r.amount) || 0;
        byStore.set(sid, (byStore.get(sid) || 0) + amount);
      }

      const storeIds = Array.from(byStore.keys());
      if (storeIds.length === 0) return { rows: [] };

      const { data: stores, error: storesErr } = await supabase
        .from("stores")
        .select("id,name,royalty_rate")
        .in("id", storeIds);
      if (storesErr) throw storesErr;

      // ロイヤリティ設定テーブルから最新の設定を取得
      const { data: royaltySettings, error: settingsErr } = await supabase
        .from("royalty_settings")
        .select("store_id,rate,effective_date")
        .in("store_id", storeIds)
        .lte(
          "effective_date",
          `${targetYear}-${targetMonth.toString().padStart(2, "0")}-01`
        )
        .order("effective_date", { ascending: false });
      if (settingsErr) throw settingsErr;

      // 店舗ごとの最新のロイヤリティ設定を取得
      const latestSettings = new Map();
      for (const setting of royaltySettings || []) {
        if (!latestSettings.has(setting.store_id)) {
          latestSettings.set(setting.store_id, setting.rate);
        }
      }

      const idToName = new Map((stores || []).map((s) => [s.id, s.name]));

      const rows = storeIds.map((sid) => ({
        store_id: sid,
        year: targetYear,
        month: targetMonth,
        total_sales: byStore.get(sid) || 0,
        store_name: idToName.get(sid) || null,
        royalty_rate:
          latestSettings.get(sid) ??
          (stores || []).find((s) => s.id === sid)?.royalty_rate ??
          null,
      }));

      return { rows };
    }

    // 0.1) ロイヤリティ計算結果一覧: royalty_calculations ←→ stores のJOINをエミュレート
    //   SELECT rc.*, s.name as store_name FROM royalty_calculations rc LEFT JOIN stores s ON rc.store_id = s.id
    if (
      lower.startsWith("select") &&
      /from\s+royalty_calculations\s+rc/i.test(lower) &&
      /left\s+join\s+stores\s+s\s+on\s+rc\.store_id\s*=\s*s\.id/i.test(lower)
    ) {
      // パラメータ（年/月やid）の抽出
      let yearParam = null;
      let monthParam = null;
      let idParam = null;
      if (
        /where\s+rc\.calculation_year\s*=\s*\?\s+and\s+rc\.calculation_month\s*=\s*\?/i.test(
          lower
        )
      ) {
        yearParam = Number(params[0]);
        monthParam = Number(params[1]);
      } else if (/where\s+rc\.calculation_year\s*=\s*\?/i.test(lower)) {
        // 年のみの条件（ロイヤリティレポート用）
        yearParam = Number(params[0]);
      } else if (/where\s+rc\.id\s*=\s*\?/i.test(lower)) {
        idParam = Number(params[0]);
      }

      // rc取得
      let rcQ = supabase.from("royalty_calculations").select("*");
      if (idParam != null) {
        rcQ = rcQ.eq("id", idParam);
      }
      if (yearParam != null) {
        rcQ = rcQ.eq("calculation_year", yearParam);
        if (monthParam != null) {
          rcQ = rcQ.eq("calculation_month", monthParam);
        }
      }
      const { data: rcRows, error: rcErr } = await rcQ;
      if (rcErr) throw rcErr;

      const storeIds = Array.from(
        new Set((rcRows || []).map((r) => r.store_id).filter(Boolean))
      );
      let idToStore = new Map();
      if (storeIds.length > 0) {
        const { data: stores, error: sErr } = await supabase
          .from("stores")
          .select(
            "id,name,manager_name,business_address,main_phone,representative_email"
          )
          .in("id", storeIds);
        if (sErr) throw sErr;
        idToStore = new Map((stores || []).map((s) => [s.id, s]));
      }

      // store_name付与、必要に応じて請求書用拡張フィールドも付与
      let rows = (rcRows || []).map((r) => {
        const st = idToStore.get(r.store_id) || {};
        return {
          ...r,
          store_name: st.name || null,
          owner_name: st.manager_name || null,
          store_address: st.business_address || null,
          store_phone: st.main_phone || null,
          store_email: st.representative_email || null,
        };
      });

      // ORDER BY の簡易実装
      if (/order\s+by\s+s\.name/i.test(lower)) {
        rows = rows.sort((a, b) =>
          (a.store_name || "").localeCompare(b.store_name || "")
        );
      } else if (/order\s+by\s+rc\.calculation_month,\s*s\.name/i.test(lower)) {
        // ロイヤリティレポート用: 月、店舗名でソート
        rows = rows.sort((a, b) => {
          const monthDiff =
            (a.calculation_month || 0) - (b.calculation_month || 0);
          if (monthDiff !== 0) return monthDiff;
          return (a.store_name || "").localeCompare(b.store_name || "");
        });
      }

      return { rows };
    }

    // 0.1.1) ロイヤリティレポート集計: royalty_calculations の月別集計をエミュレート
    //   SELECT rc.calculation_month, COUNT(rc.id) as store_count, SUM(...) FROM royalty_calculations rc WHERE rc.calculation_year = ? GROUP BY rc.calculation_month
    if (
      lower.startsWith("select") &&
      /from\s+royalty_calculations\s+rc/i.test(lower) &&
      /count\s*\(\s*rc\.id\s*\)/i.test(lower) &&
      /group\s+by\s+rc\.calculation_month/i.test(lower) &&
      /where\s+rc\.calculation_year\s*=\s*\?/i.test(lower)
    ) {
      const yearParam = Number(params[0]);

      // 指定年のロイヤリティ計算データを取得
      const { data: rcRows, error: rcErr } = await supabase
        .from("royalty_calculations")
        .select("*")
        .eq("calculation_year", yearParam);
      if (rcErr) throw rcErr;

      // 月別に集計
      const monthlyData = {};
      (rcRows || []).forEach((row) => {
        const month = row.calculation_month;
        if (!monthlyData[month]) {
          monthlyData[month] = {
            calculation_month: month,
            store_count: 0,
            total_sales: 0,
            total_royalty: 0,
            royalty_rates: [],
          };
        }
        monthlyData[month].store_count += 1;
        monthlyData[month].total_sales += row.monthly_sales || 0;
        monthlyData[month].total_royalty += row.royalty_amount || 0;
        monthlyData[month].royalty_rates.push(row.royalty_rate || 0);
      });

      // 平均ロイヤリティ率を計算して結果を生成
      const rows = Object.values(monthlyData).map((data) => ({
        calculation_month: data.calculation_month,
        store_count: data.store_count,
        total_sales: data.total_sales,
        total_royalty: data.total_royalty,
        avg_royalty_rate:
          data.royalty_rates.length > 0
            ? data.royalty_rates.reduce((sum, rate) => sum + rate, 0) /
              data.royalty_rates.length
            : 0,
      }));

      // 月順でソート
      rows.sort((a, b) => a.calculation_month - b.calculation_month);

      console.log(
        "ロイヤリティレポート集計エミュレーション完了:",
        rows.length,
        "件"
      );
      return { rows };
    }

    // 0.2) システム設定: settings → system_settings へのマッピング（SELECT）
    if (lower.startsWith("select") && /from\s+settings/i.test(lower)) {
      // WHERE句の解析（key_name を key にマップ）
      const { filters } = parseWhereEqConditions(originalQuery, params, 0);
      let qb = supabase
        .from("system_settings")
        .select("key,value,description,created_at,updated_at");
      filters.forEach(({ column, value }) => {
        const mappedColumn = column === "key_name" ? "key" : column;
        qb = qb.eq(mappedColumn, value);
      });

      const { data, error } = await qb;
      if (error) throw error;
      // settings互換のキー名に変換（key → key_name）
      const rows = (data || []).map((r) => ({
        key_name: r.key,
        value: r.value,
        description: r.description,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      return { rows };
    }

    // 0.3) 顧客一覧/詳細: customers c ←→ stores s のJOINをエミュレート
    //   SELECT c.*, s.name as store_name FROM customers c LEFT JOIN stores s ON c.store_id = s.id ...
    if (
      lower.startsWith("select") &&
      /from\s+customers\s+c/i.test(lower) &&
      /left\s+join\s+stores\s+s\s+on\s+c\.store_id\s*=\s*s\.id/i.test(lower)
    ) {
      // パターン判定: 詳細 or 一覧
      const isDetail = /where\s+c\.id\s*=\s*\?/i.test(lower);

      if (isDetail) {
        // c.id = ? [AND c.store_id = ?]
        const customerId = Number(params[0]);
        const storeIdFilter = /and\s+c\.store_id\s*=\s*\?/i.test(lower)
          ? Number(params[1])
          : null;

        const { data: custRows, error: cErr } = await supabase
          .from("customers")
          .select("*")
          .eq("id", customerId)
          .limit(1);
        if (cErr) throw cErr;
        let row = (custRows || [])[0] || null;
        if (!row) return { rows: [] };
        if (storeIdFilter != null && row.store_id !== storeIdFilter) {
          return { rows: [] };
        }

        let storeName = null;
        if (row.store_id) {
          const { data: st, error: sErr } = await supabase
            .from("stores")
            .select("id,name")
            .eq("id", row.store_id)
            .limit(1);
          if (sErr) throw sErr;
          storeName = (st || [])[0]?.name || null;
        }
        return { rows: [{ ...row, store_name: storeName }] };
      } else {
        // 一覧: optional c.store_id = ? と optional LIKE 3つ
        const hasStoreId = /where[\s\S]*c\.store_id\s*=\s*\?/i.test(lower);
        const hasLike = /like\s*\?/i.test(lower);

        let pIndex = 0;
        let storeIdFilter = null;
        if (hasStoreId) {
          storeIdFilter = Number(params[pIndex++]);
        }
        let like1 = null,
          like2 = null,
          like3 = null;
        if (hasLike) {
          like1 = String(params[pIndex++] || "");
          like2 = String(params[pIndex++] || "");
          like3 = String(params[pIndex++] || "");
        }

        // 取得
        let q = supabase
          .from("customers")
          .select("*")
          .order("created_at", { ascending: false });
        if (storeIdFilter != null) q = q.eq("store_id", storeIdFilter);
        const { data: custRows, error: cErr } = await q;
        if (cErr) throw cErr;

        // LIKE emulation（大文字小文字を区別せず、%を削除して部分一致）
        const norm = (s) => (s || "").toString().toLowerCase();
        const stripPct = (s) => (s || "").replace(/%/g, "").toLowerCase();
        let filtered = custRows || [];
        if (hasLike) {
          const t1 = stripPct(like1);
          const t2 = stripPct(like2);
          const t3 = stripPct(like3);
          filtered = filtered.filter((r) => {
            const name = norm(r.name);
            const code = norm(r.customer_code);
            const email = norm(r.email);
            return (
              (t1 && name.includes(t1)) ||
              (t2 && code.includes(t2)) ||
              (t3 && email.includes(t3))
            );
          });
        }

        // store name mapping
        const storeIds = Array.from(
          new Set(filtered.map((r) => r.store_id).filter(Boolean))
        );
        let idToName = new Map();
        if (storeIds.length > 0) {
          const { data: stores, error: sErr } = await supabase
            .from("stores")
            .select("id,name")
            .in("id", storeIds);
          if (sErr) throw sErr;
          idToName = new Map((stores || []).map((s) => [s.id, s.name]));
        }

        const rows = filtered.map((r) => ({
          ...r,
          store_name: idToName.get(r.store_id) || null,
        }));
        return { rows };
      }
    }

    // A) ロイヤリティ設定一覧: royalty_settings ←→ stores のJOINをエミュレート
    if (
      lower.startsWith("select") &&
      /from\s+royalty_settings\s+rs/i.test(lower) &&
      /left\s+join\s+stores\s+s\s+on\s+rs\.store_id\s*=\s*s\.id/i.test(lower)
    ) {
      console.log("ロイヤリティ設定JOINエミュレーション実行");
      const { data: settings, error: rErr } = await supabase
        .from("royalty_settings")
        .select("id,store_id,royalty_rate,effective_date,created_at,updated_at")
        .order("effective_date", { ascending: false });
      if (rErr) throw rErr;

      const storeIds = Array.from(
        new Set((settings || []).map((r) => r.store_id).filter(Boolean))
      );
      let idToName = new Map();
      if (storeIds.length > 0) {
        const { data: stores, error: sErr } = await supabase
          .from("stores")
          .select("id,name")
          .in("id", storeIds);
        if (sErr) throw sErr;
        idToName = new Map((stores || []).map((s) => [s.id, s.name]));
      }

      // ORDER BY rs.effective_date DESC, s.name 相当の並び替え
      const rows = (settings || [])
        .map((r) => ({
          ...r,
          store_name: idToName.get(r.store_id) || null,
        }))
        .sort((a, b) => {
          const ad = new Date(a.effective_date).getTime() || 0;
          const bd = new Date(b.effective_date).getTime() || 0;
          if (ad !== bd) return bd - ad; // DESC
          const an = a.store_name || "";
          const bn = b.store_name || "";
          return an.localeCompare(bn);
        });

      console.log(
        "ロイヤリティ設定JOINエミュレーション完了:",
        rows.length,
        "件"
      );
      return { rows };
    }

    // SELECT（特殊ケース: 集計/JOIN をSupabaseでエミュレート）
    // 1) グループ一覧: groups ←→ group_members の所属数集計
    if (
      lower.startsWith("select") &&
      /from\s+groups/i.test(query) &&
      /group_members/i.test(query) &&
      /count\s*\(/i.test(query)
    ) {
      // groupsを取得
      const { data: groups, error: gErr } = await supabase
        .from("groups")
        .select("id,name")
        .order("name", { ascending: true });
      if (gErr) throw gErr;

      // 各グループの所属店舗数を取得
      const results = [];
      for (const g of groups || []) {
        const { count, error: cErr } = await supabase
          .from("group_members")
          .select("id", { count: "exact", head: true })
          .eq("group_id", g.id);
        if (cErr) throw cErr;
        results.push({ id: g.id, name: g.name, agency_count: count || 0 });
      }
      return { rows: results };
    }

    // 2) 管理者の売上一覧: stores ←→ sales の件数/合計集計
    if (
      lower.startsWith("select") &&
      /from\s+stores/i.test(query) &&
      /left\s+join\s+sales/i.test(query) &&
      /group\s+by/i.test(query)
    ) {
      const { data: stores, error: sErr } = await supabase
        .from("stores")
        .select(
          "id,name,manager_name,business_address,main_phone,contract_type,contract_start_date,royalty_rate"
        )
        .order("name", { ascending: true });
      if (sErr) throw sErr;

      const rows = [];
      for (const a of stores || []) {
        const { data: saleRows, error: srErr } = await supabase
          .from("sales")
          .select("amount,id")
          .eq("store_id", a.id);
        if (srErr) throw srErr;
        const sales_count = (saleRows || []).length;
        const total_sales = (saleRows || []).reduce(
          (sum, s) => sum + (Number(s.amount) || 0),
          0
        );
        rows.push({
          id: a.id,
          name: a.name,
          manager_name: a.manager_name,
          business_address: a.business_address,
          main_phone: a.main_phone,
          contract_type: a.contract_type,
          contract_start_date: a.contract_start_date,
          royalty_rate: a.royalty_rate,
          sales_count,
          total_sales,
        });
      }
      return { rows };
    }

    // 3) グループ管理: 所属中の店舗一覧
    //   SELECT a.id, a.name FROM stores a INNER JOIN group_members ga ON a.id = ga.store_id WHERE ga.group_id = ? ORDER BY a.name
    if (
      lower.startsWith("select") &&
      /from\s+stores\s+a/i.test(query) &&
      /inner\s+join\s+group_members/i.test(query) &&
      /where\s+ga\.group_id\s*=\s*\?/i.test(query)
    ) {
      const groupIdParamIndex = 0; // 本クエリは?が1つのみ
      const groupId = params[groupIdParamIndex];
      const { data: members, error: mErr } = await supabase
        .from("group_members")
        .select("store_id")
        .eq("group_id", Number(groupId));
      if (mErr) throw mErr;
      const storeIds = (members || []).map((m) => m.store_id);
      if (storeIds.length === 0) return { rows: [] };
      const { data: stores, error: sErr } = await supabase
        .from("stores")
        .select("id,name")
        .in("id", storeIds)
        .order("name", { ascending: true });
      if (sErr) throw sErr;
      return { rows: stores || [] };
    }

    // 4) グループ管理: 未所属の店舗一覧
    //   SELECT a.id, a.name FROM stores a WHERE a.id NOT IN (
    //     SELECT ga.store_id FROM group_members ga WHERE ga.group_id = ?
    //   ) ORDER BY a.name
    if (
      lower.startsWith("select") &&
      /from\s+stores\s+a/i.test(query) &&
      /not\s+in\s*\(\s*select\s+ga\.store_id\s+from\s+group_members/i.test(
        lower
      )
    ) {
      const groupIdParamIndex = 0; // サブクエリの?が1つ
      const groupId = params[groupIdParamIndex];
      const { data: allStores, error: sErr } = await supabase
        .from("stores")
        .select("id,name");
      if (sErr) throw sErr;
      const { data: members, error: mErr } = await supabase
        .from("group_members")
        .select("store_id")
        .eq("group_id", Number(groupId));
      if (mErr) throw mErr;
      const memberIds = new Set((members || []).map((m) => m.store_id));
      const filtered = (allStores || [])
        .filter((s) => !memberIds.has(s.id))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return { rows: filtered };
    }

    // SELECT（単純）- 特殊ケースでない場合のみ
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

    // INSERT / INSERT OR REPLACE（settings → system_settings のUPSERT対応）
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

      // settingsテーブルのUPSERTをsystem_settingsへマッピング
      if (/\bsettings\b/i.test(tableName)) {
        const mapped = {
          key: insertData.key_name ?? insertData.key,
          value: insertData.value ?? null,
          description: insertData.description ?? null,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("system_settings")
          .upsert(mapped, { onConflict: "key" })
          .select();
        if (error) throw error;
        return {
          rows: data || [],
          lastID: null,
          changes: data?.length || 0,
        };
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

    // UPDATE（settings → system_settings のUPDATE対応）
    if (lower.startsWith("update")) {
      const tableName = extractTableName(query);
      if (!tableName) throw new Error("テーブル名を特定できません");

      // 改行を含むSET句を安全に抽出
      const setMatch = query.match(/set\s+([\s\S]+?)\s+(where|$)/i);
      if (!setMatch) throw new Error("UPDATEのSET句を解析できません");

      const setClause = setMatch[1];
      const setPairs = setClause.split(",");
      const updateData = {};

      let paramIndex = 0;
      for (const raw of setPairs) {
        const pair = raw.trim();
        if (!pair) continue;
        // column = ?
        const m = pair.match(/(\w+)\s*=\s*\?/);
        if (m) {
          updateData[m[1]] = params[paramIndex++];
          continue;
        }
        // column = 'literal' or "literal"
        const m2 = pair.match(/(\w+)\s*=\s*(['"])(.*?)\2/);
        if (m2) {
          updateData[m2[1]] = m2[3];
          continue;
        }
        // column = CURRENT_TIMESTAMP / NOW()
        const m3 = pair.match(/(\w+)\s*=\s*(current_timestamp|now\(\))/i);
        if (m3) {
          updateData[m3[1]] = new Date().toISOString();
          continue;
        }
      }

      // settingsはsystem_settingsへマッピング
      const targetTable = /\bsettings\b/i.test(tableName)
        ? "system_settings"
        : tableName;

      // キー名のマッピング（key_name → key）
      if (targetTable === "system_settings" && updateData.key_name) {
        updateData.key = updateData.key_name;
        delete updateData.key_name;
      }

      let qb = supabase.from(targetTable).update(updateData);

      // WHERE句を確実に解析（改行や複数空白に頑健）
      const { filters, usedParams } = parseWhereEqConditions(
        originalQuery,
        params,
        paramIndex
      );
      if (filters.length > 0) {
        filters.forEach(({ column, value }) => {
          const mappedColumn =
            targetTable === "system_settings" && column === "key_name"
              ? "key"
              : column;
          qb = qb.eq(mappedColumn, value);
        });
      } else {
        // PostgRESTはUPDATEにフィルタが必須
        throw new Error("Supabase UPDATE requires WHERE clause");
      }
      paramIndex += usedParams;

      const { data, error } = await qb.select();
      if (error) throw error;
      return { rows: data || [], changes: data?.length || 0 };
    }

    // DELETE（settings → system_settings のDELETE対応）
    if (lower.startsWith("delete")) {
      const tableName = extractTableName(query);
      if (!tableName) throw new Error("テーブル名を特定できません");

      const targetTable = /\bsettings\b/i.test(tableName)
        ? "system_settings"
        : tableName;

      let qb = supabase.from(targetTable).delete();
      // WHERE句を確実に解析（改行や複数空白に頑健）
      {
        const { filters } = parseWhereEqConditions(originalQuery, params, 0);
        if (filters.length > 0) {
          filters.forEach(({ column, value }) => {
            const mappedColumn =
              targetTable === "system_settings" && column === "key_name"
                ? "key"
                : column;
            qb = qb.eq(mappedColumn, value);
          });
        } else {
          // PostgRESTはDELETEにフィルタが必須
          throw new Error("Supabase DELETE requires WHERE clause");
        }
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
  // WHERE ... (supports newlines) ... until ORDER BY / LIMIT / EOL
  const whereMatch = query.match(/where\s+([\s\S]+?)(order\s+by|limit|$)/i);
  const filters = [];
  let usedParams = 0;
  if (whereMatch) {
    let condStr = whereMatch[1] || "";
    condStr = condStr.replace(/;+\s*$/i, "").trim();
    if (!condStr) return { filters, usedParams };

    // Split by AND (allow newlines around)
    const parts = condStr.split(/\s+and\s+/i);
    for (let raw of parts) {
      const part = raw
        .trim()
        .replace(/^\((.*)\)$/s, "$1")
        .trim();

      // Pattern: table.column = ?  or  column = ?
      const mQ = part.match(/([\w\.]+)\s*=\s*\?/);
      if (mQ) {
        const col = mQ[1];
        filters.push({ column: col, value: params[startIndex + usedParams] });
        usedParams += 1;
        continue;
      }

      // Pattern: column = 'literal'
      const mL = part.match(/([\w\.]+)\s*=\s*(["'])(.*?)\2/);
      if (mL) {
        filters.push({ column: mL[1], value: mL[3] });
        continue;
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
      // result.rowsが配列の場合は最初の要素を返し、nullの場合はnullを返す
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }

      // PGRST116エラーの場合、空の結果としてnullを返す
      if (result.error && result.error.code === "PGRST116") {
        console.log("Supabase get: データが存在しません");
        return null;
      }

      return null;
    } catch (error) {
      // PGRST116エラーは軽微な処理として扱う
      if (error.code === "PGRST116") {
        console.log("Supabase get: PGRST116 エラー、nullを返します");
        return null;
      }
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
