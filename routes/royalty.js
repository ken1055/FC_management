const express = require("express");
const router = express.Router();
const db = require("../db");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

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
    SELECT rs.id, rs.store_id, rs.rate as royalty_rate, rs.effective_date, rs.created_at, rs.updated_at, s.name as store_name
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
      SET store_id = ?, rate = ?, effective_date = ?
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
      INSERT INTO royalty_settings (store_id, rate, effective_date)
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

  const query = `
    SELECT rc.*, s.name as store_name
    FROM royalty_calculations rc
    LEFT JOIN stores s ON rc.store_id = s.id
    WHERE rc.calculation_year = ? AND rc.calculation_month = ?
    ORDER BY s.name
  `;

  db.all(query, [year, month], (err, calculations) => {
    if (err) {
      console.error("ロイヤリティ計算取得エラー:", err);
      return res.status(500).render("error", {
        message: "ロイヤリティ計算の取得に失敗しました",
        session: req.session,
      });
    }

    res.render("royalty_calculations", {
      calculations: calculations || [],
      currentYear: parseInt(year),
      currentMonth: parseInt(month),
      store_search: req.query.store_search || "",
      session: req.session,
      title: "ロイヤリティ計算結果",
    });
  });
});

// ロイヤリティ自動計算実行
router.post("/calculate", requireAdmin, (req, res) => {
  const { year, month } = req.body;

  if (!year || !month) {
    return res.status(400).json({
      success: false,
      message: "年と月を指定してください",
    });
  }

  // 指定月の売上データを取得（店舗名とロイヤリティ率も含める）
  const salesQuery = `
    SELECT 
      s.store_id, s.year, s.month, SUM(s.amount) as total_sales, 
      st.name as store_name, 
      COALESCE(rs.royalty_rate, st.royalty_rate) as royalty_rate
    FROM sales s
    LEFT JOIN stores st ON s.store_id = st.id
    LEFT JOIN (
      SELECT store_id, rate as royalty_rate, 
             ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY effective_date DESC) as rn
      FROM royalty_settings 
      WHERE effective_date <= DATE('${year}-${month}-01')
    ) rs ON st.id = rs.store_id AND rs.rn = 1
    WHERE s.year = ? AND s.month = ?
    GROUP BY s.store_id, s.year, s.month, st.name, COALESCE(rs.royalty_rate, st.royalty_rate)
  `;

  db.all(salesQuery, [year, month], async (err, salesData) => {
    if (err) {
      console.error("売上データ取得エラー:", err);
      return res.status(500).json({
        success: false,
        message: "売上データの取得に失敗しました",
      });
    }

    if (!salesData || salesData.length === 0) {
      return res.json({
        success: false,
        message: "指定された月の売上データが見つかりません",
      });
    }

    let processedCount = 0;
    let errorCount = 0;
    const totalStores = salesData.length;
    const calculationResults = [];

    // ロイヤリティ計算処理を実行する関数
    const processSaleWithRate = (sale, usedRate) => {
      const royaltyAmount = Math.round(sale.total_sales * (usedRate / 100));

      // ロイヤリティ計算結果を保存
      const insertQuery = `
        INSERT OR REPLACE INTO royalty_calculations 
        (store_id, calculation_year, calculation_month, monthly_sales, royalty_rate, royalty_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, 'calculated')
      `;

      db.run(
        insertQuery,
        [sale.store_id, year, month, sale.total_sales, usedRate, royaltyAmount],
        function (err) {
          if (err) {
            console.error("ロイヤリティ計算保存エラー:", err);
            errorCount++;
            calculationResults.push({
              store_id: sale.store_id,
              store_name: sale.store_name || `店舗ID ${sale.store_id}`,
              success: false,
              error: err.message,
            });
          } else {
            processedCount++;
            calculationResults.push({
              store_id: sale.store_id,
              store_name: sale.store_name || `店舗ID ${sale.store_id}`,
              success: true,
              sales: sale.total_sales,
              royalty_rate: usedRate,
              royalty_amount: royaltyAmount,
            });
            console.log(
              `店舗「${
                sale.store_name || sale.store_id
              }」 rate=${usedRate}% sales=¥${sale.total_sales.toLocaleString()} royalty=¥${royaltyAmount.toLocaleString()}`
            );
          }

          // 全ての処理が完了したかチェック
          if (calculationResults.length === totalStores) {
            const totalSales = calculationResults
              .filter((r) => r.success)
              .reduce((sum, r) => sum + r.sales, 0);
            const totalRoyalty = calculationResults
              .filter((r) => r.success)
              .reduce((sum, r) => sum + r.royalty_amount, 0);

            res.json({
              success: true,
              message: `ロイヤリティ計算完了: ${processedCount}件成功, ${errorCount}件エラー`,
              summary: {
                processed: processedCount,
                errors: errorCount,
                total_stores: totalStores,
                total_sales: totalSales,
                total_royalty: totalRoyalty,
                year: parseInt(year),
                month: parseInt(month),
              },
              details: calculationResults,
            });
          }
        }
      );
    };

    // 各店舗のロイヤリティを計算
    for (const sale of salesData) {
      let usedRate = 5.0; // デフォルトのフォールバック率

      // JOINで取れた率を優先（royalty_settingsまたはstoresテーブルから）
      const hasJoinRate =
        sale.royalty_rate != null &&
        sale.royalty_rate !== "" &&
        !isNaN(parseFloat(sale.royalty_rate));

      if (hasJoinRate) {
        usedRate = parseFloat(sale.royalty_rate);
        console.log(
          `店舗「${
            sale.store_name || sale.store_id
          }」: ロイヤリティ設定から取得した率 ${usedRate}% を使用`
        );
        processSaleWithRate(sale, usedRate);
      } else {
        // JOINで取得できなかった場合、ロイヤリティ設定テーブルから個別取得を試みる
        const settingsQuery = `
          SELECT rate as royalty_rate 
          FROM royalty_settings 
          WHERE store_id = ? AND effective_date <= DATE('${year}-${month}-01')
          ORDER BY effective_date DESC 
          LIMIT 1
        `;

        db.get(settingsQuery, [sale.store_id], (err, settingRow) => {
          if (err) {
            console.error(
              `店舗「${
                sale.store_name || sale.store_id
              }」のロイヤリティ設定取得エラー:`,
              err
            );
          }

          if (settingRow && settingRow.royalty_rate != null) {
            usedRate = parseFloat(settingRow.royalty_rate);
            console.log(
              `店舗「${
                sale.store_name || sale.store_id
              }」: ロイヤリティ設定テーブルから ${usedRate}% を取得`
            );
            processSaleWithRate(sale, usedRate);
          } else {
            // ロイヤリティ設定がない場合は店舗テーブルから再取得
            db.get(
              "SELECT royalty_rate FROM stores WHERE id = ?",
              [sale.store_id],
              (err, storeRow) => {
                if (err) {
                  console.error(
                    `店舗「${
                      sale.store_name || sale.store_id
                    }」のロイヤリティ率再取得エラー:`,
                    err
                  );
                } else {
                  const hasStoreRate =
                    storeRow &&
                    storeRow.royalty_rate != null &&
                    storeRow.royalty_rate !== "" &&
                    !isNaN(parseFloat(storeRow.royalty_rate));

                  if (hasStoreRate) {
                    usedRate = parseFloat(storeRow.royalty_rate);
                    console.log(
                      `店舗「${
                        sale.store_name || sale.store_id
                      }」: 店舗テーブルからロイヤリティ率 ${usedRate}% を取得`
                    );
                  } else {
                    console.log(
                      `店舗「${
                        sale.store_name || sale.store_id
                      }」: ロイヤリティ率が未設定のため、デフォルトの ${usedRate}% を使用`
                    );
                  }
                }
                processSaleWithRate(sale, usedRate);
              }
            );
          }
        });
      }
    }
  });
});

