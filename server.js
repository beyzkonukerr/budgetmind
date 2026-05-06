const path = require("path");
const fs = require("fs");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const analytics = require("./analytics");
const {
  normalizeInput,
  calculateScore,
  generateFeedback,
  clamp01
} = require("./lib/scoring.cjs");

/** submissions tablosu risk_level değerleri (filtre sorgusu) */
const RISK_LEVEL_FILTERS = ["Yuksek Risk", "Orta Risk", "Dusuk Risk"];

const app = express();
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const JWT_SECRET = process.env.JWT_SECRET || "budgetmind-super-secret";
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const loginThrottle = new Map();
const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 8);

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

const dbFilePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, "budgetmind.db");
try {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
} catch (_e) {
  /* dizin zaten var veya kök yol */
}
const db = new Database(dbFilePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    email TEXT,
    income REAL NOT NULL,
    expense REAL NOT NULL,
    tracking REAL NOT NULL,
    budget_plan REAL NOT NULL,
    saving REAL NOT NULL,
    s11 REAL NOT NULL,
    s12 REAL NOT NULL,
    s13 REAL NOT NULL,
    s14 REAL NOT NULL,
    stress_raw REAL NOT NULL,
    stress_norm REAL NOT NULL,
    behavior_score REAL NOT NULL,
    budget_gap REAL NOT NULL,
    budget_pressure REAL NOT NULL,
    fsi REAL NOT NULL,
    risk_level TEXT NOT NULL
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    actor_user_id INTEGER,
    actor_username TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    detail TEXT
  );
