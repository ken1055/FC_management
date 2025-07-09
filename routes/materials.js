const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../uploads/materials");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

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
  upload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).send("ファイルがありません");
    const agency_id = req.params.agency_id;

    db.run(
      "INSERT INTO materials (filename, originalname, mimetype, agency_id) VALUES (?, ?, ?, ?)",
      [req.file.filename, req.file.originalname, req.file.mimetype, agency_id],
      function (err) {
        if (err) return res.status(500).send("DBエラー");
        res.redirect(`/materials/${agency_id}`);
      }
    );
  }
);

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
        size: stats.size,
        uploadedAt: file.uploaded_at,
        isImage: isImage,
        previewUrl: isImage ? `/materials/preview/${file.id}` : null,
      });
    }
  );
});

module.exports = router;
