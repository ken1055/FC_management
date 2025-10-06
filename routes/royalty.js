const express = require("express");
const router = express.Router();
// Supabase接続を取得
const { getSupabaseClient } = require("../config/supabase");
const db = getSupabaseClient();
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const https = require("https");
const fontkit = require("fontkit");

// 管理者権限チェック関数
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== "admin") {
    return res.status(403).render("error", {
      message: "管理者権限が必要です",
      session: req.session,
    });
  }
  next();
}

// ロイヤリティ設定一覧
router.get("/settings", requireAdmin, (req, res) => {
  const query = `
    SELECT rs.id, rs.store_id, rs.royalty_rate as royalty_rate, rs.effective_date, rs.created_at, s.name as store_name
    FROM royalty_settings rs
    LEFT JOIN stores s ON rs.store_id = s.id
    ORDER BY rs.effective_date DESC, s.name
  `;

  db.all(query, [], (err, settings) => {
    if (err) {
      console.error("ロイヤリティ設定取得エラー:", err);
      return res.status(500).render("error", {
        message: "ロイヤリティ設定の取得に失敗しました",
        session: req.session,
      });
    }

    res.render("royalty_settings", {
      settings: settings || [],
      session: req.session,
      title: "ロイヤリティ設定",
    });
  });
});

// ロイヤリティ設定フォーム表示
router.get("/settings/new", requireAdmin, (req, res) => {
  db.all("SELECT id, name FROM stores ORDER BY name", [], (err, stores) => {
    if (err) {
      console.error("店舗一覧取得エラー:", err);
      return res.status(500).render("error", {
        message: "店舗一覧の取得に失敗しました",
        session: req.session,
      });
    }

    res.render("royalty_settings_form", {
      setting: null,
      stores: stores || [],
      session: req.session,
      title: "ロイヤリティ設定追加",
    });
  });
});

// ロイヤリティ設定編集フォーム表示
router.get("/settings/edit/:id", requireAdmin, (req, res) => {
  const settingId = req.params.id;

  const settingQuery = "SELECT * FROM royalty_settings WHERE id = ?";
  const storesQuery = "SELECT id, name FROM stores ORDER BY name";

  db.get(settingQuery, [settingId], (err, setting) => {
    if (err) {
      console.error("ロイヤリティ設定取得エラー:", err);
      return res.status(500).render("error", {
        message: "ロイヤリティ設定の取得に失敗しました",
        session: req.session,
      });
    }

    if (!setting) {
      return res.status(404).render("error", {
        message: "ロイヤリティ設定が見つかりません",
        session: req.session,
      });
    }

    db.all(storesQuery, [], (err, stores) => {
      if (err) {
        console.error("店舗一覧取得エラー:", err);
        return res.status(500).render("error", {
          message: "店舗一覧の取得に失敗しました",
          session: req.session,
        });
      }

      res.render("royalty_settings_form", {
        setting: setting,
        stores: stores || [],
        session: req.session,
        title: "ロイヤリティ設定編集",
      });
    });
  });
});

// ロイヤリティ設定保存
router.post("/settings/save", requireAdmin, (req, res) => {
  const { id, store_id, royalty_rate, effective_date } = req.body;

  if (!store_id || !royalty_rate || !effective_date) {
    return res.status(400).render("error", {
      message: "必須項目が入力されていません",
      session: req.session,
    });
  }

  if (id) {
    // 更新
    const query = `
      UPDATE royalty_settings 
      SET store_id = ?, royalty_rate = ?, effective_date = ?
      WHERE id = ?
    `;

    db.run(query, [store_id, royalty_rate, effective_date, id], function (err) {
      if (err) {
        console.error("ロイヤリティ設定更新エラー:", err);
        return res.status(500).render("error", {
          message: "ロイヤリティ設定の更新に失敗しました",
          session: req.session,
        });
      }

      console.log("ロイヤリティ設定更新成功:", id);
      res.redirect("/royalty/settings");
    });
  } else {
    // 新規作成
    const query = `
      INSERT INTO royalty_settings (store_id, royalty_rate, effective_date)
      VALUES (?, ?, ?)
    `;

    db.run(query, [store_id, royalty_rate, effective_date], function (err) {
      if (err) {
        console.error("ロイヤリティ設定作成エラー:", err);
        return res.status(500).render("error", {
          message: "ロイヤリティ設定の作成に失敗しました",
          session: req.session,
        });
      }

      console.log("ロイヤリティ設定作成成功:", this.lastID);
      res.redirect("/royalty/settings");
    });
  }
});

// ロイヤリティ設定削除
router.post("/settings/delete/:id", requireAdmin, (req, res) => {
  const settingId = req.params.id;

  db.run(
    "DELETE FROM royalty_settings WHERE id = ?",
    [settingId],
    function (err) {
      if (err) {
        console.error("ロイヤリティ設定削除エラー:", err);
        return res.status(500).render("error", {
          message: "ロイヤリティ設定の削除に失敗しました",
          session: req.session,
        });
      }

      console.log("ロイヤリティ設定削除成功:", settingId);
      res.redirect("/royalty/settings");
    }
  );
});