`);
bootstrapAdminUser();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "budgetmind-api" });
});

app.get("/api/meta/model", requireRole(["admin", "analyst", "viewer"]), (_req, res) => {
  res.json({
    model: "BudgetMind FSI v1",
    equation: "FSI = 0.55*stressNorm + 0.25*budgetPressure + 0.20*behaviorRisk",
    thresholds: {
      low: "<0.40",
      medium: "0.40-0.59",
      high: ">=0.60"
    },
    scoring: {
      behavior: "Evet=1, Bazen=0.5, Hayir=0",
      stressNorm: "(S11+S12+S13+S14 - 4) / 16"
    }
  });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "Kullanici adi ve sifre zorunlu." });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ message: "Kullanici adi gecersiz formatta." });
  }
  const loginKey = buildLoginKey(username, req.ip);
  const throttle = loginThrottle.get(loginKey);
  if (throttle && throttle.lockedUntil && Date.now() < throttle.lockedUntil) {
    const left = Math.ceil((throttle.lockedUntil - Date.now()) / 60000);
    return res
      .status(429)
      .json({ message: `Cok fazla hatali giris. ${left} dk sonra tekrar deneyin.` });
  }

  const user = db
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    registerFailedLogin(loginKey);
    logAudit({
      actorUsername: String(username || ""),
      action: "LOGIN_FAILED",
      targetType: "auth",
      detail: `ip=${req.ip}`
    });
    return res.status(401).json({ message: "Kullanici adi veya sifre hatali." });
  }
  loginThrottle.delete(loginKey);

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
  res.setHeader(
    "Set-Cookie",
    `bm_admin_token=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax`
  );
  logAudit({
    actorUserId: user.id,
    actorUsername: user.username,
    action: "LOGIN_SUCCESS",
    targetType: "auth",
    detail: `role=${user.role};ip=${req.ip}`
  });
  return res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ user: req.adminUser });
});

app.post("/api/admin/logout", (_req, res) => {
  const user = getAuthUser(_req);
  res.setHeader(
    "Set-Cookie",
    "bm_admin_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
  );
  if (user) {
    logAudit({
      actorUserId: user.userId,
      actorUsername: user.username,
      action: "LOGOUT",
      targetType: "auth"
    });
  }
  return res.json({ ok: true });
});

app.post("/api/admin/change-password", requireRole(["admin", "analyst", "viewer"]), (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: "Eski ve yeni sifre zorunlu." });
  }
  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) {
    return res.status(400).json({ message: pwErr });
  }
  const current = db
    .prepare("SELECT id, username, password_hash FROM users WHERE id = ?")
    .get(req.adminUser.userId);
  if (!current || !verifyPassword(oldPassword, current.password_hash)) {
    return res.status(400).json({ message: "Eski sifre hatali." });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(newPassword),
    req.adminUser.userId
  );
  logAudit({
    actorUserId: req.adminUser.userId,
    actorUsername: req.adminUser.username,
    action: "PASSWORD_CHANGED_SELF",
    targetType: "user",
    targetId: String(req.adminUser.userId)
  });
  return res.json({ ok: true });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const input = normalizeInput(req.body);
    const result = calculateScore(input);

    const insert = db.prepare(`
      INSERT INTO submissions (
        created_at, email, income, expense, tracking, budget_plan, saving,
        s11, s12, s13, s14, stress_raw, stress_norm, behavior_score,
        budget_gap, budget_pressure, fsi, risk_level
      ) VALUES (
        @created_at, @email, @income, @expense, @tracking, @budget_plan, @saving,
        @s11, @s12, @s13, @s14, @stress_raw, @stress_norm, @behavior_score,
        @budget_gap, @budget_pressure, @fsi, @risk_level
      )
    `);

    const dbRow = {
      created_at: new Date().toISOString(),
      email: input.email || null,
      income: input.income,
      expense: input.expense,
      tracking: input.tracking,
      budget_plan: input.budgetPlan,
      saving: input.saving,
      s11: input.s11,
      s12: input.s12,
      s13: input.s13,
      s14: input.s14,
      stress_raw: result.stressRaw,
      stress_norm: result.stressNorm,
      behavior_score: result.behaviorScore,
      budget_gap: result.budgetGap,
      budget_pressure: result.budgetPressure,
      fsi: result.weightedFSI,
      risk_level: result.level
    };

    const info = insert.run(dbRow);
    const feedbackList = generateFeedback(result);

    if (input.sendEmail && input.email) {
      await trySendEmail(input.email, result, feedbackList);
    }

    res.json({
      submissionId: info.lastInsertRowid,
      result,
      feedbackList
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Analiz islemi basarisiz oldu."
    });
  }
});

app.get("/api/admin/summary", requireRole(["admin", "analyst", "viewer"]), (_req, res) => {
  const filter = buildSubmissionFilter(_req.query);
  const rawLimit = parseInt(_req.query.limit, 10);
  const latestLimit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, rawLimit))
    : 10;

  const totals = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        AVG(fsi) AS avg_fsi,
        AVG(stress_norm) AS avg_stress,
        SUM(CASE WHEN risk_level = 'Yuksek Risk' THEN 1 ELSE 0 END) AS high_count,
        SUM(CASE WHEN risk_level = 'Orta Risk' THEN 1 ELSE 0 END) AS medium_count,
        SUM(CASE WHEN risk_level = 'Dusuk Risk' THEN 1 ELSE 0 END) AS low_count,
        SUM(CASE WHEN fsi < 0.20 THEN 1 ELSE 0 END) AS h0,
        SUM(CASE WHEN fsi >= 0.20 AND fsi < 0.40 THEN 1 ELSE 0 END) AS h1,
        SUM(CASE WHEN fsi >= 0.40 AND fsi < 0.60 THEN 1 ELSE 0 END) AS h2,
        SUM(CASE WHEN fsi >= 0.60 AND fsi < 0.80 THEN 1 ELSE 0 END) AS h3,
        SUM(CASE WHEN fsi >= 0.80 THEN 1 ELSE 0 END) AS h4
      FROM submissions
      ${filter.whereSql}
    `)
    .get(filter.params);

  const latest = db
    .prepare(`
      SELECT id, created_at, email, fsi, risk_level
      FROM submissions
      ${filter.whereSql}
      ORDER BY id DESC
      LIMIT @latestLimit
    `)
    .all({ ...filter.params, latestLimit });

  const normalizedTotals = {
    total: totals.total || 0,
    avg_fsi: totals.avg_fsi || 0,
    avg_stress: totals.avg_stress || 0,
    high_count: totals.high_count || 0,
    medium_count: totals.medium_count || 0,
    low_count: totals.low_count || 0
  };

  const fsiHistogram = {
    labels: [
      "0 – 0,20",
      "0,20 – 0,40",
      "0,40 – 0,60",
      "0,60 – 0,80",
      "0,80 – 1,00"
    ],
    counts: [
      totals.h0 || 0,
      totals.h1 || 0,
      totals.h2 || 0,
      totals.h3 || 0,
      totals.h4 || 0
    ]
  };

  const riskParam = _req.query.riskLevel || _req.query.risk || "";
  const appliedRisk =
    riskParam && RISK_LEVEL_FILTERS.includes(riskParam) ? riskParam : "all";

  res.json({
    totals: normalizedTotals,
    latest,
    latestLimit,
    fsiHistogram,
    appliedFilter: {
      start: _req.query.start || null,
      end: _req.query.end || null,
      riskLevel: appliedRisk
    }
  });
});

app.get("/api/admin/timeseries", requireRole(["admin", "analyst", "viewer"]), (req, res) => {
  const filter = buildSubmissionFilter(req.query);
  const gb = String(req.query.groupBy || "day").toLowerCase();
  let groupBy = "day";
  let periodExpr = "strftime('%Y-%m-%d', created_at)";
  if (gb === "week") {
    groupBy = "week";
    periodExpr = "strftime('%Y-W%W', created_at)";
  } else if (gb === "month") {
    groupBy = "month";
    periodExpr = "strftime('%Y-%m', created_at)";
  }

  const rows = db
    .prepare(
      `
      SELECT
        ${periodExpr} AS period,
        COUNT(*) AS total,
        AVG(fsi) AS avg_fsi
      FROM submissions
      ${filter.whereSql}
      GROUP BY period
      ORDER BY period ASC
    `
    )
    .all(filter.params);

  res.json({ groupBy, rows });
});

