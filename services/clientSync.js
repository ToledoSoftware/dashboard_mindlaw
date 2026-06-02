const fs = require("fs");
const path = require("path");
const Support = require("../models/Support");
const Sale = require("../models/Sale");
const ClientModel = require("../models/Client");
const { getRangeFromQuery } = require("../lib/dateRange.js");
const { parseBlocosCliente, mapComercialStatusParaStatus } = require("../lib/mapSituacaoCliente");
const { normalizeClientKey } = require("../lib/normalizeClientKey");

const STATUS_FALLBACK = ["cliente", "pagamento_pendente", "pagamento_recusado", "cancelado", "novo_lead"];
const STATUS_CONTRATO = ClientModel.STATUS_CONTRATO || STATUS_FALLBACK;

const NOT_DELETED = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

let legacyMigrationDone = false;

/** @deprecated use normalizeClientKey — mantido para scripts legados */
function normalizeKey(value) {
  return normalizeClientKey(value);
}

function computeChaveUnica(nome, email, telefone) {
  const em = String(email || "")
    .trim()
    .toLowerCase();
  if (em && em.includes("@")) return `e:${em}`;
  const tel = String(telefone || "").replace(/\D/g, "");
  const nm = normalizeClientKey(nome);
  if (tel) return `n:${nm}|t:${tel}`;
  return `s:${nm.replace(/\s/g, "_")}`;
}

function pickPrimaryClientRecord(rows) {
  if (!rows.length) return null;
  const score = (r) => {
    let s = 0;
    if (r.email && String(r.email).includes("@")) s += 8;
    if (String(r.telefone || "").replace(/\D/g, "").length >= 10) s += 4;
    if (r.plano) s += 2;
    if (r.statusContrato === "cliente") s += 1;
    return s;
  };
  return [...rows].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  })[0];
}

function resolveStatusForUpdate(existing, requested, extra = {}) {
  if (!requested || !STATUS_CONTRATO.includes(requested)) return undefined;
  const current = existing?.statusContrato;
  if (requested === "cancelado") return "cancelado";
  if (current === "cancelado" && !extra.reactivate) return "cancelado";
  if (requested === "cliente") return "cliente";
  if (requested === "novo_lead" && (current === "cliente" || current === "cancelado")) return current;
  return requested;
}

async function findActiveClientsByNormalizedName(nomeTrim) {
  const norm = normalizeClientKey(nomeTrim);
  if (!norm) return [];
  return ClientModel.find({ normalizedName: norm, ...NOT_DELETED }).lean();
}

async function consolidateDuplicateClients(nomeTrim, keepId) {
  const norm = normalizeClientKey(nomeTrim);
  const dupes = await ClientModel.find({
    normalizedName: norm,
    _id: { $ne: keepId },
    ...NOT_DELETED
  }).select("_id");
  if (!dupes.length) return;
  const now = new Date();
  await ClientModel.updateMany({ _id: { $in: dupes.map((d) => d._id) } }, { $set: { deletedAt: now } });
}

async function findClientForMerge(nomeTrim, email, telefone) {
  const chaveUnica = computeChaveUnica(nomeTrim, email, telefone);
  let doc = await ClientModel.findOne({ chaveUnica, ...NOT_DELETED });
  if (doc) return doc;

  const byName = await findActiveClientsByNormalizedName(nomeTrim);
  if (!byName.length) return null;
  const primary = pickPrimaryClientRecord(byName);
  if (!primary) return null;
  return ClientModel.findById(primary._id);
}

function mergeContactFields(existing, extra) {
  const telefone = String(extra.telefone || "").trim() || String(existing?.telefone || "").trim();
  const email = String(extra.email || "")
    .trim()
    .toLowerCase() || String(existing?.email || "").trim().toLowerCase();
  return { telefone, email };
}

async function getLatestSaleContractStatus(nomeTrim) {
  const norm = normalizeClientKey(nomeTrim);
  const sales = await Sale.find({}).select("cliente status data").lean();
  let latest = null;
  for (const row of sales) {
    if (normalizeClientKey(row.cliente) !== norm) continue;
    const d = row.data ? new Date(row.data) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!latest || d > latest.date) latest = { date: d, status: row.status };
  }
  return latest ? mapComercialStatusParaStatus(latest.status) : null;
}