// ロイヤリティ計算一覧
router.get("/calculations", requireAdmin, (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const month = req.query.month || new Date().getMonth() + 1;

  // Supabase対応の処理に変更
  handleRoyaltyCalculationsList(year, month, req, res);
});

// ロイヤリティ計算一覧取得の処理関数（Supabase対応）
async function handleRoyaltyCalculationsList(year, month, req, res) {
  try {
    // ロイヤリティ計算データを取得（Supabase）
    const { data: calculations, error: calculationError } = await db
      .from("royalty_calculations")
      .select("*")
      .eq("calculation_year", year)
      .eq("calculation_month", month)
      .order("store_id");

    if (calculationError) {
      console.error("ロイヤリティ計算取得エラー:", calculationError);
      return res.status(500).render("error", {
        message: "ロイヤリティ計算の取得に失敗しました",
        session: req.session,
      });
    }

    // 店舗情報を別途取得
    let enrichedCalculations = calculations || [];
    if (calculations && calculations.length > 0) {
      const storeIds = [...new Set(calculations.map((c) => c.store_id))];
      const { data: stores, error: storeError } = await db
        .from("stores")
        .select("id, name")
        .in("id", storeIds);

      if (!storeError && stores) {
        const storeMap = {};
        stores.forEach((store) => {
          storeMap[store.id] = store.name;
        });

        enrichedCalculations = calculations.map((calc) => ({
          ...calc,
          store_name: storeMap[calc.store_id] || `店舗ID ${calc.store_id}`,
        }));

        // 店舗名でソート
        enrichedCalculations.sort((a, b) =>
          (a.store_name || "").localeCompare(b.store_name || "")
        );
      }
    }

    res.render("royalty_calculations", {
      calculations: enrichedCalculations,
      currentYear: parseInt(year),
      currentMonth: parseInt(month),
      store_search: req.query.store_search || "",
      session: req.session,
      title: "ロイヤリティ計算結果",
    });
  } catch (error) {
    console.error("ロイヤリティ計算一覧エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
}

// ロイヤリティ自動計算実行
router.post("/calculate", requireAdmin, async (req, res) => {
  const { year, month } = req.body;

  if (!year || !month) {
    return res.status(400).json({
      success: false,
      message: "年と月を指定してください",
    });
  }

  // 指定月の売上データを取得（customer_transactionsから集計）
  await calculateRoyaltyFromTransactions(year, month, res);
});

// customer_transactionsからロイヤリティ計算を実行する関数
async function calculateRoyaltyFromTransactions(year, month, res) {
  try {
    console.log(`ロイヤリティ計算開始: ${year}年${month}月`);

    // 指定月の取引データを取得
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

    const { data: transactions, error: transactionError } = await db
      .from("customer_transactions")
      .select("store_id, amount, transaction_date")
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate);

    if (transactionError) {
      console.error("取引データ取得エラー:", transactionError);
      return res.status(500).json({
        success: false,
        message: "売上データの取得に失敗しました",
      });
    }

    // 店舗情報を取得
    const { data: stores, error: storesError } = await db
      .from("stores")
      .select("id, name, royalty_rate");

    if (storesError) {
      console.error("店舗情報取得エラー:", storesError);
      return res.status(500).json({
        success: false,
        message: "店舗情報の取得に失敗しました",
      });
    }

    // 店舗ごとの売上を集計
    const storeMap = {};
    stores.forEach((store) => {
      storeMap[store.id] = {
        store_id: store.id,
        store_name: store.name,
        total_sales: 0,
        royalty_rate: store.royalty_rate || 0,
        year: parseInt(year),
        month: parseInt(month),
      };
    });

    // 取引データを店舗ごとに集計
    transactions.forEach((transaction) => {
      if (storeMap[transaction.store_id]) {
        storeMap[transaction.store_id].total_sales += transaction.amount || 0;
      }
    });

    const salesData = Object.values(storeMap);
    console.log("集計された売上データ:", salesData.length, "店舗");

    if (salesData.length === 0) {
      return res.json({
        success: false,
        message: "計算対象の店舗が見つかりません",
      });
    }

    await processRoyaltyCalculations(salesData, year, month, res);
  } catch (error) {
    console.error("ロイヤリティ計算エラー:", error);
    res.status(500).json({
      success: false,
      message: "ロイヤリティ計算でエラーが発生しました",
    });
  }
}

// ロイヤリティ計算処理を実行する関数
async function processRoyaltyCalculations(salesData, year, month, res) {
  try {
    const totalStores = salesData.length;

    // 各店舗のロイヤリティ計算を並行処理
    const promises = salesData.map(async (sale) => {
      const royaltyAmount = Math.round(
        sale.total_sales * (sale.royalty_rate / 100)
      );

      try {
        // ロイヤリティ計算結果を保存（Supabase）
        const { data, error } = await db.from("royalty_calculations").upsert(
          {
            store_id: sale.store_id,
            calculation_year: year,
            calculation_month: month,
            monthly_sales: sale.total_sales,
            royalty_rate: sale.royalty_rate,
            royalty_amount: royaltyAmount,
            status: "calculated",
          },
          {
            onConflict: "store_id,calculation_year,calculation_month",
          }
        );

        if (error) {
          console.error("ロイヤリティ計算保存エラー:", error);
          return {
            store_id: sale.store_id,
            store_name: sale.store_name || `店舗ID ${sale.store_id}`,
            success: false,
            error: error.message,
          };
        } else {
          console.log(
            `店舗「${sale.store_name || sale.store_id}」 rate=${
              sale.royalty_rate
            }% sales=¥${sale.total_sales.toLocaleString()} royalty=¥${royaltyAmount.toLocaleString()}`
          );
          return {
            store_id: sale.store_id,
            store_name: sale.store_name || `店舗ID ${sale.store_id}`,
            success: true,
            sales: sale.total_sales,
            royalty_rate: sale.royalty_rate,
            royalty_amount: royaltyAmount,
          };
        }
      } catch (error) {
        console.error("ロイヤリティ計算処理エラー:", error);
        return {
          store_id: sale.store_id,
          store_name: sale.store_name || `店舗ID ${sale.store_id}`,
          success: false,
          error: error.message,
        };
      }
    });

    // 全ての計算を実行
    const calculationResults = await Promise.all(promises);

    // 集計結果を計算
    const totalSales = calculationResults
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.sales, 0);
    const totalRoyalty = calculationResults
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.royalty_amount, 0);

    // 結果をレスポンス
    res.json({
      success: true,
      message: `ロイヤリティ計算完了: ${
        calculationResults.filter((r) => r.success).length
      }件成功, ${calculationResults.filter((r) => !r.success).length}件エラー`,
      summary: {
        year: parseInt(year),
        month: parseInt(month),
        total_stores: totalStores,
        processed_stores: calculationResults.filter((r) => r.success).length,
        error_stores: calculationResults.filter((r) => !r.success).length,
        total_sales: totalSales,
        total_royalty: totalRoyalty,
      },
      details: calculationResults,
    });
  } catch (error) {
    console.error("ロイヤリティ計算処理エラー:", error);
    res.status(500).json({
      success: false,
      message: "ロイヤリティ計算処理でエラーが発生しました",
    });
  }
}