app.get("/api/admin/export.csv", requireRole(["admin", "analyst"]), (_req, res) => {
  const filter = buildSubmissionFilter(_req.query);
  const rows = db
    .prepare(`
      SELECT id, created_at, email, income, expense, budget_gap, fsi, risk_level
      FROM submissions
      ${filter.whereSql}
      ORDER BY id DESC
    `)
    .all(filter.params);

  const header = [
    "id",
    "created_at",
    "email",
    "income",
    "expense",
    "budget_gap",
    "fsi",
    "risk_level"
  ];

  const csvLines = [header.join(",")];
  for (const row of rows) {
    const values = header.map((key) => csvEscape(row[key]));
    csvLines.push(values.join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="budgetmind-export-${Date.now()}.csv"`
  );
  res.send(csvLines.join("\n"));
});

app.get("/api/admin/export.pdf", requireRole(["admin", "analyst"]), (_req, res) => {
  const filter = buildSubmissionFilter(_req.query);
  const rawLimit = parseInt(_req.query.limit, 10);
  const latestLimit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, rawLimit))
    : 10;

  const summary = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        AVG(fsi) AS avg_fsi,
        AVG(stress_norm) AS avg_stress,
        SUM(CASE WHEN risk_level = 'Yuksek Risk' THEN 1 ELSE 0 END) AS high_count,
        SUM(CASE WHEN risk_level = 'Orta Risk' THEN 1 ELSE 0 END) AS medium_count,
        SUM(CASE WHEN risk_level = 'Dusuk Risk' THEN 1 ELSE 0 END) AS low_count,
        SUM(CASE WHEN fsi < 0.20 THEN 1 ELSE 0 END) AS h0,
        SUM(CASE WHEN fsi >= 0.20 AND fsi < 0.40 THEN 1 ELSE 0 END) AS h1,
        SUM(CASE WHEN fsi >= 0.40 AND fsi < 0.60 THEN 1 ELSE 0 END) AS h2,
        SUM(CASE WHEN fsi >= 0.60 AND fsi < 0.80 THEN 1 ELSE 0 END) AS h3,
        SUM(CASE WHEN fsi >= 0.80 THEN 1 ELSE 0 END) AS h4
      FROM submissions
      ${filter.whereSql}
    `)
    .get(filter.params);

  const latest = db
    .prepare(`
      SELECT id, created_at, email, fsi, risk_level
      FROM submissions
      ${filter.whereSql}
      ORDER BY id DESC
      LIMIT @latestLimit
    `)
    .all({ ...filter.params, latestLimit });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="budgetmind-report-${Date.now()}.pdf"`
  );

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text("BudgetMind Admin Raporu");
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Rapor Tarihi: ${new Date().toLocaleString("tr-TR")}`);
  const riskParam = _req.query.riskLevel || _req.query.risk || "";
  const appliedRisk =
    riskParam && RISK_LEVEL_FILTERS.includes(riskParam) ? riskParam : "tum riskler";
  const dateLine =
    _req.query.start || _req.query.end
      ? `Tarih: ${_req.query.start || "-"} / ${_req.query.end || "-"}`
      : "Tarih: tum kayitlar";
  doc.text(`${dateLine} | Risk filtresi: ${appliedRisk}`);
  doc.moveDown();
  doc.fontSize(13).text("Ozet");
  doc.fontSize(11).text(`Toplam Analiz: ${summary.total || 0}`);
  doc.text(`Ortalama FSI: ${(((summary.avg_fsi || 0) * 100).toFixed(1))}%`);
  doc.text(
    `Ortalama Stres: ${(((summary.avg_stress || 0) * 100).toFixed(1))}%`
  );
  doc.text(
    `Risk Dagilimi: Yuksek ${summary.high_count || 0}, Orta ${summary.medium_count || 0}, Dusuk ${summary.low_count || 0}`
  );
  doc.text(
    `FSI aralik dagilimi (adet): 0-0.20=${summary.h0 || 0}, 0.20-0.40=${summary.h1 || 0}, 0.40-0.60=${summary.h2 || 0}, 0.60-0.80=${summary.h3 || 0}, 0.80-1=${summary.h4 || 0}`
  );
  doc.moveDown();
  doc.fontSize(13).text(`Son ${latestLimit} Kayit`);
  doc.moveDown(0.5);
  doc.fontSize(10);
  for (const row of latest) {
    doc.text(
      `#${row.id} | ${new Date(row.created_at).toLocaleString("tr-TR")} | ${row.email || "-"} | FSI ${(row.fsi * 100).toFixed(1)}% | ${row.risk_level}`
    );
  }

  doc.end();
});

app.get("/api/admin/users", requireRole(["admin"]), (_req, res) => {
  const users = db
    .prepare(
      "SELECT id, username, role, created_at FROM users ORDER BY id ASC"
    )
    .all();
  res.json({ users });
});