// ロイヤリティ計算結果削除
router.post("/calculations/delete", requireAdmin, (req, res) => {
  const { year, month } = req.body;

  if (!year || !month) {
    return res.status(400).json({
      success: false,
      message: "年と月を指定してください",
    });
  }

  const query = "DELETE FROM royalty_calculations WHERE year = ? AND month = ?";

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
router.get("/report", requireAdmin, (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  const query = `
    SELECT 
      rc.calculation_month,
      COUNT(rc.id) as store_count,
      SUM(rc.monthly_sales) as total_sales,
      SUM(rc.royalty_amount) as total_royalty,
      AVG(rc.royalty_rate) as avg_royalty_rate
    FROM royalty_calculations rc
    WHERE rc.calculation_year = ?
    GROUP BY rc.calculation_month
    ORDER BY rc.calculation_month
  `;

  db.all(query, [year], (err, reportData) => {
    if (err) {
      console.error("ロイヤリティレポート取得エラー:", err);
      return res.status(500).render("error", {
        message: "ロイヤリティレポートの取得に失敗しました",
        session: req.session,
      });
    }

    // 月別詳細データも取得
    const detailQuery = `
      SELECT 
        rc.*,
        s.name as store_name
      FROM royalty_calculations rc
      LEFT JOIN stores s ON rc.store_id = s.id
      WHERE rc.calculation_year = ?
      ORDER BY rc.calculation_month, s.name
    `;

    db.all(detailQuery, [year], (err, detailData) => {
      if (err) {
        console.error("ロイヤリティ詳細取得エラー:", err);
        return res.status(500).render("error", {
          message: "ロイヤリティ詳細の取得に失敗しました",
          session: req.session,
        });
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
        detailData: detailData || [],
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
    });
  });
});

// 請求書生成・ダウンロード
router.get("/invoice/:calculationId", requireAdmin, (req, res) => {
  const calculationId = req.params.calculationId;

  const query = `
    SELECT 
      rc.*,
      s.name as store_name,
      s.owner_name,
      s.address as store_address,
      s.phone as store_phone,
      s.email as store_email
    FROM royalty_calculations rc
    LEFT JOIN stores s ON rc.store_id = s.id
    WHERE rc.id = ?
  `;

  db.get(query, [calculationId], async (err, calculation) => {
    if (err) {
      console.error("ロイヤリティ計算取得エラー:", err);
      return res.status(500).render("error", {
        message: "ロイヤリティ計算の取得に失敗しました",
        session: req.session,
      });
    }

    if (!calculation) {
      return res.status(404).render("error", {
        message: "ロイヤリティ計算が見つかりません",
        session: req.session,
      });
    }

    try {
      const pdfBuffer = await generateInvoicePDF(calculation);
      const fileName = `invoice_${calculation.store_name}_${
        calculation.year
      }_${String(calculation.month).padStart(2, "0")}.pdf`;

      // PDFファイルを保存
      const invoicesDir = path.join(__dirname, "../uploads/invoices");
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      const filePath = path.join(invoicesDir, fileName);
      fs.writeFileSync(filePath, pdfBuffer);

      // データベースに請求書パスを記録
      const updateQuery = `
        UPDATE royalty_calculations 
        SET invoice_generated = TRUE, invoice_path = ?
        WHERE id = ?
      `;

      db.run(updateQuery, [filePath, calculationId], (updateErr) => {
        if (updateErr) {
          console.error("請求書パス更新エラー:", updateErr);
        }
      });

      // PDFをダウンロード
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileName)}"`
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error("PDF生成エラー:", error);
      return res.status(500).render("error", {
        message: "請求書の生成に失敗しました",
        session: req.session,
      });
    }
  });
});

// 一括請求書生成
router.post("/invoices/bulk", requireAdmin, (req, res) => {
  const { year, month } = req.body;

  if (!year || !month) {
    return res.status(400).json({
      success: false,
      message: "年と月を指定してください",
    });
  }

  const query = `
    SELECT 
      rc.*,
      s.name as store_name,
      s.owner_name,
      s.address as store_address,
      s.phone as store_phone,
      s.email as store_email
    FROM royalty_calculations rc
    LEFT JOIN stores s ON rc.store_id = s.id
    WHERE rc.calculation_year = ? AND rc.calculation_month = ? AND rc.invoice_generated = FALSE
    ORDER BY s.name
  `;

  db.all(query, [year, month], async (err, calculations) => {
    if (err) {
      console.error("ロイヤリティ計算取得エラー:", err);
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

    try {
      let successCount = 0;
      let errorCount = 0;

      const invoicesDir = path.join(__dirname, "../uploads/invoices");
      if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
      }

      // 各店舗の請求書を生成
      for (const calculation of calculations) {
        try {
          const pdfBuffer = await generateInvoicePDF(calculation);
          const fileName = `invoice_${calculation.store_name}_${
            calculation.year
          }_${String(calculation.month).padStart(2, "0")}.pdf`;
          const filePath = path.join(invoicesDir, fileName);

          fs.writeFileSync(filePath, pdfBuffer);

          // データベースを更新
          const updateQuery = `
            UPDATE royalty_calculations 
            SET invoice_generated = TRUE, invoice_path = ?
            WHERE id = ?
          `;

          await new Promise((resolve, reject) => {
            db.run(updateQuery, [filePath, calculation.id], (updateErr) => {
              if (updateErr) reject(updateErr);
              else resolve();
            });
          });

          successCount++;
          console.log(`請求書生成成功: ${calculation.store_name}`);
        } catch (error) {
          console.error(`請求書生成エラー (${calculation.store_name}):`, error);
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
      res.status(500).json({
        success: false,
        message: "一括請求書生成に失敗しました",
      });
    }
  });
});

// PDF生成関数
async function generateInvoicePDF(calculation) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // 請求書HTMLを生成
    const html = generateInvoiceHTML(calculation);

    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
      printBackground: true,
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

// 請求書HTML生成関数
function generateInvoiceHTML(calculation) {
  const invoiceDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // 30日後が支払期限

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
            <h1>ロイヤリティ請求書</h1>
            <p>Invoice for Franchise Royalty</p>
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
                <p><strong>${calculation.store_name}</strong></p>
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

        <div class="invoice-details">
            <table>
                <tr>
                    <th>請求書番号</th>
                    <td>INV-${calculation.year}${String(
    calculation.month
  ).padStart(2, "0")}-${String(calculation.store_id).padStart(3, "0")}</td>
                    <th>請求日</th>
                    <td>${invoiceDate.toLocaleDateString("ja-JP")}</td>
                </tr>
                <tr>
                    <th>対象期間</th>
                    <td>${calculation.year}年${calculation.month}月</td>
                    <th>支払期限</th>
                    <td>${dueDate.toLocaleDateString("ja-JP")}</td>
                </tr>
            </table>
        </div>

        <table class="calculation-table">
            <thead>
                <tr>
                    <th>項目</th>
                    <th>売上金額</th>
                    <th>ロイヤリティ率</th>
                    <th>ロイヤリティ金額</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="item-name">${calculation.year}年${
    calculation.month
  }月 月間売上ロイヤリティ</td>
                    <td>¥${calculation.monthly_sales.toLocaleString()}</td>
                    <td>${calculation.royalty_rate}%</td>
                    <td class="amount">¥${calculation.royalty_amount.toLocaleString()}</td>
                </tr>
                <tr class="total-row">
                    <td class="item-name">合計請求金額 (税込)</td>
                    <td colspan="2"></td>
                    <td class="amount">¥${calculation.royalty_amount.toLocaleString()}</td>
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