async function clientHasChurnRecord(nomeTrim) {
  const norm = normalizeClientKey(nomeTrim);
  const rows = await Support.find({ registerType: "churn" }).select("cliente").lean();
  return rows.some((row) => normalizeClientKey(row.cliente) === norm);
}

async function migrateLegacyClientsIfNeeded() {
  if (legacyMigrationDone) return;
  legacyMigrationDone = true;
  const olds = await ClientModel.find({
    $or: [{ chaveUnica: { $exists: false } }, { chaveUnica: "" }]
  })
    .select("nome email telefone")
    .lean();
  for (const d of olds) {
    const cu = computeChaveUnica(d.nome, d.email, d.telefone);
    try {
      await ClientModel.collection.updateOne({ _id: d._id }, { $set: { chaveUnica: cu } });
    } catch (_e) {
      /* chave duplicada: ignorar */
    }
  }
}

async function ensureClientByName(nome, extra = {}) {
  const nomeTrim = String(nome || "").trim();
  if (!nomeTrim) return null;

  const existing = await findClientForMerge(nomeTrim, extra.email, extra.telefone);
  const mergedContact = mergeContactFields(existing, extra);
  const telefone = mergedContact.telefone;
  const email = mergedContact.email;
  const chaveUnica = computeChaveUnica(nomeTrim, email, telefone);
  const planoTrim = String(extra.plano || "").trim();
  const dataRef = extra.dataReferencia ? new Date(extra.dataReferencia) : undefined;
  const preserveExisting = Boolean(extra.preserveExisting && existing);

  const requestedStatus =
    extra.statusContrato && STATUS_CONTRATO.includes(extra.statusContrato)
      ? extra.statusContrato
      : null;
  const statusForUpdate = preserveExisting
    ? undefined
    : resolveStatusForUpdate(existing, requestedStatus, extra);
  const statusInsert =
    requestedStatus ||
    (existing ? undefined : mapComercialStatusParaStatus(extra.saleStatus) || "novo_lead");

  const setPayload = {
    nome: nomeTrim,
    normalizedName: normalizeClientKey(nomeTrim),
    chaveUnica
  };
  if (telefone) setPayload.telefone = telefone;
  if (email) setPayload.email = email;
  if (statusForUpdate) setPayload.statusContrato = statusForUpdate;
  if (planoTrim) setPayload.plano = planoTrim;
  if (!preserveExisting && dataRef && !Number.isNaN(dataRef.getTime())) {
    setPayload.dataReferencia = dataRef;
  }

  const setOnInsert = {};
  if (!Object.prototype.hasOwnProperty.call(setPayload, "telefone")) setOnInsert.telefone = telefone;
  if (!Object.prototype.hasOwnProperty.call(setPayload, "email")) setOnInsert.email = email;
  if (!Object.prototype.hasOwnProperty.call(setPayload, "statusContrato") && statusInsert) {
    setOnInsert.statusContrato = statusInsert;
  }
  if (!Object.prototype.hasOwnProperty.call(setPayload, "plano")) {
    setOnInsert.plano = planoTrim || "";
  }
  if (
    !preserveExisting &&
    !Object.prototype.hasOwnProperty.call(setPayload, "dataReferencia") &&
    dataRef &&
    !Number.isNaN(dataRef.getTime())
  ) {
    setOnInsert.dataReferencia = dataRef;
  }

  const update = Object.keys(setOnInsert).length
    ? { $set: setPayload, $setOnInsert: setOnInsert }
    : { $set: setPayload };
  if (extra.reactivate) {
    update.$unset = { deletedAt: "" };
  }

  let result;
  if (existing) {
    result = await ClientModel.findByIdAndUpdate(existing._id, update, { new: true, runValidators: true });
    await consolidateDuplicateClients(nomeTrim, existing._id);
  } else {
    const anyByKey = await ClientModel.findOne({ chaveUnica });
    if (anyByKey) {
      if (anyByKey.deletedAt || extra.reactivate) {
        update.$unset = { ...(update.$unset || {}), deletedAt: "" };
      }
      result = await ClientModel.findByIdAndUpdate(anyByKey._id, update, { new: true, runValidators: true });
    } else {
      result = await ClientModel.findOneAndUpdate({ chaveUnica, ...NOT_DELETED }, update, {
        upsert: true,
        new: true,
        runValidators: true
      });
    }
    if (result) await consolidateDuplicateClients(nomeTrim, result._id);
  }
  return result;
}

