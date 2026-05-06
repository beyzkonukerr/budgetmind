const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(projectRoot, "budgetmind.db");
const backupDir = path.join(projectRoot, "backups");

if (!fs.existsSync(dbPath)) {
  console.error("Veritabani dosyasi bulunamadi:", dbPath);
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `budgetmind-${ts}.db`);
fs.copyFileSync(dbPath, target);
console.log("Yedek olusturuldu:", target);
