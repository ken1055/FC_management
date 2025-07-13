const nodemailer = require("nodemailer");

// メール設定（環境変数から取得、なければデフォルト値）
const emailConfig = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || "", // 送信者のメールアドレス
    pass: process.env.SMTP_PASS || "", // アプリパスワード
  },
};

// 管理者メールアドレス（複数対応）
function getAdminEmails() {
  const adminEmailsEnv =
    process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "admin@example.com";

  // カンマ区切りで複数のメールアドレスを分割
  const emails = adminEmailsEnv
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  console.log("管理者メールアドレス:", emails);
  return emails;
}

// トランスポーター作成
let transporter = null;

function createTransporter() {
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.log("メール設定が不完全です。環境変数を確認してください。");
    return null;
  }

  try {
    transporter = nodemailer.createTransport(emailConfig);
    return transporter;
  } catch (error) {
    console.error("メールトランスポーター作成エラー:", error);
    return null;
  }
}

// 複数の管理者にメール送信
async function sendToMultipleAdmins(mailOptions) {
  const transport = createTransporter();
  if (!transport) {
    console.log("メール送信をスキップしました（設定不備）");
    return { success: false, errors: ["トランスポーター作成失敗"] };
  }

  const adminEmails = getAdminEmails();
  const results = [];
  const errors = [];

  for (const adminEmail of adminEmails) {
    try {
      const options = {
        ...mailOptions,
        to: adminEmail,
      };

      const info = await transport.sendMail(options);
      console.log(`メール送信成功 (${adminEmail}):`, info.messageId);
      results.push({
        email: adminEmail,
        success: true,
        messageId: info.messageId,
      });
    } catch (error) {
      console.error(`メール送信エラー (${adminEmail}):`, error);
      errors.push({ email: adminEmail, error: error.message });
      results.push({ email: adminEmail, success: false, error: error.message });
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors,
    totalSent: results.filter((r) => r.success).length,
    totalFailed: errors.length,
  };
}

// 代理店プロフィール登録通知メール
async function sendProfileRegistrationNotification(agency, user) {
  const mailOptions = {
    from: `"代理店管理システム" <${emailConfig.auth.user}>`,
    subject: "【代理店管理システム】新規代理店プロフィール登録通知",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066cc; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">
          新規代理店プロフィール登録通知
        </h2>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #28a745; margin-top: 0;">代理店情報</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; width: 30%;">代理店名:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.name || "未設定"
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">年齢:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.age || "未設定"
              }歳</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">住所:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.address || "未設定"
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">経験年数:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.experience_years || "未設定"
              }年</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">契約日:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.contract_date || "未設定"
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">活動開始日:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.start_date || "未設定"
              }</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #17a2b8; margin-top: 0;">商品情報</h3>
          <p><strong>商品の特徴:</strong></p>
          <p style="background-color: white; padding: 10px; border-radius: 3px;">
            ${agency.product_features || "未設定"}
          </p>
        </div>

        <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #856404; margin-top: 0;">アカウント情報</h3>
          <p><strong>登録ユーザー:</strong> ${user.email}</p>
          <p><strong>登録日時:</strong> ${new Date().toLocaleString(
            "ja-JP"
          )}</p>
          <p><strong>代理店ID:</strong> ${agency.id}</p>
        </div>

        <div style="background-color: #d1ecf1; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #0c5460; margin-top: 0;">次の操作</h3>
          <ul>
            <li>プロフィール内容を確認してください</li>
            <li>必要に応じてグループへの割り当てを行ってください</li>
            <li>商品資料の準備を検討してください</li>
          </ul>
        </div>

        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px; text-align: center;">
          このメールは代理店管理システムから自動送信されました。<br>
          返信は不要です。
        </p>
      </div>
    `,
  };

  const result = await sendToMultipleAdmins(mailOptions);

  if (result.success) {
    console.log(
      `プロフィール登録通知メール送信成功: ${result.totalSent}件送信`
    );
  } else {
    console.log(
      `プロフィール登録通知メール送信完了: ${result.totalSent}件成功, ${result.totalFailed}件失敗`
    );
  }

  return result.success;
}

// 代理店プロフィール更新通知メール
async function sendProfileUpdateNotification(agency, user) {
  const mailOptions = {
    from: `"代理店管理システム" <${emailConfig.auth.user}>`,
    subject: "【代理店管理システム】代理店プロフィール更新通知",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #fd7e14; border-bottom: 2px solid #fd7e14; padding-bottom: 10px;">
          代理店プロフィール更新通知
        </h2>
        
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #856404; margin-top: 0;">更新情報</h3>
          <p><strong>代理店名:</strong> ${agency.name}</p>
          <p><strong>代理店ID:</strong> ${agency.id}</p>
          <p><strong>更新者:</strong> ${user.email}</p>
          <p><strong>更新日時:</strong> ${new Date().toLocaleString(
            "ja-JP"
          )}</p>
        </div>

        <div style="background-color: #d1ecf1; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #0c5460; margin-top: 0;">推奨確認事項</h3>
          <ul>
            <li>更新された内容を確認してください</li>
            <li>変更が適切かどうか確認してください</li>
            <li>必要に応じて追加設定を行ってください</li>
          </ul>
        </div>

        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px; text-align: center;">
          このメールは代理店管理システムから自動送信されました。<br>
          返信は不要です。
        </p>
      </div>
    `,
  };

  const result = await sendToMultipleAdmins(mailOptions);

  if (result.success) {
    console.log(
      `プロフィール更新通知メール送信成功: ${result.totalSent}件送信`
    );
  } else {
    console.log(
      `プロフィール更新通知メール送信完了: ${result.totalSent}件成功, ${result.totalFailed}件失敗`
    );
  }

  return result.success;
}

