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

// 削除（管理者のみ）
router.post("/delete/:id", requireRole(["admin"]), (req, res) => {
  db.get("SELECT * FROM materials WHERE id=?", [req.params.id], (err, file) => {
    if (err || !file) return res.status(404).send("ファイルがありません");
    fs.unlinkSync(path.join(uploadDir, file.filename));
    db.run("DELETE FROM materials WHERE id=?", [req.params.id], function (err) {
      if (err) return res.status(500).send("DBエラー");
      // agency_idがnullの場合は全体ページにリダイレクト
      if (file.agency_id) {
        res.redirect(`/materials/${file.agency_id}`);
      } else {
        res.redirect("/materials");
      }
    });
  });
});

// ダウンロード
router.get("/download/:id", (req, res) => {
  db.get("SELECT * FROM materials WHERE id=?", [req.params.id], (err, file) => {
    if (err || !file) return res.status(404).send("ファイルがありません");

    // 代理店は自分の資料のみダウンロード可能
    if (req.session.user.role === "agency") {
      if (!req.session.user.agency_id) {
        return res.status(400).send("代理店IDが設定されていません");
      }
      if (req.session.user.agency_id !== file.agency_id) {
        return res.status(403).send("権限がありません");
      }
    }

    const filePath = path.join(uploadDir, file.filename);
    res.download(filePath, file.originalname);
  });
});

module.exports = router;
