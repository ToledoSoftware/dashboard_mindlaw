/**
 * Consolida cadastros duplicados de Client (mesmo nome normalizado).
 * Uso: node scripts/consolidate-duplicate-clients.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Client = require("../models/Client");
const {
  ensureClientByName,
  normalizeClientKey,
  pickPrimaryClientRecord
} = require("../services/clientSync");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Defina MONGODB_URI no .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const active = await Client.find({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
  })
    .select("nome email telefone plano statusContrato normalizedName createdAt")
    .lean();

  const byNorm = new Map();
  for (const row of active) {
    const norm = row.normalizedName || normalizeClientKey(row.nome);
    if (!norm) continue;
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(row);
  }

  let merged = 0;
  for (const [norm, rows] of byNorm) {
    if (rows.length <= 1) continue;
    const primary = pickPrimaryClientRecord(rows);
    const nome = String(primary?.nome || rows[0].nome || "").trim();
    if (!nome) continue;
    await ensureClientByName(nome, {
      email: primary?.email || "",
      telefone: primary?.telefone || "",
      plano: primary?.plano || "",
      statusContrato: primary?.statusContrato,
      preserveExisting: true
    });
    merged += 1;
    console.log(`Consolidado: ${nome} (${rows.length} registros → 1)`);
  }
  console.log(`Concluído. Grupos com duplicata tratados: ${merged}/${byNorm.size}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
