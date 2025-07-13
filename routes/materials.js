const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const iconv = require("iconv-lite");

const uploadDir = path.join(__dirname, "../uploads/materials");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ファイル名のエンコーディング処理関数
function sanitizeFilename(filename) {
  // 日本語文字を含むファイル名を適切にエンコード
  try {
    let decoded = filename;

    // 複数のエンコーディングを試行
    const encodings = ["utf8", "latin1", "iso-8859-1", "cp1252"];

    for (const encoding of encodings) {
      try {
        // Buffer.from でバイト配列に変換し、iconv-liteで適切にデコード
        const buffer = Buffer.from(filename, encoding);
        const utf8String = iconv.decode(buffer, "utf8");

        // 日本語文字が含まれているかチェック
        if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(utf8String)) {
          decoded = utf8String;
          break;
        }
      } catch (e) {
        // このエンコーディングでは失敗、次を試行
        continue;
      }
    }

    // latin1からutf8への変換を試行（一般的なケース）
    if (decoded === filename) {
      try {
        const buffer = Buffer.from(filename, "latin1");
        decoded = buffer.toString("utf8");
      } catch (e) {
        console.warn("ファイル名エンコーディング変換失敗:", e.message);
      }
    }

    // ファイル名に使用できない文字を置換
    const sanitized = decoded
      .replace(/[<>:"/\\|?*]/g, "_") // 不正文字を_に置換
      .replace(/\s+/g, "_") // 連続する空白を_に置換
      .replace(/\u0000/g, "") // NULL文字を削除
      .substring(0, 200); // ファイル名の長さを制限

    console.log("ファイル名変換:", {
      original: filename,
      decoded: decoded,
      sanitized: sanitized,
    });

    return sanitized;
  } catch (error) {
    console.error("ファイル名エンコーディングエラー:", error);
    // エラーの場合は元のファイル名を使用
    return filename.replace(/[<>:"/\\|?*]/g, "_").substring(0, 200);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("アップロード先ディレクトリ:", uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 元のファイル名を適切にエンコード
    const originalName = sanitizeFilename(file.originalname);
    const timestamp = Date.now();

    // 拡張子を取得
    const ext = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, ext);

    // タイムスタンプ + 元のファイル名 + 拡張子
    const filename = `${timestamp}-${nameWithoutExt}${ext}`;

    console.log("元のファイル名:", file.originalname);
    console.log("エンコード後ファイル名:", originalName);
    console.log("生成されたファイル名:", filename);

    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB制限
  },
  fileFilter: (req, file, cb) => {
    console.log("ファイルフィルタ:", file);
    // 許可されたファイル形式
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.error("許可されていないファイル形式:", file.mimetype);
      cb(new Error("許可されていないファイル形式です"), false);
    }
  },
});

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send("権限がありません");
    }
    next();
  };
}

// 資料一覧画面（代理店別）
router.get("/:agency_id", (req, res) => {
  const agency_id = req.params.agency_id;

  // 代理店は自分の資料のみ、管理者は指定された代理店の資料を閲覧可能
  if (req.session.user.role === "agency") {
    if (!req.session.user.agency_id) {
      return res.status(400).send("代理店IDが設定されていません");
    }
    if (req.session.user.agency_id !== Number(agency_id)) {
      return res.status(403).send("権限がありません");
    }
  }

  db.all(
    "SELECT * FROM materials WHERE agency_id = ? ORDER BY uploaded_at DESC",
    [agency_id],
    (err, files) => {
      if (err) return res.status(500).send("DBエラー");

      // 代理店名を取得
      db.get(
        "SELECT name FROM agencies WHERE id = ?",
        [agency_id],
        (err, agency) => {
          if (err) return res.status(500).send("DBエラー");
          res.render("materials_list", {
            files,
            agency_id,
            agency_name: agency ? agency.name : "不明",
            session: req.session,
            title: "商品資料格納庫",
          });
        }
      );
    }
  );
});

// 資料一覧画面（全体 - 管理者のみ）
router.get("/", requireRole(["admin"]), (req, res) => {
  db.all(
    "SELECT m.*, a.name as agency_name FROM materials m LEFT JOIN agencies a ON m.agency_id = a.id ORDER BY m.uploaded_at DESC",
    [],
    (err, files) => {
      if (err) return res.status(500).send("DBエラー");
      res.render("materials_list", {
        files,
        agency_id: null,
        agency_name: "全体",
        session: req.session,
        title: "商品資料格納庫",
      });
    }
  );
});

// アップロード（管理者のみ）
router.post(
  "/upload/:agency_id",
  requireRole(["admin"]),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("Multerエラー:", err);
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .send("ファイルサイズが大きすぎます（最大50MB）");
        }
        return res
          .status(400)
          .send("ファイルアップロードエラー: " + err.message);
      }
      next();
    });
  },
  (req, res) => {
    console.log("=== ファイルアップロード開始 ===");
    console.log("ユーザー:", req.session.user);
    console.log("代理店ID:", req.params.agency_id);
    console.log("ファイル情報:", req.file);
    console.log("説明:", req.body.description);

    if (!req.file) {
      console.error("ファイルが選択されていません");
      return res.status(400).send("ファイルがありません");
    }

    const agency_id = req.params.agency_id;
    const description = req.body.description || "";

    // 元のファイル名を適切にエンコード
    const originalName = sanitizeFilename(req.file.originalname);

    console.log("データベースに保存開始...");
    db.run(
      "INSERT INTO materials (filename, originalname, mimetype, description, agency_id) VALUES (?, ?, ?, ?, ?)",
      [
        req.file.filename,
        originalName, // エンコード済みのファイル名を使用
        req.file.mimetype,
        description,
        agency_id,
      ],
      function (err) {
        if (err) {
          console.error("データベース保存エラー:", err);
          return res.status(500).send("DBエラー: " + err.message);
        }

        console.log("ファイルアップロード成功:", {
          id: this.lastID,
          filename: req.file.filename,
          originalname: originalName, // エンコード済みのファイル名を表示
          agency_id: agency_id,
        });

        res.redirect(`/materials/${agency_id}`);
      }
    );
  }
);