app.post("/api/admin/users", requireRole(["admin"]), (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) {
    return res.status(400).json({ message: "username, password ve role zorunlu." });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ message: "Kullanici adi gecersiz formatta." });
  }
  const pwErr = validatePasswordStrength(password);
  if (pwErr) {
    return res.status(400).json({ message: pwErr });
  }
  if (!["admin", "analyst", "viewer"].includes(role)) {
    return res.status(400).json({ message: "Gecersiz rol." });
  }
  const hash = hashPassword(password);
  try {
    const info = db
      .prepare(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(username.trim(), hash, role, new Date().toISOString());
    logAudit({
      actorUserId: req.adminUser.userId,
      actorUsername: req.adminUser.username,
      action: "USER_CREATED",
      targetType: "user",
      targetId: String(info.lastInsertRowid),
      detail: `username=${username.trim()};role=${role}`
    });
    res.json({ id: info.lastInsertRowid });
  } catch (_e) {
    res.status(400).json({ message: "Kullanici olusturulamadi. Kullanici adi benzersiz olmali." });
  }
});

app.patch("/api/admin/users/:id", requireRole(["admin"]), (req, res) => {
  const id = Number(req.params.id);
  const { role, password } = req.body || {};
  const existing = db.prepare("SELECT id, username FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Kullanici bulunamadi." });

  if (existing.username === "admin" && role && role !== "admin") {
    return res.status(400).json({ message: "Varsayilan admin rolu degistirilemez." });
  }

  if (role) {
    if (!["admin", "analyst", "viewer"].includes(role)) {
      return res.status(400).json({ message: "Gecersiz rol." });
    }
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  }
  if (password) {
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      return res.status(400).json({ message: pwErr });
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), id);
  }
  logAudit({
    actorUserId: req.adminUser.userId,
    actorUsername: req.adminUser.username,
    action: "USER_UPDATED",
    targetType: "user",
    targetId: String(id),
    detail: `role=${role || "-"};passwordUpdated=${Boolean(password)}`
  });
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", requireRole(["admin"]), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id, username FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Kullanici bulunamadi." });
  if (existing.username === "admin") {
    return res.status(400).json({ message: "Varsayilan admin silinemez." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  logAudit({
    actorUserId: req.adminUser.userId,
    actorUsername: req.adminUser.username,
    action: "USER_DELETED",
    targetType: "user",
    targetId: String(id),
    detail: `username=${existing.username}`
  });
  res.json({ ok: true });
});

app.get("/api/admin/audit-logs", requireRole(["admin"]), (req, res) => {
  const pageSize = Math.min(200, Math.max(1, Number(req.query.limit || 20)));
  const page = Math.max(1, Number(req.query.page || 1));
  const offset = (page - 1) * pageSize;
  const action = req.query.action ? String(req.query.action).trim() : "";
  const search = req.query.q ? String(req.query.q).trim() : "";
  const criticalOnly = String(req.query.critical || "").toLowerCase() === "true";
  const filter = buildDateFilter(req.query);
  const where = [];
  const params = { ...filter.params, limit: pageSize, offset };
  if (filter.whereSql) {
    where.push(filter.whereSql.replace(/^WHERE\s+/i, ""));
  }
  if (action) {
    where.push("action = @auditAction");
    params.auditAction = action;
  }
  if (search) {
    where.push(
      "(IFNULL(actor_username, '') LIKE @q OR IFNULL(target_type, '') LIKE @q OR IFNULL(target_id, '') LIKE @q OR IFNULL(detail, '') LIKE @q)"
    );
    params.q = `%${search}%`;
  }
  if (criticalOnly) {
    where.push("action IN ('LOGIN_FAILED','USER_DELETED')");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db
    .prepare(
      `
      SELECT COUNT(*) AS total
      FROM audit_logs
      ${whereSql}
    `
    )
    .get(params);

  const rows = db
    .prepare(
      `
      SELECT id, created_at, actor_user_id, actor_username, action, target_type, target_id, detail
      FROM audit_logs
      ${whereSql}
      ORDER BY id DESC
      LIMIT @limit OFFSET @offset
    `
    )
    .all(params);
  res.json({
    rows,
    pagination: {
      total: totalRow.total || 0,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil((totalRow.total || 0) / pageSize))
    }
  });
});

app.get("/api/admin/audit-logs/export.csv", requireRole(["admin"]), (req, res) => {
  const action = req.query.action ? String(req.query.action).trim() : "";
  const search = req.query.q ? String(req.query.q).trim() : "";
  const criticalOnly = String(req.query.critical || "").toLowerCase() === "true";
  const filter = buildDateFilter(req.query);
  const where = [];
  const params = { ...filter.params };
  if (filter.whereSql) {
    where.push(filter.whereSql.replace(/^WHERE\s+/i, ""));
  }
  if (action) {
    where.push("action = @auditAction");
    params.auditAction = action;
  }
  if (search) {
    where.push(
      "(IFNULL(actor_username, '') LIKE @q OR IFNULL(target_type, '') LIKE @q OR IFNULL(target_id, '') LIKE @q OR IFNULL(detail, '') LIKE @q)"
    );
    params.q = `%${search}%`;
  }
  if (criticalOnly) {
    where.push("action IN ('LOGIN_FAILED','USER_DELETED')");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
      SELECT id, created_at, actor_user_id, actor_username, action, target_type, target_id, detail
      FROM audit_logs
      ${whereSql}
      ORDER BY id DESC
    `
    )
    .all(params);

  const header = [
    "id",
    "created_at",
    "actor_user_id",
    "actor_username",
    "action",
    "target_type",
    "target_id",
    "detail"
  ];
  const csvLines = [header.join(",")];
  for (const row of rows) {
    csvLines.push(header.map((key) => csvEscape(row[key])).join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="budgetmind-audit-${Date.now()}.csv"`
  );
  res.send(csvLines.join("\n"));
});

function loadSubmissionRows(query) {
  const filter = buildSubmissionFilter(query);
  return db
    .prepare(
      `
      SELECT
        income, expense, tracking, budget_plan, saving,
        s11, s12, s13, s14, stress_raw, stress_norm, behavior_score,
        budget_gap, budget_pressure, fsi, risk_level
      FROM submissions
      ${filter.whereSql}
      ORDER BY id ASC
    `
    )
    .all(filter.params);
}

app.get(
  "/api/admin/analytics/descriptive",
  requireRole(["admin", "analyst", "viewer"]),
  (req, res) => {
    const rows = loadSubmissionRows(req.query);
    res.json({
      n: rows.length,
      stats: analytics.descriptiveStats(rows)
    });
  }
);

app.get(
  "/api/admin/analytics/correlation",
  requireRole(["admin", "analyst", "viewer"]),
  (req, res) => {
    const rows = loadSubmissionRows(req.query);
    if (rows.length < 3) {
      return res.status(400).json({
        message: "Korelasyon icin en az 3 gozlem gerekir.",
        n: rows.length
      });
    }
    res.json({
      n: rows.length,
      pearson: analytics.correlationMatrix(rows)
    });
  }
);

app.get(
  "/api/admin/analytics/regression",
  requireRole(["admin", "analyst", "viewer"]),
  (req, res) => {
    const rows = loadSubmissionRows(req.query);
    res.json({
      n: rows.length,
      multipleLinear: analytics.multipleRegressionFsi(rows),
      simpleVsFsi: analytics.simpleRegressionsOnFsi(rows),
      fsiByRisk: analytics.fsiByRiskLevel(rows)
    });
  }
);

app.get(
  "/api/admin/analytics/full",
  requireRole(["admin", "analyst", "viewer"]),
  (req, res) => {
    const rows = loadSubmissionRows(req.query);
    const payload = {
      n: rows.length,
      stats: analytics.descriptiveStats(rows),
      pearson:
        rows.length >= 3
          ? analytics.correlationMatrix(rows)
          : null,
      regression: {
        multipleLinear: analytics.multipleRegressionFsi(rows),
        simpleVsFsi: analytics.simpleRegressionsOnFsi(rows),
        fsiByRisk: analytics.fsiByRiskLevel(rows)
      }
    };
    if (rows.length < 3) {
      payload.warning = "Korelasyon matrisi icin en az 3 gozlem gerekir.";
    }
    res.json(payload);
  }
);

app.get(
  "/api/admin/analytics/insights",
  requireRole(["admin", "analyst", "viewer"]),
  (req, res) => {
    const rows = loadSubmissionRows(req.query);
    const windowSize = Math.min(30, Math.max(3, Number(req.query.window || 7)));
    const payload = buildInsights(rows, windowSize);
    res.json(payload);
  }
);

app.post(
  "/api/admin/analytics/simulate",
  requireRole(["admin", "analyst", "viewer"]),
  (req, res) => {
    const rows = loadSubmissionRows(req.query);
    const windowSize = Math.min(30, Math.max(3, Number(req.query.window || 7)));
    const scenario = parseScenario(req.body);
    const baseline = buildInsights(rows, windowSize);
    const simulatedRows = applyScenarioToRows(rows, scenario);
    const simulated = buildInsights(simulatedRows, windowSize);

    const bScore = baseline.actionScore ?? 0;
    const sScore = simulated.actionScore ?? 0;
    const bk = baseline.kpis || {};
    const sk = simulated.kpis || {};

    res.json({
      n: rows.length,
      windowSize,
      scenario: scenario.normalized,
      methodology:
        "Stres ve butce baskisi yuzde carpani ile olceklendirilir (0-1 araliginda); davranis skoruna mutlak puan eklenir; FSI = 0,55*stres + 0,25*butce baskisi + 0,20*(1-davranis) ile yeniden hesaplanir; risk sinifi model esikleriyle guncellenir.",
      baseline: {
        actionScore: bScore,
        avgFsi: bk.avgFsi,
        highRiskRate: bk.highRiskRate,
        avgBudgetPressure: bk.avgBudgetPressure,
        avgStressNorm: bk.avgStressNorm,
        avgBehaviorScore: bk.avgBehaviorScore,
        trendDirection: baseline.trend ? baseline.trend.direction : "flat"
      },
      simulated: {
        actionScore: sScore,
        avgFsi: sk.avgFsi,
        highRiskRate: sk.highRiskRate,
        avgBudgetPressure: sk.avgBudgetPressure,
        avgStressNorm: sk.avgStressNorm,
        avgBehaviorScore: sk.avgBehaviorScore,
        trendDirection: simulated.trend ? simulated.trend.direction : "flat"
      },
      delta: {
        actionScore: sScore - bScore,
        avgFsi: (sk.avgFsi ?? 0) - (bk.avgFsi ?? 0),
        highRiskRate: (sk.highRiskRate ?? 0) - (bk.highRiskRate ?? 0),
        avgBudgetPressure: (sk.avgBudgetPressure ?? 0) - (bk.avgBudgetPressure ?? 0)
      }
    });
  }
);

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "API endpoint bulunamadi." });
});

