require("dotenv").config();
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const mongoose = require("mongoose");

const Support = require("./models/Support");

const SQLITE_FILE = path.join(__dirname, "mindlaw_intel_v2.db");

function mapMotivoPerda(text = "") {
  const normalized = String(text).toLowerCase();
  if (normalized.includes("preco") || normalized.includes("finance")) return "Preco";
  if (normalized.includes("funcional")) return "Falta de Funcionalidade";
  if (normalized.includes("integra")) return "Falta de Integracao";
  if (!normalized.trim()) return "Sem Motivo";
  return "Outros";
}

function parseDate(raw) {
  if (!raw) return new Date();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function readAll(db, query) {
  return new Promise((resolve, reject) => {
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function migrate() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI nao configurada no ambiente.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[MIGRATE] MongoDB conectado.");

  const sqlite = new sqlite3.Database(SQLITE_FILE);
  const churnRows = await readAll(sqlite, "SELECT * FROM churn");
  const feedbackRows = await readAll(sqlite, "SELECT * FROM feedback");
  sqlite.close();

  console.log(`[MIGRATE] Registros SQLite: churn=${churnRows.length} feedback=${feedbackRows.length}`);

  const supportFromChurn = churnRows.map((row) => ({
    registerType: "churn",
    cliente: row.cliente || "Cliente legado",
    valorPerdido: 0,
    dataChurn: parseDate(row.data_registro),
    motivoPrincipal: mapMotivoPerda(`${row.temas || ""} ${row.motivo || ""}`)
  }));

  const supportFromFeedback = feedbackRows.map((row) => ({
    registerType: "nps",
    cliente: row.cliente || "Cliente legado",
    notaNPS: typeof row.nota === "number" ? row.nota : Number(row.nota || 0),
    comentarioNPS: row.descricao || "",
    dataNPS: parseDate(row.data_registro)
  }));

  const supportDocs = [...supportFromChurn, ...supportFromFeedback];
  if (supportDocs.length) {
    await Support.insertMany(supportDocs, { ordered: false });
    console.log(`[MIGRATE] Support inseridos: ${supportDocs.length}`);
  }

  await mongoose.disconnect();
  console.log("[MIGRATE] Finalizado com sucesso.");
}

migrate().catch(async (error) => {
  console.error("[MIGRATE] Falha:", error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // noop
  }
  process.exit(1);
});
