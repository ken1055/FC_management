const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./agency.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('executive', 'admin', 'agency')) NOT NULL,
      agency_id INTEGER,
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS agencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER,
      address TEXT,
      bank_info TEXT,
      experience_years INTEGER,
      contract_date DATE,
      start_date DATE,
      product_features TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS agency_products (
      agency_id INTEGER,
      product_name TEXT,
      PRIMARY KEY (agency_id, product_name),
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS product_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER,
      product_name TEXT,
      file_path TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER,
      year INTEGER,
      month INTEGER,
      amount INTEGER,
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS group_agency (
      group_id INTEGER,
      agency_id INTEGER,
      PRIMARY KEY (group_id, agency_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS group_admin (
      group_id INTEGER,
      admin_id INTEGER,
      PRIMARY KEY (group_id, admin_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (admin_id) REFERENCES users(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      originalname TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      description TEXT,
      agency_id INTEGER,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    )
  `);
});

module.exports = db;
