const express = require("express");
const router = express.Router();
const db = require("../db");

// 役員・管理者アカウント追加
router.post("/", (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.status(400).send("必須項目が不足しています");

  db.get(
    "SELECT COUNT(*) as cnt FROM users WHERE role = ?",
    [role],
    (err, row) => {
      if (err) return res.status(500).send("DBエラー");
      if (role === "executive" && row.cnt >= 1)
        return res.status(400).send("役員アカウントは1つまで");
      if (role === "admin" && row.cnt >= 4)
        return res.status(400).send("管理者アカウントは4つまで");

      db.run(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, password, role],
        function (err) {
          if (err) return res.status(500).send("DBエラーまたは重複");
          res.send("アカウント追加完了");
        }
      );
    }
  );
});

// アカウント削除
router.delete("/:id", (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).send("DBエラー");
    res.send("削除完了");
  });
});

module.exports = router;