/**
 * Garante cadastro Client para nomes em Sale/Support que ainda não existem.
 * Não sobrescreve status/data de clientes já cadastrados.
 */
async function syncClientsFromSupport() {
  const namesByNorm = new Map();
  const latestSaleDateByNorm = new Map();
  const saleDocs = await Sale.find({}).select("cliente data plano").lean();
  saleDocs.forEach((doc) => {
    const n = String(doc.cliente || "").trim();
    if (!n) return;
    const norm = normalizeClientKey(n);
    if (!namesByNorm.has(norm)) namesByNorm.set(norm, n);
    const d = doc.data ? new Date(doc.data) : null;
    if (!d || Number.isNaN(d.getTime())) return;
    const prev = latestSaleDateByNorm.get(norm);
    if (!prev || d > prev.date) {
      latestSaleDateByNorm.set(norm, { date: d, plano: String(doc.plano || "").trim() });
    }
  });
  const supportDocs = await Support.find({}).select("cliente").lean();
  supportDocs.forEach((doc) => {
    const n = String(doc.cliente || "").trim();
    if (!n) return;
    const norm = normalizeClientKey(n);
    if (!namesByNorm.has(norm)) namesByNorm.set(norm, n);
  });

  const deletedRows = await ClientModel.find({ deletedAt: { $ne: null } }).select("normalizedName").lean();
  const deletedNames = new Set(deletedRows.map((r) => r.normalizedName).filter(Boolean));

  for (const [norm, nome] of namesByNorm) {
    if (deletedNames.has(norm)) continue;
    try {
      const existing = await findClientForMerge(nome, "", "");
      if (existing) continue;

      const saleMeta = latestSaleDateByNorm.get(norm);
      const hasChurn = await clientHasChurnRecord(nome);
      const saleStatus = hasChurn ? "cancelado" : await getLatestSaleContractStatus(nome);
      const extra = {
        telefone: "",
        email: ""
      };
      if (saleMeta?.date) extra.dataReferencia = saleMeta.date;
      if (saleMeta?.plano) extra.plano = saleMeta.plano;
      if (saleStatus) extra.statusContrato = saleStatus;
      await ensureClientByName(nome, extra);
    } catch (err) {
      console.error("[MindLaw] sync cliente (suporte/venda):", nome, err.message);
    }
  }
}

function shouldSyncOnList(query = {}) {
  if (String(query.sync || "") === "1") return true;
  if (String(query.skipSync || "") === "1") return false;
  if (String(query.forForms || "") === "1") return false;
  return process.env.CLIENT_SYNC_ON_LIST === "1";
}