// ロイヤリティ計算結果削除
router.post("/calculations/delete", requireAdmin, (req, res) => {
  const { year, month } = req.body;

  if (!year || !month) {
    return res.status(400).json({
      success: false,
      message: "年と月を指定してください",
    });
  }

  const query =
    "DELETE FROM royalty_calculations WHERE calculation_year = ? AND calculation_month = ?";

  db.run(query, [year, month], function (err) {
    if (err) {
      console.error("ロイヤリティ計算削除エラー:", err);
      return res.status(500).json({
        success: false,
        message: "ロイヤリティ計算の削除に失敗しました",
      });
    }

    console.log(`${year}年${month}月のロイヤリティ計算削除完了:`, this.changes);
    res.json({
      success: true,
      message: `${year}年${month}月のロイヤリティ計算を削除しました`,
      deleted: this.changes,
    });
  });
});

// 月次ロイヤリティレポート
router.get("/report", requireAdmin, async (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  try {
    // ロイヤリティ計算データを取得（Supabase）
    const { data: calculations, error: calculationError } = await db
      .from("royalty_calculations")
      .select("*")
      .eq("calculation_year", year);

    if (calculationError) {
      console.error("ロイヤリティレポート取得エラー:", calculationError);
      return res.status(500).render("error", {
        message: "ロイヤリティレポートの取得に失敗しました",
        session: req.session,
      });
    }

    // JavaScript側で月別集計を実行
    const monthlyData = {};
    (calculations || []).forEach((calc) => {
      const month = calc.calculation_month;
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
      monthlyData[month].total_sales += calc.monthly_sales || 0;
      monthlyData[month].total_royalty += calc.royalty_amount || 0;
      monthlyData[month].royalty_rates.push(calc.royalty_rate || 0);
    });

    // 平均ロイヤリティ率を計算
    const reportData = Object.values(monthlyData)
      .map((data) => ({
        ...data,
        avg_royalty_rate:
          data.royalty_rates.length > 0
            ? data.royalty_rates.reduce((sum, rate) => sum + rate, 0) /
              data.royalty_rates.length
            : 0,
      }))
      .sort((a, b) => a.calculation_month - b.calculation_month);

    console.log("ロイヤリティレポートデータ:", reportData.length, "月分");

    // 詳細データも取得（Supabase）
    await handleRoyaltyReportData(reportData, year, req, res);
  } catch (error) {
    console.error("ロイヤリティレポート処理エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
});

// ロイヤリティレポートデータ処理関数（Supabase対応）
async function handleRoyaltyReportData(reportData, year, req, res) {
  try {
    // 月別詳細データも取得（Supabase）
    const { data: detailCalculations, error: detailError } = await db
      .from("royalty_calculations")
      .select("*")
      .eq("calculation_year", year)
      .order("calculation_month");

    if (detailError) {
      console.error("ロイヤリティ詳細取得エラー:", detailError);
      return res.status(500).render("error", {
        message: "ロイヤリティ詳細の取得に失敗しました",
        session: req.session,
      });
    }

    // 店舗情報を取得
    let enrichedDetailData = detailCalculations || [];
    if (detailCalculations && detailCalculations.length > 0) {
      const storeIds = [...new Set(detailCalculations.map((d) => d.store_id))];
      const { data: stores, error: storeError } = await db
        .from("stores")
        .select("id, name")
        .in("id", storeIds);

      if (!storeError && stores) {
        const storeMap = {};
        stores.forEach((store) => {
          storeMap[store.id] = store.name;
        });

        enrichedDetailData = detailCalculations.map((detail) => ({
          ...detail,
          store_name: storeMap[detail.store_id] || `店舗ID ${detail.store_id}`,
        }));

        // 月、店舗名でソート
        enrichedDetailData.sort((a, b) => {
          if (a.calculation_month !== b.calculation_month) {
            return a.calculation_month - b.calculation_month;
          }
          return (a.store_name || "").localeCompare(b.store_name || "");
        });
      }
    }

    // 集計値を計算
    const totalSales = reportData.reduce(
      (sum, item) => sum + (item.total_sales || 0),
      0
    );
    const totalRoyalty = reportData.reduce(
      (sum, item) => sum + (item.total_royalty || 0),
      0
    );
    const totalStores = reportData.reduce(
      (sum, item) => sum + (item.store_count || 0),
      0
    );
    const avgRoyaltyRate =
      reportData.length > 0
        ? reportData.reduce(
            (sum, item) => sum + (item.avg_royalty_rate || 0),
            0
          ) / reportData.length
        : 0;

    res.render("royalty_report", {
      reportData: reportData || [],
      detailData: enrichedDetailData || [],
      monthlyData: reportData || [],
      currentYear: parseInt(year),
      start_year: parseInt(year),
      end_year: parseInt(year),
      start_month: 1,
      end_month: 12,
      totalSales: totalSales,
      totalRoyalty: totalRoyalty,
      totalStores: totalStores,
      avgRoyaltyRate: avgRoyaltyRate,
      session: req.session,
      title: "ロイヤリティレポート",
    });
  } catch (error) {
    console.error("ロイヤリティレポート詳細処理エラー:", error);
    res.status(500).render("error", {
      message: "システムエラーが発生しました",
      session: req.session,
    });
  }
}

// 請求書生成・ダウンロード
router.get("/invoice/:calculationId", requireAdmin, async (req, res) => {
  try {
    const calculationId = parseInt(req.params.calculationId);

    const { data: calcRows, error: calcErr } = await db
      .from("royalty_calculations")
      .select("*")
      .eq("id", calculationId)
      .limit(1);
    if (calcErr) {
      console.error("ロイヤリティ計算取得エラー:", calcErr);
      return res.status(500).render("error", {
        message: "ロイヤリティ計算の取得に失敗しました",
        session: req.session,
      });
    }
    const calculation = calcRows && calcRows[0];
    if (!calculation) {
      return res.status(404).render("error", {
        message: "ロイヤリティ計算が見つかりません",
        session: req.session,
      });
    }

    let store = null;
    if (calculation.store_id) {
      const { data: stores } = await db
        .from("stores")
        .select(
          "name, manager_name, business_address, main_phone, representative_email"
        )
        .eq("id", calculation.store_id)
        .limit(1);
      store = stores && stores[0] ? stores[0] : null;
    }

    const enriched = {
      ...calculation,
      store_name: store?.name || `店舗ID ${calculation.store_id}`,
      owner_name: store?.manager_name || null,
      store_address: store?.business_address || null,
      store_phone: store?.main_phone || null,
      store_email: store?.representative_email || null,
    };

    const pdfBuffer = await generateInvoicePDF(enriched);
    const fileName = `invoice_${enriched.store_name}_${
      enriched.calculation_year
    }_${String(enriched.calculation_month).padStart(2, "0")}.pdf`;

    try {
      const invoicesDir = path.join(__dirname, "../uploads/invoices");
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }
      const filePath = path.join(invoicesDir, fileName);
      fs.writeFileSync(filePath, pdfBuffer);
      await db
        .from("royalty_calculations")
        .update({ invoice_generated: true, invoice_path: filePath })
        .eq("id", calculationId);
    } catch (_) {
      await db
        .from("royalty_calculations")
        .update({ invoice_generated: true })
        .eq("id", calculationId);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("請求書生成ルートエラー:", error);
    return res.status(500).render("error", {
      message: "請求書の生成に失敗しました",
      session: req.session,
    });
  }
});

// 請求書PDF配信（インライン表示）
router.get("/invoice/:calculationId/pdf", requireAdmin, async (req, res) => {
  try {
    const calculationId = parseInt(req.params.calculationId);
    const { data: calcRows, error: calcErr } = await db
      .from("royalty_calculations")
      .select("*")
      .eq("id", calculationId)
      .limit(1);
    if (calcErr) {
      console.error("ロイヤリティ計算取得エラー:", calcErr);
      return res.status(500).render("error", {
        message: "ロイヤリティ計算の取得に失敗しました",
        session: req.session,
      });
    }
    const calculation = calcRows && calcRows[0];
    if (!calculation) {
      return res.status(404).render("error", {
        message: "ロイヤリティ計算が見つかりません",
        session: req.session,
      });
    }

    let store = null;
    if (calculation.store_id) {
      const { data: stores } = await db
        .from("stores")
        .select(
          "name, manager_name, business_address, main_phone, representative_email"
        )
        .eq("id", calculation.store_id)
        .limit(1);
      store = stores && stores[0] ? stores[0] : null;
    }

    const enriched = {
      ...calculation,
      store_name: store?.name || `店舗ID ${calculation.store_id}`,
      owner_name: store?.manager_name || null,
      store_address: store?.business_address || null,
      store_phone: store?.main_phone || null,
      store_email: store?.representative_email || null,
    };

    const pdfBuffer = await generateInvoicePDF(enriched);
    const fileName = `invoice_${enriched.store_name}_${
      enriched.calculation_year
    }_${String(enriched.calculation_month).padStart(2, "0")}.pdf`;

    await db
      .from("royalty_calculations")
      .update({ invoice_generated: true })
      .eq("id", calculationId);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(fileName)}"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("請求書PDF表示エラー:", error);
    return res.status(500).render("error", {
      message: "請求書の生成に失敗しました",
      session: req.session,
    });
  }
});

// 請求書閲覧ページ
router.get("/invoice/:calculationId/view", requireAdmin, async (req, res) => {
  try {
    const calculationId = parseInt(req.params.calculationId);
    const { data: calcRows, error: calcErr } = await db
      .from("royalty_calculations")
      .select("*")
      .eq("id", calculationId)
      .limit(1);
    if (calcErr) {
      console.error("ロイヤリティ計算取得エラー:", calcErr);
      return res.status(500).render("error", {
        message: "ロイヤリティ計算の取得に失敗しました",
        session: req.session,
      });
    }
    const calculation = calcRows && calcRows[0];
    if (!calculation) {
      return res.status(404).render("error", {
        message: "ロイヤリティ計算が見つかりません",
        session: req.session,
      });
    }

    let storeName = `店舗ID ${calculation.store_id}`;
    const { data: stores } = await db
      .from("stores")
      .select("name")
      .eq("id", calculation.store_id)
      .limit(1);
    if (stores && stores[0]) {
      storeName = stores[0].name;
    }

    res.render("royalty_invoice_view", {
      session: req.session,
      calculation: { ...calculation, store_name: storeName },
      title: `${storeName} - 請求書プレビュー`,
    });
  } catch (error) {
    console.error("請求書プレビューエラー:", error);
    return res.status(500).render("error", {
      message: "請求書プレビューの表示に失敗しました",
      session: req.session,
    });
  }
});

// 一括請求書生成
router.post("/invoices/bulk", requireAdmin, async (req, res) => {
  try {
    const { year, month } = req.body;
    if (!year || !month) {
      return res
        .status(400)
        .json({ success: false, message: "年と月を指定してください" });
    }

    const { data: calculations, error: calcErr } = await db
      .from("royalty_calculations")
      .select("*")
      .eq("calculation_year", parseInt(year))
      .eq("calculation_month", parseInt(month))
      .eq("invoice_generated", false)
      .order("store_id");
    if (calcErr) {
      console.error("ロイヤリティ計算取得エラー:", calcErr);
      return res.status(500).json({
        success: false,
        message: "ロイヤリティ計算の取得に失敗しました",
      });
    }

    if (!calculations || calculations.length === 0) {
      return res.json({
        success: false,
        message: "生成対象の請求書がありません",
      });
    }

    const storeIds = [...new Set(calculations.map((c) => c.store_id))];
    const { data: stores } = await db
      .from("stores")
      .select(
        "id, name, manager_name, business_address, main_phone, representative_email"
      )
      .in("id", storeIds);
    const storeMap = {};
    (stores || []).forEach((s) => (storeMap[s.id] = s));

    const invoicesDir = path.join(__dirname, "../uploads/invoices");
    try {
      if (!fs.existsSync(invoicesDir))
        fs.mkdirSync(invoicesDir, { recursive: true });
    } catch (_) {}

    let successCount = 0,
      errorCount = 0;
    for (const calc of calculations) {
      try {
        const s = storeMap[calc.store_id] || {};
        const enriched = {
          ...calc,
          store_name: s?.name || `店舗ID ${calc.store_id}`,
          owner_name: s?.manager_name || null,
          store_address: s?.business_address || null,
          store_phone: s?.main_phone || null,
          store_email: s?.representative_email || null,
        };
        const pdfBuffer = await generateInvoicePDF(enriched);
        const fileName = `invoice_${enriched.store_name}_${
          enriched.calculation_year
        }_${String(enriched.calculation_month).padStart(2, "0")}.pdf`;
        let filePath = null;
        try {
          filePath = path.join(invoicesDir, fileName);
          fs.writeFileSync(filePath, pdfBuffer);
        } catch (_) {}

        await db
          .from("royalty_calculations")
          .update({ invoice_generated: true, invoice_path: filePath })
          .eq("id", calc.id);
        successCount++;
      } catch (e) {
        console.error("請求書生成エラー:", e);
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `一括請求書生成完了: ${successCount}件成功, ${errorCount}件エラー`,
      generated: successCount,
      errors: errorCount,
    });
  } catch (error) {
    console.error("一括請求書生成エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "一括請求書生成に失敗しました" });
  }
});

// PDF生成関数
async function generateInvoicePDF(calculation) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks = [];
      doc.on("data", (d) => chunks.push(d));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      // 日本語フォント（ローカル or CDN）
      try {
        const fontBuf = await (async () => {
          const localFonts = [
            path.join(__dirname, "../public/fonts/NotoSansJP-Regular.ttf"),
            path.join(__dirname, "../public/fonts/NotoSansJP-VariableFont_wght.ttf"),
            path.join(__dirname, "../public/fonts/ipaexg.ttf"),
          ];
          for (const p of localFonts) {
            try {
              if (fs.existsSync(p)) return fs.readFileSync(p);
            } catch (_) {}
          }
          // ディレクトリ走査で任意のTTF/OTFを探す
          try {
            const dir = path.join(__dirname, "../public/fonts");
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir);
              const found = files.find((f) => /\.(ttf|otf)$/i.test(f));
              if (found) return fs.readFileSync(path.join(dir, found));
            }
          } catch (_) {}
          // フォールバック: CDNからダウンロード
          const url =
            "https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";
          return await new Promise((resolve) => {
            https
              .get(url, (res) => {
                if (res.statusCode !== 200) return resolve(null);
                const cs = [];
                res.on("data", (d) => cs.push(d));
                res.on("end", () => resolve(Buffer.concat(cs)));
              })
              .on("error", () => resolve(null));
          });
        })();
        if (fontBuf) {
          doc.registerFont("jp", fontBuf);
          doc.font("jp");
        }
      } catch (_) {}

      // タイトル
      doc
        .fontSize(20)
        .fillColor("#0b54ac")
        .text("ご請求書", { align: "center" });
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .fillColor("#333")
        .text("ロイヤリティ、システム使用料（今は1000円）", {
          align: "center",
        });

      doc.moveDown(1.2);
      const leftX = doc.x;
      const colW = 260;

      // 請求先
      doc.fontSize(12).fillColor("#0b54ac").text("請求先 (To)", leftX, doc.y);
      doc.fontSize(12).fillColor("#000").text(`${calculation.store_name} 御中`);
      if (calculation.owner_name) doc.text(`店長: ${calculation.owner_name}`);
      if (calculation.store_address) doc.text(calculation.store_address);
      if (calculation.store_phone) doc.text(`TEL: ${calculation.store_phone}`);
      if (calculation.store_email)
        doc.text(`Email: ${calculation.store_email}`);

      // 請求者
      const rightX = leftX + colW + 40;
      const currentY = doc.y - 80; // ざっくり並列に表示
      doc
        .fontSize(12)
        .fillColor("#0b54ac")
        .text("請求者 (From)", rightX, Math.max(120, currentY));
      doc
        .fontSize(12)
        .fillColor("#000")
        .text("FC本部")
        .text("〒000-0000")
        .text("東京都〇〇区〇〇 1-2-3")
        .text("TEL: 03-0000-0000")
        .text("Email: headquarters@fc-company.co.jp");

      doc.moveDown(1.2);

      // メタ情報
      const invoiceDate = new Date();
      const dueDate = new Date(
        invoiceDate.getFullYear(),
        invoiceDate.getMonth(),
        15
      );
      const pageNo = 1;
      const yyyy = invoiceDate.getFullYear();
      const mm = String(invoiceDate.getMonth() + 1).padStart(2, "0");
      const dd = String(invoiceDate.getDate()).padStart(2, "0");
      const invoiceNo = `${calculation.store_id}-${yyyy}${mm}${dd}${pageNo}`;

      doc.fontSize(11).fillColor("#0b54ac").text("請求情報", leftX);
      doc
        .fontSize(11)
        .fillColor("#000")
        .text(`件名: ロイヤリティ、システム使用料（今は1000円）`)
        .text(`請求No.: ${invoiceNo}`)
        .text(
          `請求日: ${invoiceDate.toLocaleDateString(
            "ja-JP"
          )} ${invoiceDate.toLocaleTimeString("ja-JP")}`
        )
        .text(
          `対象期間: ${calculation.calculation_year}年${calculation.calculation_month}月`
        )
        .text(`担当: 村上昌生`)
        .text(`お支払い期日: ${dueDate.toLocaleDateString("ja-JP")}`);

      doc.moveDown(0.8);

      // 明細テーブル（レイアウト補正）
      const tableTop = doc.y + 10;
      const col1 = leftX;
      const colW1 = 260;
      const colW2 = 90;
      const colW3 = 90;
      const colW4 = 120;
      const col2 = col1 + colW1;
      const col3 = col2 + colW2;
      const col4 = col3 + colW3;

      doc
        .fontSize(11)
        .fillColor("white")
        .rect(col1 - 2, tableTop - 14, col4 - col1 + 90, 18)
        .fill("#0066cc");
      doc.fillColor("white");
      doc.text("項目", col1, tableTop - 12, { width: colW1 });
      doc.text("売上金額", col2, tableTop - 12, {
        width: colW2,
        align: "right",
      });
      doc.text("率", col3, tableTop - 12, { width: colW3, align: "right" });
      doc.text("金額", col4, tableTop - 12, { width: colW4, align: "right" });

      const lineY1 = tableTop + 6;
      doc.fontSize(11).fillColor("#000");
      doc.text("フランチャイズロイヤリティ １式", col1, lineY1, {
        width: colW1,
      });
      doc.text(
        `¥${(calculation.monthly_sales || 0).toLocaleString()}`,
        col2,
        lineY1,
        { width: colW2, align: "right" }
      );
      doc.text(`${calculation.royalty_rate}%`, col3, lineY1, {
        width: colW3,
        align: "right",
      });
      doc.text(
        `¥${(calculation.royalty_amount || 0).toLocaleString()}`,
        col4,
        lineY1,
        { width: colW4, align: "right" }
      );

      const lineY2 = lineY1 + 18;
      doc.text("システム使用料 １ヶ月", col1, lineY2, { width: colW1 });
      doc.text("-", col2, lineY2, { width: colW2, align: "right" });
      doc.text("-", col3, lineY2, { width: colW3, align: "right" });
      doc.text("¥1,000", col4, lineY2, { width: colW4, align: "right" });

      const totalAmount = (calculation.royalty_amount || 0) + 1000;
      const totalBoxY = lineY2 + 28;
      doc.fontSize(12).fillColor("#0b54ac");
      doc.text("合計請求金額 (税込)", col3 - 30, totalBoxY, {
        width: colW3 + 30,
        align: "right",
      });
      doc.fontSize(16).fillColor("#0b54ac");
      doc.text(`¥${totalAmount.toLocaleString()}`, col4, totalBoxY, {
        width: colW4,
        align: "right",
      });

      doc.moveDown(2);
      doc
        .fontSize(11)
        .fillColor("#856404")
        .text("お支払いについて")
        .fillColor("#000")
        .text(`支払期限: ${dueDate.toLocaleDateString("ja-JP")}`)
        .text(
          "振込先: 〇〇銀行 〇〇支店 / 普通 1234567 / FC本部 (エフシーホンブ)"
        )
        .fontSize(10)
        .text("※振込手数料はご負担ください");

      doc.moveDown(1);
      doc
        .fontSize(10)
        .fillColor("#333")
        .text(
          "備考: 本請求書に関するお問い合わせは担当（村上昌生）までご連絡ください。お支払い期限までのご入金をお願いいたします。"
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// 請求書HTML生成関数
function generateInvoiceHTML(calculation) {
  const invoiceDate = new Date();
  // お支払い期日: 発行した月の15日まで
  const dueDate = new Date(
    invoiceDate.getFullYear(),
    invoiceDate.getMonth(),
    15
  );

  // 請求No. = [代理店ID]-[日付YYYYMMDD][ページ番号(基本1)]
  const pageNo = 1;
  const yyyy = invoiceDate.getFullYear();
  const mm = String(invoiceDate.getMonth() + 1).padStart(2, "0");
  const dd = String(invoiceDate.getDate()).padStart(2, "0");
  const invoiceNo = `${calculation.store_id}-${yyyy}${mm}${dd}${pageNo}`;

  // 件名・固定費用（システム使用料）
  const subject = "ロイヤリティ、システム使用料（今は1000円）";
  const systemFee = 1000;
  const totalAmount = (calculation.royalty_amount || 0) + systemFee;

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ロイヤリティ請求書</title>
    <style>
        body {
            font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', sans-serif;
            font-size: 12px;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            color: #333;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #0066cc;
            padding-bottom: 20px;
        }
        .header h1 {
            font-size: 24px;
            color: #0066cc;
            margin: 0;
        }
        .header p { margin: 6px 0 0; color: #555; }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        .company-info, .client-info {
            width: 45%;
        }
        .company-info h3, .client-info h3 {
            font-size: 14px;
            color: #0066cc;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
            margin-bottom: 10px;
        }
        .amount-summary {
            display: flex;
            justify-content: flex-end;
            margin: 10px 0 25px;
        }
        .total-box {
            min-width: 320px;
            background: #f8fbff;
            border: 2px solid #0066cc;
            border-radius: 6px;
            padding: 12px 16px;
        }
        .total-box .label { color: #1b5fb8; font-weight: 700; }
        .total-box .value { font-size: 20px; font-weight: 800; color: #0b54ac; }
        .invoice-details {
            background-color: #f8f9fa;
            padding: 15px;
            margin-bottom: 30px;
            border-radius: 5px;
        }
        .invoice-details table {
            width: 100%;
            border-collapse: collapse;
        }
        .invoice-details th, .invoice-details td {
            padding: 8px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        .invoice-details th {
            background-color: #0066cc;
            color: white;
            font-weight: bold;
        }
        .calculation-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        .calculation-table th, .calculation-table td {
            padding: 12px;
            text-align: right;
            border: 1px solid #ddd;
        }
        .calculation-table th {
            background-color: #0066cc;
            color: white;
            text-align: center;
        }
        .calculation-table .item-name {
            text-align: left;
        }
        .total-row {
            background-color: #f0f8ff;
            font-weight: bold;
            font-size: 14px;
        }
        .payment-info {
            background-color: #fff3cd;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #ffc107;
        }
        .payment-info h3 {
            color: #856404;
            margin-top: 0;
        }
        .remarks {
            background-color: #f8f9fa;
            padding: 12px 15px;
            border-radius: 5px;
            border: 1px solid #e2e6ea;
            margin-top: 16px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #666;
            border-top: 1px solid #ccc;
            padding-top: 20px;
        }
        .amount {
            font-size: 16px;
            font-weight: bold;
            color: #0066cc;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ご請求書</h1>
            <p class="mt-2">${subject}</p>
        </div>

        <div class="invoice-info">
            <div class="company-info">
                <h3>請求者 (From)</h3>
                <p><strong>FC本部</strong></p>
                <p>〒000-0000</p>
                <p>東京都〇〇区〇〇 1-2-3</p>
                <p>TEL: 03-0000-0000</p>
                <p>Email: headquarters@fc-company.co.jp</p>
            </div>
            <div class="client-info">
                <h3>請求先 (To)</h3>
                <p><strong>${calculation.store_name} 御中</strong></p>
                ${
                  calculation.owner_name
                    ? `<p>店長: ${calculation.owner_name}</p>`
                    : ""
                }
                ${
                  calculation.store_address
                    ? `<p>${calculation.store_address}</p>`
                    : ""
                }
                ${
                  calculation.store_phone
                    ? `<p>TEL: ${calculation.store_phone}</p>`
                    : ""
                }
                ${
                  calculation.store_email
                    ? `<p>Email: ${calculation.store_email}</p>`
                    : ""
                }
            </div>
        </div>

        <div class="amount-summary">
          <div class="total-box">
            <div class="label">ご請求金額合計</div>
            <div class="value">¥${totalAmount.toLocaleString()}</div>
          </div>
        </div>

        <div class="invoice-details">
            <table>
                <tr>
                    <th>件名</th>
                    <td colspan="3">${subject}</td>
                </tr>
                <tr>
                    <th>請求No.</th>
                    <td>${invoiceNo}</td>
                    <th>請求日</th>
                    <td>${invoiceDate.toLocaleDateString(
                      "ja-JP"
                    )} ${invoiceDate.toLocaleTimeString("ja-JP")}</td>
                </tr>
                <tr>
                    <th>対象期間</th>
                    <td>${calculation.calculation_year}年${
    calculation.calculation_month
  }月</td>
                    <th>担当</th>
                    <td>村上昌生</td>
                </tr>
                <tr>
                    <th>お支払い期日</th>
                    <td>${dueDate.toLocaleDateString("ja-JP")}</td>
                    <th></th>
                    <td></td>
                </tr>
            </table>
        </div>

        <table class="calculation-table">
            <thead>
                <tr>
                    <th>項目</th>
                    <th>売上金額</th>
                    <th>ロイヤリティ率</th>
                    <th>金額</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="item-name">フランチャイズロイヤリティ １式</td>
                    <td>¥${(
                      calculation.monthly_sales || 0
                    ).toLocaleString()}</td>
                    <td>${calculation.royalty_rate}%</td>
                    <td class="amount">¥${(
                      calculation.royalty_amount || 0
                    ).toLocaleString()}</td>
                </tr>
                <tr>
                    <td class="item-name">システム使用料 １ヶ月</td>
                    <td>-</td>
                    <td>-</td>
                    <td class="amount">¥${systemFee.toLocaleString()}</td>
                </tr>
                <tr class="total-row">
                    <td class="item-name">合計請求金額 (税込)</td>
                    <td colspan="2"></td>
                    <td class="amount">¥${totalAmount.toLocaleString()}</td>
                </tr>
            </tbody>
        </table>

        <div class="payment-info">
            <h3>お支払いについて</h3>
            <p><strong>支払期限:</strong> ${dueDate.toLocaleDateString(
              "ja-JP"
            )}</p>
            <p><strong>振込先:</strong></p>
            <p>〇〇銀行 〇〇支店</p>
            <p>普通預金 1234567</p>
            <p>FC本部 (エフシーホンブ)</p>
            <p><small>※振込手数料はご負担ください</small></p>
        </div>

        <div class="remarks">
            <strong>備考</strong>
            <p>本請求書に関するお問い合わせは担当（村上昌生）までご連絡ください。お支払い期限までのご入金をお願いいたします。</p>
        </div>

        <div class="footer">
            <p>この請求書に関するお問い合わせは、下記までご連絡ください。</p>
            <p>FC本部 経理部 TEL: 03-0000-0000 Email: accounting@fc-company.co.jp</p>
            <p>発行日: ${invoiceDate.toLocaleDateString("ja-JP")}</p>
        </div>
    </div>
</body>
</html>
  `;
}

module.exports = router;
