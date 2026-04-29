const fs = require("fs");
const path = require("path");
const Support = require("../models/Support");
const Sale = require("../models/Sale");
const ClientModel = require("../models/Client");
const { getRangeFromQuery } = require("../lib/dateRange");
const { parseBlocosCliente } = require("../lib/mapSituacaoCliente");

const STATUS_FALLBACK = ["cliente", "pagamento_pendente", "pagamento_recusado", "cancelado", "novo_lead"];
const STATUS_CONTRATO = ClientModel.STATUS_CONTRATO || STATUS_FALLBACK;

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function computeChaveUnica(nome, email, telefone) {
  const em = String(email || "")
    .trim()
    .toLowerCase();
  if (em && em.includes("@")) return `e:${em}`;
  const tel = String(telefone || "").replace(/\D/g, "");
  const nm = normalizeKey(nome);
  if (tel) return `n:${nm}|t:${tel}`;
  return `s:${nm.replace(/\s/g, "_")}`;
}

async function migrateLegacyClientsIfNeeded() {
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
  const telefone = String(extra.telefone || "").trim();
  const email = String(extra.email || "").trim().toLowerCase();
  const chaveUnica = computeChaveUnica(nomeTrim, email, telefone);
  const planoTrim = String(extra.plano || "").trim();
  const dataRef = extra.dataReferencia ? new Date(extra.dataReferencia) : undefined;
  const statusOk = extra.statusContrato && STATUS_CONTRATO.includes(extra.statusContrato);
  const statusInsert = statusOk ? extra.statusContrato : "cliente";

  const setPayload = {
    nome: nomeTrim,
    normalizedName: normalizeKey(nomeTrim),
    chaveUnica
  };
  if (telefone) setPayload.telefone = telefone;
  if (email) setPayload.email = email;
  if (statusOk) setPayload.statusContrato = extra.statusContrato;
  if (planoTrim) setPayload.plano = planoTrim;
  if (dataRef && !Number.isNaN(dataRef.getTime())) setPayload.dataReferencia = dataRef;

  // Não pode repetir caminhos em $set e $setOnInsert (Mongo: "conflict at 'nome'").
  const setOnInsert = {};
  if (!Object.prototype.hasOwnProperty.call(setPayload, "telefone")) setOnInsert.telefone = telefone;
  if (!Object.prototype.hasOwnProperty.call(setPayload, "email")) setOnInsert.email = email;
  if (!Object.prototype.hasOwnProperty.call(setPayload, "statusContrato")) {
    setOnInsert.statusContrato = statusInsert;
  }
  if (!Object.prototype.hasOwnProperty.call(setPayload, "plano")) {
    setOnInsert.plano = planoTrim || "";
  }
  if (!Object.prototype.hasOwnProperty.call(setPayload, "dataReferencia") && dataRef && !Number.isNaN(dataRef.getTime())) {
    setOnInsert.dataReferencia = dataRef;
  }

  const update = Object.keys(setOnInsert).length
    ? { $set: setPayload, $setOnInsert: setOnInsert }
    : { $set: setPayload };
  return ClientModel.findOneAndUpdate(
    { chaveUnica },
    update,
    { upsert: true, new: true }
  );
}

/**
 * Cria/atualiza registros em Client a partir de nomes em Support e Sale (sem apagar origens).
 */
async function syncClientsFromSupport() {
  const names = new Set();
  const supportDocs = await Support.find({}).select("cliente").lean();
  supportDocs.forEach((doc) => {
    const n = String(doc.cliente || "").trim();
    if (n) names.add(n);
  });
  const saleDocs = await Sale.find({}).select("cliente").lean();
  saleDocs.forEach((doc) => {
    const n = String(doc.cliente || "").trim();
    if (n) names.add(n);
  });
  const list = [...names];
  for (const nome of list) {
    try {
      await ensureClientByName(nome, {});
    } catch (err) {
      console.error("[MindLaw] sync cliente (suporte/venda):", nome, err.message);
    }
  }
}

/**
 * Se existir data/lista-clientes-atividade.txt e a coleção Client estiver vazia,
 * importa automaticamente (evita depender só de npm run import:atividade).
 * FORCE_IMPORT_LISTA=1 força reimportação mesmo com dados.
 */
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

/**
 * Conta clientes com dataReferencia no intervalo; ignora o filtro de status (visão geral do período).
 * Sem mês/ano/intervalo no query: contagem de todos os clientes por status.
 */
async function getClientEntradaStats(query = {}) {
  const q = { ...query };
  delete q.clientStatus;
  delete q.statusContrato;
  const range = getRangeFromQuery(q);
  const match = {};
  if (range) {
    match.dataReferencia = { $gte: range.start, $lte: range.end };
  }
  const rows = await ClientModel.aggregate([
    { $match: match },
    { $group: { _id: { $ifNull: ["$statusContrato", "cliente"] }, count: { $sum: 1 } } }
  ]);
  const byStatus = {};
  let total = 0;
  for (const r of rows) {
    const k = r._id;
    byStatus[k] = r.count;
    total += r.count;
  }
  return { byStatus, total, range: range ? { start: range.start.toISOString(), end: range.end.toISOString() } : null };
}

function applyClientSort(query = {}) {
  const sortBy = String(query.sortBy || "nome").trim().toLowerCase();
  const sortDir = String(query.sortDir || "asc").trim().toLowerCase() === "desc" ? -1 : 1;
  // Em imports em lote, createdAt pode ficar muito parecido; desempata por _id.
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
    const key = normalizeKey(row?.cliente);
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
  try {
    await syncClientsFromSupport();
  } catch (err) {
    console.error("[MindLaw] syncClientsFromSupport:", err.message);
  }
  const filter = {};
  const st = String(query.clientStatus || query.statusContrato || "").trim();
  if (st && STATUS_CONTRATO.includes(st)) filter.statusContrato = st;
  const planKey = String(query.clientPlan || "").trim().toLowerCase();
  if (planKey) {
    if (planKey === "sem_plano") {
      filter.$or = [
        { plano: { $exists: false } },
        { plano: null },
        { plano: "" }
      ];
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
    list = list.filter((item) => names.has(normalizeKey(item.nome)));
  }
  return list;
}

module.exports = {
  normalizeKey,
  computeChaveUnica,
  ensureClientByName,
  syncClientsFromSupport,
  importListaAtividadeIfNeeded,
  getClientEntradaStats,
  listAllClientsSorted,
  getNegotiatingLeadNames,
  STATUS_CONTRATO
};