async function importListaAtividadeIfNeeded() {
  const filePath = path.join(__dirname, "..", "data", "lista-clientes-atividade.txt");
  if (!fs.existsSync(filePath)) {
    return { ran: false, reason: "arquivo ausente", count: 0 };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const records = parseBlocosCliente(raw);
  if (!records.length) return { ran: false, reason: "parse vazio", count: 0 };

  const existing = await ClientModel.estimatedDocumentCount();
  const force = process.env.FORCE_IMPORT_LISTA === "1";
  if (existing > 0 && !force) {
    return { ran: false, reason: "ja existem clientes", count: existing };
  }

  let ok = 0;
  for (const r of records) {
    try {
      await ensureClientByName(r.nome, {
        email: r.email,
        telefone: r.telefone,
        statusContrato: r.statusContrato,
        plano: r.plano,
        dataReferencia: r.dataReferencia || undefined
      });
      ok += 1;
    } catch (err) {
      console.error("[MindLaw] import lista:", r.nome, err.message);
    }
  }
  console.log(`[MindLaw] Import lista atividade: ${ok}/${records.length} registros.`);
  return { ran: true, reason: force ? "FORCE_IMPORT_LISTA" : "coleção vazia", count: ok };
}

async function getClientEntradaStats(query = {}) {
  const q = { ...query };
  delete q.clientStatus;
  delete q.statusContrato;
  const range = getRangeFromQuery(q);
  const match = { ...NOT_DELETED };
  if (range) {
    match.dataReferencia = { $gte: range.start, $lte: range.end };
  }
  const rows = await ClientModel.find(match).select("statusContrato normalizedName").lean();
  const seen = new Set();
  const byStatus = {};
  let total = 0;
  for (const r of rows) {
    const norm = r.normalizedName || normalizeClientKey(r.nome);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const k = r.statusContrato || "cliente";
    byStatus[k] = (byStatus[k] || 0) + 1;
    total += 1;
  }
  return { byStatus, total, range: range ? { start: range.start.toISOString(), end: range.end.toISOString() } : null };
}

function applyClientSort(query = {}) {
  const sortBy = String(query.sortBy || "nome").trim().toLowerCase();
  const sortDir = String(query.sortDir || "asc").trim().toLowerCase() === "desc" ? -1 : 1;
  if (sortBy === "cadastro") return { createdAt: sortDir, _id: sortDir };
  if (sortBy === "plano") return { plano: sortDir, nome: 1 };
  if (sortBy === "status") return { statusContrato: sortDir, nome: 1 };
  if (sortBy === "data_ref" || sortBy === "datareferencia") return { dataReferencia: sortDir, nome: 1 };
  return { nome: sortDir };
}

async function getNegotiatingLeadNames() {
  const rows = await Sale.find({ status: "Em Negociacao" }).select("cliente").lean();
  const set = new Set();
  rows.forEach((row) => {
    const key = normalizeClientKey(row?.cliente);
    if (key) set.add(key);
  });
  return set;
}

async function listAllClientsSorted(query = {}) {
  try {
    await migrateLegacyClientsIfNeeded();
  } catch (err) {
    console.error("[MindLaw] migrateLegacyClients:", err.message);
  }
  if (shouldSyncOnList(query)) {
    try {
      await syncClientsFromSupport();
    } catch (err) {
      console.error("[MindLaw] syncClientsFromSupport:", err.message);
    }
  }
  const filter = {
    $and: [{ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] }]
  };
  const st = String(query.clientStatus || query.statusContrato || "").trim();
  if (st && STATUS_CONTRATO.includes(st)) filter.statusContrato = st;
  const planKey = String(query.clientPlan || "").trim().toLowerCase();
  if (planKey) {
    if (planKey === "sem_plano") {
      filter.$and.push({
        $or: [{ plano: { $exists: false } }, { plano: null }, { plano: "" }]
      });
    } else if (planKey === "outros") {
      filter.plano = { $regex: "^(?!.*starter)(?!.*premium)(?!.*advanced).+$", $options: "i" };
    } else {
      filter.plano = { $regex: planKey, $options: "i" };
    }
  }
  const segment = String(query.clientSegment || "").trim();
  if (!filter.statusContrato && segment === "clientes") {
    filter.statusContrato = { $ne: "novo_lead" };
  }
  if (!filter.statusContrato && segment === "leads") {
    filter.statusContrato = "novo_lead";
  }
  const range = getRangeFromQuery(query);
  if (range) {
    filter.dataReferencia = { $gte: range.start, $lte: range.end };
  }
  let list = await ClientModel.find(filter).sort(applyClientSort(query)).lean();
  if (segment === "leads_comercial") {
    const names = await getNegotiatingLeadNames();
    list = list.filter((item) => names.has(normalizeClientKey(item.nome)));
  }
  return list;
}

async function countChurnRecordsForClientName(clientName) {
  const norm = normalizeClientKey(clientName);
  if (!norm) return 0;
  const rows = await Support.find({ registerType: "churn" }).select("cliente").lean();
  return rows.filter((row) => normalizeClientKey(row.cliente) === norm).length;
}

module.exports = {
  normalizeKey,
  normalizeClientKey,
  computeChaveUnica,
  pickPrimaryClientRecord,
  ensureClientByName,
  syncClientsFromSupport,
  importListaAtividadeIfNeeded,
  getClientEntradaStats,
  listAllClientsSorted,
  getNegotiatingLeadNames,
  countChurnRecordsForClientName,
  mapComercialStatusParaStatus,
  STATUS_CONTRATO
};