// ファイル説明更新（管理者のみ）
router.post("/update-description/:id", requireRole(["admin"]), (req, res) => {
  const fileId = req.params.id;
  const description = req.body.description || "";

  db.get(
    "SELECT agency_id FROM materials WHERE id = ?",
    [fileId],
    (err, file) => {
      if (err || !file) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      db.run(
        "UPDATE materials SET description = ? WHERE id = ?",
        [description, fileId],
        function (err) {
          if (err) {
            console.error("説明更新エラー:", err);
            return res.status(500).json({ error: "更新に失敗しました" });
          }

          res.json({ success: true, message: "説明を更新しました" });
        }
      );
    }
  );
});

// ファイル削除（管理者のみ）
router.post("/delete/:id", requireRole(["admin"]), (req, res) => {
  const fileId = req.params.id;

  db.get("SELECT * FROM materials WHERE id = ?", [fileId], (err, file) => {
    if (err || !file) {
      return res.status(404).send("ファイルが見つかりません");
    }

    // ファイルシステムからファイルを削除
    const filePath = path.join(uploadDir, file.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (deleteErr) {
        console.error("ファイル削除エラー:", deleteErr);
      }
    }

    // データベースからレコードを削除
    db.run("DELETE FROM materials WHERE id = ?", [fileId], function (err) {
      if (err) {
        console.error("DB削除エラー:", err);
        return res.status(500).send("削除に失敗しました");
      }

      // 元の画面にリダイレクト
      const agencyId = file.agency_id;
      res.redirect(`/materials/${agencyId}`);
    });
  });
});

// ダウンロード
router.get("/download/:id", (req, res) => {
  db.get(
    "SELECT * FROM materials WHERE id = ?",
    [req.params.id],
    (err, file) => {
      if (err || !file) return res.status(404).send("ファイルが見つかりません");

      // 代理店は自分の資料のみ、管理者は全て閲覧可能
      if (req.session.user.role === "agency") {
        if (!req.session.user.agency_id) {
          return res.status(400).send("代理店IDが設定されていません");
        }
        if (req.session.user.agency_id !== file.agency_id) {
          return res.status(403).send("権限がありません");
        }
      }

      const filePath = path.join(uploadDir, file.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).send("ファイルが見つかりません");
      }

      res.download(filePath, file.originalname);
    }
  );
});

// 画像プレビュー用
router.get("/preview/:id", (req, res) => {
  db.get(
    "SELECT * FROM materials WHERE id = ?",
    [req.params.id],
    (err, file) => {
      if (err || !file) return res.status(404).send("ファイルが見つかりません");

      // 代理店は自分の資料のみ、管理者は全て閲覧可能
      if (req.session.user.role === "agency") {
        if (!req.session.user.agency_id) {
          return res.status(400).send("代理店IDが設定されていません");
        }
        if (req.session.user.agency_id !== file.agency_id) {
          return res.status(403).send("権限がありません");
        }
      }

      // 画像ファイルかどうかチェック
      const imageTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (!imageTypes.includes(file.mimetype)) {
        return res.status(400).send("画像ファイルではありません");
      }

      const filePath = path.join(uploadDir, file.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).send("ファイルが見つかりません");
      }

      // 画像ファイルを直接配信
      res.sendFile(filePath);
    }
  );
});

// ファイル情報取得API
router.get("/info/:id", (req, res) => {
  db.get(
    "SELECT * FROM materials WHERE id = ?",
    [req.params.id],
    (err, file) => {
      if (err || !file)
        return res.status(404).json({ error: "ファイルが見つかりません" });

      // 代理店は自分の資料のみ、管理者は全て閲覧可能
      if (req.session.user.role === "agency") {
        if (!req.session.user.agency_id) {
          return res
            .status(400)
            .json({ error: "代理店IDが設定されていません" });
        }
        if (req.session.user.agency_id !== file.agency_id) {
          return res.status(403).json({ error: "権限がありません" });
        }
      }

      const filePath = path.join(uploadDir, file.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "ファイルが見つかりません" });
      }

      // ファイルサイズを取得
      const stats = fs.statSync(filePath);
      const isImage = file.mimetype.startsWith("image/");

      res.json({
        id: file.id,
        originalname: file.originalname,
        mimetype: file.mimetype,
        description: file.description || "",
        size: stats.size,
        uploadedAt: file.uploaded_at,
        isImage: isImage,
        previewUrl: isImage ? `/materials/preview/${file.id}` : null,
      });
    }
  );
});

module.exports = router;
