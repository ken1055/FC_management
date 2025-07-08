require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const engine = require("ejs-mate");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.engine("ejs", engine);

app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/auth/login");
  }
  if (req.session.user.role === "admin") {
    return res.render("admin_index", {
      session: req.session,
      title: "管理者ダッシュボード",
    });
  }
  res.render("index", { session: req.session, title: "代理店ダッシュボード" });
});

// ルーティング
app.use("/agencies", require("./routes/agencies"));
app.use("/", express.static(path.join(__dirname, "views")));
app.use("/api/users", require("./routes/users"));
app.use("/sales", require("./routes/sales"));
app.use("/auth", require("./routes/auth"));
app.use("/materials", require("./routes/materials"));
app.use("/groups", require("./routes/groups"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ログイン必須ミドルウェア
app.use((req, res, next) => {
  if (!req.session.user && !req.path.startsWith("/auth/login")) {
    return res.redirect("/auth/login");
  }
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