// 管理者による代理店登録通知メール
async function sendAgencyRegistrationNotification(
  agency,
  adminUser,
  hasUserAccount = false
) {
  const mailOptions = {
    from: `"代理店管理システム" <${emailConfig.auth.user}>`,
    subject: "【代理店管理システム】新規代理店登録通知",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745; border-bottom: 2px solid #28a745; padding-bottom: 10px;">
          新規代理店登録通知
        </h2>
        
        <div style="background-color: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3 style="color: #155724; margin-top: 0;">✅ 代理店が正常に登録されました</h3>
          <p style="margin: 5px 0;"><strong>登録者:</strong> ${
            adminUser.email
          } (管理者)</p>
          <p style="margin: 5px 0;"><strong>登録日時:</strong> ${new Date().toLocaleString(
            "ja-JP"
          )}</p>
        </div>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #495057; margin-top: 0;">代理店情報</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; width: 30%;">代理店名:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.name || "未設定"
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">年齢:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.age || "未設定"
              }歳</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">住所:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.address || "未設定"
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">振込先:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.bank_info || "未設定"
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">経験年数:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.experience_years || "未設定"
              }年</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">契約日:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.contract_date || "未設定"
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">活動開始日:</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                agency.start_date || "未設定"
              }</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #495057; margin-top: 0;">商品情報</h3>
          <p><strong>商品の特徴:</strong></p>
          <p style="background-color: white; padding: 10px; border-radius: 3px; border: 1px solid #ddd;">
            ${agency.product_features || "未設定"}
          </p>
        </div>

        ${
          hasUserAccount
            ? `
        <div style="background-color: #cce5ff; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff;">
          <h3 style="color: #004085; margin-top: 0;">🔐 ユーザーアカウント情報</h3>
          <p><strong>ログイン用メールアドレス:</strong> ${
            agency.email || "未設定"
          }</p>
          <p><strong>初期パスワード:</strong> 管理者が設定したパスワード</p>
          <p style="color: #856404; background-color: #fff3cd; padding: 10px; border-radius: 3px; margin-top: 10px;">
            <strong>⚠️ 注意:</strong> 代理店にログイン情報を連絡してください
          </p>
        </div>
        `
            : `
        <div style="background-color: #f8d7da; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc3545;">
          <h3 style="color: #721c24; margin-top: 0;">ℹ️ アカウント情報</h3>
          <p>この代理店にはユーザーアカウントが作成されていません。</p>
          <p>必要に応じて、後でアカウントを作成してください。</p>
        </div>
        `
        }

        <div style="background-color: #d1ecf1; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #0c5460; margin-top: 0;">次の操作</h3>
          <ul>
            <li>代理店情報の内容を確認してください</li>
            <li>必要に応じてグループへの割り当てを行ってください</li>
            <li>商品資料の準備を検討してください</li>
            ${
              hasUserAccount
                ? "<li>代理店にログイン情報を連絡してください</li>"
                : "<li>必要に応じてユーザーアカウントを作成してください</li>"
            }
          </ul>
        </div>

        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #6c757d; font-size: 14px;">
            <strong>代理店ID:</strong> ${agency.id}<br>
            <strong>システムURL:</strong> <a href="${
              process.env.APP_URL ||
              "https://agencymanagement-production.up.railway.app/"
            }" target="_blank">代理店管理システム</a>
          </p>
        </div>

        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px; text-align: center;">
          このメールは代理店管理システムから自動送信されました。<br>
          返信は不要です。
        </p>
      </div>
    `,
  };

  const result = await sendToMultipleAdmins(mailOptions);

  if (result.success) {
    console.log(`代理店登録通知メール送信成功: ${result.totalSent}件送信`);
  } else {
    console.log(
      `代理店登録通知メール送信完了: ${result.totalSent}件成功, ${result.totalFailed}件失敗`
    );
  }

  return result.success;
}

module.exports = {
  sendProfileRegistrationNotification,
  sendProfileUpdateNotification,
  sendAgencyRegistrationNotification, // 新規追加
  getAdminEmails, // 管理者メール一覧取得（テスト用）
};