app.listen(PORT, () => {
  console.log(`BudgetMind server running on http://localhost:${PORT}`);
});

async function trySendEmail(email, result, feedbackList) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);

  if (!user || !pass) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const body = `
Merhaba,

BudgetMind analiz sonucunuz hazir:
- FSI: ${(result.weightedFSI * 100).toFixed(1)}%
- Risk: ${result.level}
- Butce Farki: ${result.budgetGap.toFixed(0)} TL

Oneriler:
${feedbackList.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`;

  await transporter.sendMail({
    from: `"BudgetMind" <${user}>`,
    to: email,
    subject: "BudgetMind Finansal Analiz Sonucunuz",
    text: body
  });
}

function clampScenarioNum(v, min, max, def) {
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

function parseScenario(body) {
  const b = body || {};
  const bpPct = clampScenarioNum(Number(b.budgetPressurePct), -50, 50, 0);
  const snPct = clampScenarioNum(Number(b.stressNormPct), -50, 50, 0);
  const behPts = clampScenarioNum(Number(b.behaviorScorePts), -0.5, 0.5, 0);
  return {
    normalized: {
      budgetPressurePct: bpPct,
      stressNormPct: snPct,
      behaviorScorePts: behPts
    },
    bpMult: 1 + bpPct / 100,
    stressMult: 1 + snPct / 100,
    behaviorAdd: behPts
  };
}

function fsiFromComponents(stressNorm, budgetPressure, behaviorScore) {
  const sn = clamp01(stressNorm);
  const bp = clamp01(budgetPressure);
  const beh = clamp01(behaviorScore);
  const behaviorRisk = 1 - beh;
  return 0.55 * sn + 0.25 * bp + 0.2 * behaviorRisk;
}

function riskLevelFromFsi(fsi) {
  if (fsi >= 0.6) return "Yuksek Risk";
  if (fsi >= 0.4) return "Orta Risk";
  return "Dusuk Risk";
}

function applyScenarioToRows(rows, scenario) {
  return rows.map((r) => {
    const stress = clamp01(Number(r.stress_norm) * scenario.stressMult);
    const bp = clamp01(Number(r.budget_pressure) * scenario.bpMult);
    const behavior = clamp01(Number(r.behavior_score) + scenario.behaviorAdd);
    const fsi = fsiFromComponents(stress, bp, behavior);
    return {
      ...r,
      stress_norm: stress,
      budget_pressure: bp,
      behavior_score: behavior,
      fsi,
      risk_level: riskLevelFromFsi(fsi)
    };
  });
}

function requireAdmin(req, res, next) {
  const user = getAuthUser(req);
  if (user) {
    req.adminUser = user;
    return next();
  }
  const headerPassword = req.headers["x-admin-password"];
  if (headerPassword && headerPassword === ADMIN_PASSWORD) {
    req.adminUser = { userId: 0, username: "legacy-admin", role: "admin" };
    return next();
  }
  return res.status(401).json({ message: "Admin oturumu gerekli." });
}

function requireRole(roles) {
  return (req, res, next) => {
    requireAdmin(req, res, () => {
      if (!roles.includes(req.adminUser.role)) {
        return res.status(403).json({ message: "Bu islem icin yetkiniz yok." });
      }
      return next();
    });
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '""';
  }
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function buildDateFilter(query) {
  const where = [];
  const params = {};
  if (query.start) {
    where.push("created_at >= @startDate");
    params.startDate = `${query.start}T00:00:00.000Z`;
  }
  if (query.end) {
    where.push("created_at <= @endDate");
    params.endDate = `${query.end}T23:59:59.999Z`;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
}

function buildSubmissionFilter(query) {
  const datePart = buildDateFilter(query);
  const clauses = [];
  const params = { ...datePart.params };
  if (datePart.whereSql) {
    clauses.push(datePart.whereSql.replace(/^WHERE\s+/i, ""));
  }
  const risk = query.riskLevel || query.risk;
  if (risk && risk !== "all" && RISK_LEVEL_FILTERS.includes(risk)) {
    clauses.push("risk_level = @riskFilter");
    params.riskFilter = risk;
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { whereSql, params };
}

function buildInsights(rows, windowSize) {
  const n = rows.length;
  if (n === 0) {
    return {
      n: 0,
      windowSize,
      actionScore: 0,
      warnings: ["Filtreye uygun kayit bulunamadi."],
      recommendations: ["Tarih araligini genisletin veya risk filtresini kaldirin."],
      kpis: {},
      segmentComparison: [],
      trend: {},
      roadmap: []
    };
  }

  const fsis = rows.map((r) => Number(r.fsi)).filter(Number.isFinite);
  const stressNorms = rows.map((r) => Number(r.stress_norm)).filter(Number.isFinite);
  const pressures = rows.map((r) => Number(r.budget_pressure)).filter(Number.isFinite);
  const behavior = rows.map((r) => Number(r.behavior_score)).filter(Number.isFinite);

  const riskCounts = rows.reduce(
    (acc, r) => {
      if (r.risk_level === "Yuksek Risk") acc.high += 1;
      else if (r.risk_level === "Orta Risk") acc.medium += 1;
      else if (r.risk_level === "Dusuk Risk") acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const kpis = {
    avgFsi: safeMean(fsis),
    medianFsi: safeMedian(fsis),
    stdFsi: safeStd(fsis),
    avgStressNorm: safeMean(stressNorms),
    avgBudgetPressure: safeMean(pressures),
    avgBehaviorScore: safeMean(behavior),
    highRiskRate: n ? riskCounts.high / n : 0,
    mediumRiskRate: n ? riskCounts.medium / n : 0,
    lowRiskRate: n ? riskCounts.low / n : 0,
    riskCounts
  };

  const segmentComparison = buildRiskSegments(rows);
  const trend = buildTrendSignal(rows, windowSize);

  const warnings = [];
  const recommendations = [];
  const roadmap = [];
  let actionScore = 0;

  if (kpis.highRiskRate >= 0.35) {
    warnings.push("Yuksek risk orani kritik seviyede.");
    recommendations.push(
      "Yuksek risk grubuna odakli hedefli danismanlik akisi (tasarruf disiplini + stres azaltma) planlayin."
    );
    actionScore += 40;
    roadmap.push({
      priority: "red",
      area: "Risk yonetimi",
      action:
        "Yuksek riskli segment icin 2 haftalik mudahale plani (butce koorlugu + harcama limitleri) devreye alin.",
      owner: "Analitik + Danismanlik",
      horizon: "0-30 gun"
    });
  }
  if (kpis.avgBudgetPressure >= 0.2) {
    warnings.push("Butce baskisi ortalamasi yuksek.");
    recommendations.push(
      "Gelir-gider dengesini iyilestirmek icin sabit gider optimizasyon kampanyasi baslatin."
    );
    actionScore += 25;
    roadmap.push({
      priority: "red",
      area: "Butce optimizasyonu",
      action:
        "Sabit gider kalemlerine yonelik azaltim programi ve aylik hedef takibi tasarlayin.",
      owner: "Finans operasyon",
      horizon: "0-30 gun"
    });
  }
  if (kpis.avgBehaviorScore <= 0.55) {
    warnings.push("Davranis disiplini skoru dusuk.");
    recommendations.push(
      "Harcama takibi ve butce plani aliskanligi icin mikro-ogrenme ve haftalik hatirlatici modulu ekleyin."
    );
    actionScore += 20;
    roadmap.push({
      priority: "yellow",
      area: "Davranis gelistirme",
      action:
        "Kullanicilara haftalik izleme gorevleri ve takip bazli odul mekanizmasi tanimlayin.",
      owner: "Urun + Egitim",
      horizon: "30-60 gun"
    });
  }
  if (trend.direction === "up") {
    warnings.push("Son donemde FSI yukselme egiliminde.");
    recommendations.push(
      "Erken uyari eşiğini dusurup son donem artisi gosteren kullanicilar icin proaktif bildirim kurgulayin."
    );
    actionScore += 15;
    roadmap.push({
      priority: "yellow",
      area: "Erken uyari",
      action:
        "Trend tabanli alarm kuralini devreye alin (7 kayitta +%10 artis).",
      owner: "Veri ekibi",
      horizon: "30-60 gun"
    });
  } else if (trend.direction === "down") {
    recommendations.push(
      "FSI trendi iyilesiyor; bu donemde etkili olan uygulamalari standart operasyon proseduru haline getirin."
    );
    roadmap.push({
      priority: "green",
      area: "Standardizasyon",
      action:
        "Iyilesme saglayan uygulamalari SOP dokumanina cevirip tum segmentlere yayinlayin.",
      owner: "Operasyon yonetimi",
      horizon: "60-90 gun"
    });
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Mevcut dagilim dengeli gorunuyor; aylik izleme raporu ile metriklerin stabilitesini koruyun."
    );
    roadmap.push({
      priority: "green",
      area: "Surdurulebilirlik",
      action:
        "Aylik KPI izleme ritmini koruyun ve sapma esiklerini yeniden kalibre edin.",
      owner: "Yonetim",
      horizon: "60-90 gun"
    });
  }

  actionScore = Math.min(100, actionScore);

  return {
    n,
    windowSize,
    actionScore,
    kpis,
    trend,
    segmentComparison,
    warnings,
    recommendations,
    roadmap
  };
}

function buildRiskSegments(rows) {
  const keys = ["Yuksek Risk", "Orta Risk", "Dusuk Risk"];
  const out = [];
  for (const k of keys) {
    const grp = rows.filter((r) => r.risk_level === k);
    const fsis = grp.map((r) => Number(r.fsi)).filter(Number.isFinite);
    const stress = grp.map((r) => Number(r.stress_norm)).filter(Number.isFinite);
    const pressure = grp.map((r) => Number(r.budget_pressure)).filter(Number.isFinite);
    const behavior = grp.map((r) => Number(r.behavior_score)).filter(Number.isFinite);
    out.push({
      riskLevel: k,
      n: grp.length,
      avgFsi: safeMean(fsis),
      avgStressNorm: safeMean(stress),
      avgBudgetPressure: safeMean(pressure),
      avgBehaviorScore: safeMean(behavior)
    });
  }
  return out;
}

function buildTrendSignal(rows, windowSize) {
  if (rows.length < 2) {
    return {
      direction: "flat",
      recentAvg: null,
      baselineAvg: null,
      delta: null,
      deltaPct: null,
      volatility: null
    };
  }
  const fsis = rows.map((r) => Number(r.fsi)).filter(Number.isFinite);
  if (fsis.length < 2) {
    return {
      direction: "flat",
      recentAvg: null,
      baselineAvg: null,
      delta: null,
      deltaPct: null,
      volatility: null
    };
  }

  const recent = fsis.slice(-windowSize);
  const baseline = fsis.slice(0, Math.max(1, fsis.length - recent.length));
  const recentAvg = safeMean(recent);
  const baselineAvg = baseline.length ? safeMean(baseline) : safeMean(fsis);
  const delta = Number.isFinite(recentAvg) && Number.isFinite(baselineAvg) ? recentAvg - baselineAvg : null;
  const deltaPct =
    Number.isFinite(delta) && Number.isFinite(baselineAvg) && baselineAvg !== 0
      ? delta / baselineAvg
      : null;
  const volatility = safeStd(fsis);

  let direction = "flat";
  if (Number.isFinite(delta)) {
    if (delta >= 0.03) direction = "up";
    else if (delta <= -0.03) direction = "down";
  }

  return {
    direction,
    recentAvg,
    baselineAvg,
    delta,
    deltaPct,
    volatility
  };
}

function safeMean(values) {
  if (!values.length) return null;
  return values.reduce((sum, x) => sum + x, 0) / values.length;
}

function safeMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[m - 1] + sorted[m]) / 2;
  }
  return sorted[m];
}

function safeStd(values) {
  if (values.length < 2) return values.length === 1 ? 0 : null;
  const mean = safeMean(values);
  const variance =
    values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function getCookie(req, key) {
  const cookie = req.headers.cookie;
  if (!cookie) return "";
  const parts = cookie.split(";").map((x) => x.trim());
  const found = parts.find((x) => x.startsWith(`${key}=`));
  if (!found) return "";
  return decodeURIComponent(found.slice(key.length + 1));
}

function getAuthUser(req) {
  const token = getCookie(req, "bm_admin_token");
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role
    };
  } catch (_e) {
    return null;
  }
}

function bootstrapAdminUser() {
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (exists) {
    return;
  }
  db.prepare(
    "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)"
  ).run("admin", hashPassword(ADMIN_PASSWORD), "admin", new Date().toISOString());
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plain), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(plain), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function buildLoginKey(username, ip) {
  return `${String(username || "").toLowerCase()}|${String(ip || "")}`;
}

function registerFailedLogin(key) {
  const now = Date.now();
  const lockMs = LOGIN_LOCK_MINUTES * 60 * 1000;
  const state = loginThrottle.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - state.firstAt > lockMs) {
    state.count = 0;
    state.firstAt = now;
    state.lockedUntil = 0;
  }
  state.count += 1;
  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    state.lockedUntil = now + lockMs;
    state.count = 0;
    state.firstAt = now;
  }
  loginThrottle.set(key, state);
}

setInterval(() => {
  const now = Date.now();
  const lockMs = LOGIN_LOCK_MINUTES * 60 * 1000;
  for (const [key, state] of loginThrottle.entries()) {
    if (!state.lockedUntil && now - state.firstAt > lockMs) {
      loginThrottle.delete(key);
    } else if (state.lockedUntil && now > state.lockedUntil + lockMs) {
      loginThrottle.delete(key);
    }
  }
}, 60 * 1000).unref();

function logAudit({
  actorUserId = null,
  actorUsername = null,
  action,
  targetType = null,
  targetId = null,
  detail = null
}) {
  if (!action) return;
  db.prepare(
    `
    INSERT INTO audit_logs (
      created_at, actor_user_id, actor_username, action, target_type, target_id, detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    new Date().toISOString(),
    actorUserId,
    actorUsername,
    action,
    targetType,
    targetId,
    detail
  );
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(String(username || ""));
}

function validatePasswordStrength(password) {
  const value = String(password || "");
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Sifre en az ${PASSWORD_MIN_LENGTH} karakter olmali.`;
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    return "Sifre en az bir buyuk harf, bir kucuk harf ve bir rakam icermeli.";
  }
  return "";
}
