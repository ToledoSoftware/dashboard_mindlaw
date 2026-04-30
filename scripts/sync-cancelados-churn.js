require("dotenv").config();
const mongoose = require("mongoose");
const Client = require("../models/Client");
const Support = require("../models/Support");

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const cancelados = await Client.find({ statusContrato: "cancelado" })
    .select("nome dataReferencia createdAt")
    .lean();

  const churnDocs = await Support.find({ registerType: "churn" })
    .select("cliente dataChurn")
    .lean();

  const churnsByName = new Map();
  for (const doc of churnDocs) {
    const key = normalizeName(doc.cliente);
    if (!key) continue;
    if (!churnsByName.has(key)) churnsByName.set(key, []);
    churnsByName.get(key).push(doc);
  }

  let created = 0;
  let updated = 0;
  let forcedCancelStatus = 0;
  let skipped = 0;
  const createdDetails = [];
  const updatedDetails = [];

  function resolveChurnDate(client) {
    if (client.dataReferencia) return new Date(client.dataReferencia);
    if (client.createdAt) return new Date(client.createdAt);
    return new Date();
  }

  for (const client of cancelados) {
    const nome = String(client.nome || "").trim();
    const key = normalizeName(nome);
    if (!key) {
      skipped += 1;
      continue;
    }

    const statusResult = await Client.updateMany(
      { normalizedName: key, statusContrato: { $ne: "cancelado" } },
      { $set: { statusContrato: "cancelado" } }
    );
    forcedCancelStatus += Number(statusResult.modifiedCount || 0);

    const existingChurns = churnsByName.get(key) || [];
    const hasDatedChurn = existingChurns.some((doc) => !!doc.dataChurn);
    if (hasDatedChurn) {
      skipped += 1;
      continue;
    }

    const dataChurn = resolveChurnDate(client);
    if (existingChurns.length > 0) {
      const targetDoc = existingChurns[0];
      await Support.updateOne(
        { _id: targetDoc._id },
        { $set: { dataChurn } }
      );
      updated += 1;
      updatedDetails.push({
        cliente: nome,
        dataChurn: dataChurn.toISOString().slice(0, 10)
      });
    } else {
      await Support.create({
        registerType: "churn",
        cliente: nome,
        valorPerdido: 0,
        dataChurn,
        motivoPrincipal: "Sem Motivo"
      });
      created += 1;
      createdDetails.push({
        cliente: nome,
        dataChurn: dataChurn.toISOString().slice(0, 10),
        motivoPrincipal: "Sem Motivo",
        valorPerdido: 0
      });
    }
  }

  await mongoose.disconnect();

  console.log(
    JSON.stringify(
      {
        totalCancelados: cancelados.length,
        churnJaExistenteOuSemNome: skipped,
        churnAtualizadosSemData: updated,
        churnCriados: created,
        clientesStatusAjustadoParaCancelado: forcedCancelStatus,
        atualizadosDetalhes: updatedDetails,
        criadosDetalhes: createdDetails
      },
      null,
      2
    )
  );
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (_err) {
    // noop
  }
  process.exit(1);
});
