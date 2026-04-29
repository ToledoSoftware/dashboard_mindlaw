const express = require("express");
const XLSX = require("xlsx");
const Sale = require("../models/Sale");
const Support = require("../models/Support");
const Client = require("../models/Client");
const { getRangeFromQuery } = require("../lib/dateRange");
const { ensureClientByName, listAllClientsSorted, getClientEntradaStats, computeChaveUnica } = require("../services/clientSync");
const authMiddleware = require("../middleware/authMiddleware");

const STATUS_LABEL_PT = {
  cliente: "Cliente (ativo)",
  pagamento_pendente: "Pagamento pendente",
  pagamento_recusado: "Pagamento recusado",
  cancelado: "Cancelado",
  novo_lead: "Novo lead"
};

const router = express.Router();

router.use(authMiddleware);

router.get("/clients/export", async (_req, res) => {
  try {
    const clients = await listAllClientsSorted(_req.query || {});
    const rows = clients.map((c) => ({
      Nome: c.nome || "",
      "E-mail": c.email || "",
      Telefone: c.telefone || "",
      Status: STATUS_LABEL_PT[c.statusContrato] || c.statusContrato || "",
      Plano: c.plano || "",
      "Data de referencia": c.dataReferencia
        ? new Date(c.dataReferencia).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : ""
    }));
    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 36 }, { wch: 32 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws, "Clientes");
    let ent = { byStatus: {}, total: 0 };
    try {
      ent = await getClientEntradaStats(_req.query || {});
    } catch (_e) {
      /* mantém vazio */
    }
    const resumo = Object.keys(ent.byStatus || {})
      .sort()
      .map((k) => ({ Status: STATUS_LABEL_PT[k] || k, Quantidade: ent.byStatus[k] }));
    resumo.push({ Status: "Total (todos os status, mesmo periodo do filtro)", Quantidade: ent.total });
    const ws2 = XLSX.utils.json_to_sheet(resumo);
    XLSX.utils.book_append_sheet(workbook, ws2, "Resumo periodo");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=MindLaw_Clientes.xlsx");
    return res.send(buffer);
  } catch (error) {
    console.error("[MindLaw] export clientes:", error.message);
    return res.status(500).json({ error: "Erro ao exportar clientes." });
  }
});

router.get("/clients", async (_req, res) => {
  try {
    const forForms = String(_req.query.forForms || "") === "1";
    const query = forForms ? {} : (_req.query || {});
    const clients = await listAllClientsSorted(query);
    return res.json({ clients });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar clientes." });
  }
});

router.post("/clients", async (req, res) => {
  try {
    const payload = req.body || {};
    const nome = String(payload.nome || "").trim();
    if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });
    const client = await ensureClientByName(nome, {
      telefone: payload.telefone || "",
      email: payload.email || "",
      statusContrato: payload.statusContrato,
      plano: payload.plano,
      dataReferencia: payload.dataReferencia
    });
    return res.status(201).json({ status: "ok", data: client });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao salvar cliente." });
  }
});

router.put("/clients/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID inválido." });
    const existing = await Client.findById(id);
    if (!existing) return res.status(404).json({ error: "Cliente não encontrado." });
    const payload = req.body || {};
    const patch = {};
    if (payload.nome !== undefined) {
      const nome = String(payload.nome || "").trim();
      if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });
      patch.nome = nome;
      patch.normalizedName = nome.toLowerCase().trim().replace(/\s+/g, " ");
    }
    if (payload.telefone !== undefined) patch.telefone = String(payload.telefone || "").trim();
    if (payload.email !== undefined) patch.email = String(payload.email || "").trim().toLowerCase();
    if (payload.plano !== undefined) patch.plano = String(payload.plano || "").trim();
    if (payload.statusContrato !== undefined) patch.statusContrato = payload.statusContrato;
    if (payload.dataReferencia !== undefined) {
      patch.dataReferencia = payload.dataReferencia ? new Date(payload.dataReferencia) : null;
    }
    const nextNome = patch.nome !== undefined ? patch.nome : existing.nome;
    const nextEmail = patch.email !== undefined ? patch.email : existing.email;
    const nextTel = patch.telefone !== undefined ? patch.telefone : existing.telefone;
    patch.chaveUnica = computeChaveUnica(nextNome, nextEmail, nextTel);
    const updated = await Client.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
    return res.json({ status: "ok", data: updated });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao atualizar cliente." });
  }
});

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function classifySupport(doc) {
  if (doc.registerType === "churn" || doc.registerType === "nps") return doc.registerType;
  if (typeof doc.notaNPS === "number") return "nps";
  if (doc.dataChurn) return "churn";
  return "churn";
}

function computeNpsScore(entries) {
  const respondents = entries.filter((item) => typeof item.notaNPS === "number");
  const total = respondents.length;
  if (!total) return 0;
  const promoters = respondents.filter((item) => item.notaNPS >= 9).length;
  const detractors = respondents.filter((item) => item.notaNPS <= 6).length;
  return ((promoters - detractors) / total) * 100;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function toDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function filterDuplicatedLostSales(sales, support) {
  const churnSetByClientDate = new Set(
    support
      .filter((item) => classifySupport(item) === "churn")
      .map((item) => `${normalizeKey(item.cliente)}|${toDateKey(item.dataChurn)}`)
  );

  return sales.filter((sale) => {
    if (sale.status !== "Perdido") return true;
    const saleKey = `${normalizeKey(sale.cliente)}|${toDateKey(sale.data)}`;
    const mirrored = churnSetByClientDate.has(saleKey);
    const likelyLegacyMirror = Number(sale.valorContrato || 0) === 0;
    return !(mirrored && likelyLegacyMirror);
  });
}

function filterSalesByRange(sales, range) {
  if (!range) return sales;
  return sales.filter((sale) => {
    const date = new Date(sale.data);
    return !Number.isNaN(date.getTime()) && date >= range.start && date <= range.end;
  });
}

function filterSupportByRange(support, range) {
  if (!range) return support;
  return support.filter((doc) => {
    const type = classifySupport(doc);
    const rawDate = type === "churn" ? doc.dataChurn : doc.dataNPS;
    const date = new Date(rawDate);
    return !Number.isNaN(date.getTime()) && date >= range.start && date <= range.end;
  });
}

function getSaoPauloMonthYear(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(dt);
  const year = Number(parts.find((p) => p.type === "year")?.value || 0);
  const month = Number(parts.find((p) => p.type === "month")?.value || 0);
  if (!year || !month) return null;
  return { year, month };
}

router.get("/sales", async (_req, res) => {
  try {
    const [salesRaw, support] = await Promise.all([
      Sale.find().sort({ data: -1, createdAt: -1 }).lean(),
      Support.find().lean()
    ]);
    const deduped = filterDuplicatedLostSales(salesRaw, support);
    return res.json({ sales: filterSalesByRange(deduped, getRangeFromQuery(_req.query)) });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar vendas." });
  }
});

router.post("/sales", async (req, res) => {
  try {
    const payload = req.body || {};
    if (payload.registerType || payload.notaNPS !== undefined || payload.dataChurn) {
      return res.status(400).json({ error: "Payload inválido para Comercial. Use as rotas de Suporte para churn/NPS." });
    }
    const sale = await Sale.create({
      cliente: payload.cliente,
      valorContrato: Number(payload.valorContrato),
      data: payload.data,
      status: payload.status,
      motivoPerda: payload.motivoPerda || "Sem Motivo",
      detalhamentoTecnico: payload.detalhamentoTecnico || "",
      competidor: payload.competidor || ""
    });
    await ensureClientByName(payload.cliente);
    return res.status(201).json({ status: "ok", data: sale });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao salvar dado comercial." });
  }
});

router.put("/sales/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID inválido." });
    const payload = req.body || {};
    const patch = {};
    if (payload.cliente !== undefined) patch.cliente = String(payload.cliente || "").trim();
    if (payload.valorContrato !== undefined) patch.valorContrato = Number(payload.valorContrato || 0);
    if (payload.data !== undefined) patch.data = payload.data || null;
    if (payload.status !== undefined) patch.status = payload.status;
    if (payload.motivoPerda !== undefined) patch.motivoPerda = payload.motivoPerda || "Sem Motivo";
    if (payload.detalhamentoTecnico !== undefined) patch.detalhamentoTecnico = payload.detalhamentoTecnico || "";
    if (payload.competidor !== undefined) patch.competidor = payload.competidor || "";
    const updated = await Sale.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: "Registro comercial não encontrado." });
    return res.json({ status: "ok", data: updated });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao atualizar dado comercial." });
  }
});

router.delete("/sales/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID inválido." });
    const deleted = await Sale.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Registro comercial não encontrado." });
    return res.json({ status: "ok" });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao excluir dado comercial." });
  }
});

router.get("/support", async (_req, res) => {
  try {
    const support = await Support.find().sort({ dataChurn: -1, dataNPS: -1 }).lean();
    return res.json({ support: filterSupportByRange(support, getRangeFromQuery(_req.query)) });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar suporte." });
  }
});

router.post("/support", async (req, res) => {
  try {
    const payload = req.body || {};
    const registerType = payload.registerType || (payload.notaNPS !== undefined && payload.notaNPS !== "" ? "nps" : "churn");
    const support = await Support.create({
      registerType,
      cliente: payload.cliente,
      valorPerdido: Number(payload.valorPerdido || 0),
      dataChurn: payload.dataChurn || null,
      motivoPrincipal: payload.motivoPrincipal || "Sem Motivo",
      notaNPS: payload.notaNPS !== undefined && payload.notaNPS !== "" ? Number(payload.notaNPS) : undefined,
      comentarioNPS: payload.comentarioNPS || "",
      dataNPS: payload.dataNPS || null
    });
    if (registerType === "churn") {
      await ensureClientByName(payload.cliente, { statusContrato: "cancelado" });
    } else {
      await ensureClientByName(payload.cliente);
    }
    return res.status(201).json({ status: "ok", data: support });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao salvar dado de suporte." });
  }
});

router.post("/support/churn", async (req, res) => {
  try {
    const payload = req.body || {};
    const support = await Support.create({
      registerType: "churn",
      cliente: payload.cliente,
      valorPerdido: Number(payload.valorPerdido || 0),
      dataChurn: payload.dataChurn || null,
      motivoPrincipal: payload.motivoPrincipal || "Sem Motivo"
    });
    await ensureClientByName(payload.cliente, { statusContrato: "cancelado" });
    return res.status(201).json({ status: "ok", data: support });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao salvar churn." });
  }
});

router.post("/support/nps", async (req, res) => {
  try {
    const payload = req.body || {};
    const support = await Support.create({
      registerType: "nps",
      cliente: payload.cliente,
      notaNPS: Number(payload.notaNPS),
      comentarioNPS: payload.comentarioNPS || "",
      dataNPS: payload.dataNPS || null
    });
    await ensureClientByName(payload.cliente);
    return res.status(201).json({ status: "ok", data: support });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao salvar NPS." });
  }
});

router.put("/support/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID inválido." });
    const payload = req.body || {};
    const support = await Support.findById(id);
    if (!support) return res.status(404).json({ error: "Registro de suporte não encontrado." });
    if (payload.registerType !== undefined) support.registerType = payload.registerType;
    if (payload.cliente !== undefined) support.cliente = String(payload.cliente || "").trim();
    if (payload.valorPerdido !== undefined) support.valorPerdido = Number(payload.valorPerdido || 0);
    if (payload.dataChurn !== undefined) support.dataChurn = payload.dataChurn || null;
    if (payload.motivoPrincipal !== undefined) support.motivoPrincipal = payload.motivoPrincipal || "Sem Motivo";
    if (payload.notaNPS !== undefined) {
      support.notaNPS = payload.notaNPS === "" || payload.notaNPS === null ? undefined : Number(payload.notaNPS);
    }
    if (payload.comentarioNPS !== undefined) support.comentarioNPS = payload.comentarioNPS || "";
    if (payload.dataNPS !== undefined) support.dataNPS = payload.dataNPS || null;
    await support.save();
    if (support.registerType === "churn") {
      await ensureClientByName(support.cliente, { statusContrato: "cancelado" });
    }
    return res.json({ status: "ok", data: support });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao atualizar dado de suporte." });
  }
});

router.delete("/support/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID inválido." });
    const support = await Support.findById(id);
    if (!support) return res.status(404).json({ error: "Registro de suporte não encontrado." });
    const clientName = String(support.cliente || "").trim();
    const wasChurn = classifySupport(support) === "churn";
    await Support.findByIdAndDelete(id);
    if (wasChurn && clientName) {
      const remainingChurn = await Support.countDocuments({
        registerType: "churn",
        cliente: clientName
      });
      if (!remainingChurn) {
        await ensureClientByName(clientName, { statusContrato: "cliente" });
      }
    }
    return res.json({ status: "ok" });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao excluir dado de suporte." });
  }
});

router.get("/dashboard", async (_req, res) => {
  try {
    const [salesRaw, support] = await Promise.all([
      Sale.find().lean(),
      Support.find().lean()
    ]);
    const sales = filterDuplicatedLostSales(salesRaw, support);

    const ganhos = sales.filter((s) => s.status === "Ganho");
    const perdidos = sales.filter((s) => s.status === "Perdido");
    const negociacao = sales.filter((s) => s.status === "Em Negociacao");
    const conversionRate = sales.length ? (ganhos.length / sales.length) * 100 : 0;

    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthEnd = new Date(monthStart.getTime() - 1);

    const activeClientsAtMonthStart = new Set();
    sales.forEach((sale) => {
      if (!["Ganho", "Em Negociacao"].includes(sale.status)) return;
      const saleDate = new Date(sale.data);
      if (saleDate <= prevMonthEnd) {
        activeClientsAtMonthStart.add(String(sale.cliente || "").trim().toLowerCase());
      }
    });

    const cancelledClients = new Set();
    support
      .filter((item) => classifySupport(item) === "churn" && item.dataChurn)
      .forEach((item) => {
        const churnDate = new Date(item.dataChurn);
        if (churnDate >= monthStart && churnDate <= endOfMonth(now)) {
          cancelledClients.add(String(item.cliente || "").trim().toLowerCase());
        }
      });

    const churnRate = activeClientsAtMonthStart.size
      ? (cancelledClients.size / activeClientsAtMonthStart.size) * 100
      : 0;

    const npsScore = computeNpsScore(support.filter((item) => classifySupport(item) === "nps"));

    const ltvEstimado = ganhos.reduce((acc, item) => acc + (item.valorContrato || 0), 0);

    const lossReasons = perdidos.reduce((acc, item) => {
      const reason = item.motivoPerda || "Sem Motivo";
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      kpis: {
        ltvEstimado,
        churnRate,
        conversionRate,
        npsScore
      },
      salesFunnel: {
        ganhos: ganhos.length,
        perdidos: perdidos.length,
        negociacao: negociacao.length
      },
      lossReasons,
      support
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao montar dashboard." });
  }
});

router.get("/data", async (_req, res) => {
  try {
    const [salesRaw, support] = await Promise.all([
      Sale.find().sort({ data: -1, createdAt: -1 }).lean(),
      Support.find().sort({ createdAt: -1 }).lean()
    ]);
    const range = getRangeFromQuery(_req.query);
    const sales = filterSalesByRange(filterDuplicatedLostSales(salesRaw, support), range);
    const supportFiltered = filterSupportByRange(support, range);

    const distributionByTheme = sales
      .filter((item) => item.status === "Perdido")
      .reduce((acc, item) => {
        const reason = item.motivoPerda || "Sem Motivo";
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});

    const closureProportion = {
      ganho: sales.filter((item) => item.status === "Ganho").length,
      perdido: sales.filter((item) => item.status === "Perdido").length,
      negociacao: sales.filter((item) => item.status === "Em Negociacao").length
    };

    return res.json({
      sales,
      support: supportFiltered,
      distributionByTheme,
      closureProportion
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar dados consolidados." });
  }
});

router.get("/commercial/dashboard", async (_req, res) => {
  try {
    const [salesRaw, support] = await Promise.all([
      Sale.find().sort({ data: -1, createdAt: -1 }).lean(),
      Support.find().lean()
    ]);
    const range = getRangeFromQuery(_req.query);
    const sales = filterSalesByRange(filterDuplicatedLostSales(salesRaw, support), range);
    const gains = sales.filter((item) => item.status === "Ganho").length;
    const losses = sales.filter((item) => item.status === "Perdido").length;
    const negotiating = sales.filter((item) => item.status === "Em Negociacao").length;
    const reasons = sales
      .filter((item) => item.status === "Perdido")
      .reduce((acc, item) => {
        const reason = item.motivoPerda || "Sem Motivo";
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});

    return res.json({
      kpis: {
        ltvEstimado: sales
          .filter((item) => item.status === "Ganho")
          .reduce((acc, item) => acc + (item.valorContrato || 0), 0),
        taxaConversao: sales.length ? (gains / sales.length) * 100 : 0
      },
      funnel: { gains, losses, negotiating },
      lossReasons: reasons,
      sales
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar dashboard comercial." });
  }
});

router.get("/support/dashboard", async (_req, res) => {
  try {
    const supportRaw = await Support.find().sort({ createdAt: -1 }).lean();
    const range = getRangeFromQuery(_req.query);
    const support = filterSupportByRange(supportRaw, range);
    const now = new Date();
    const monthStart = range ? range.start : startOfMonth(now);
    const churnYear = Number(_req.query?.churnYear || now.getFullYear());

    const churnThisMonth = support.filter((item) => {
      if (classifySupport(item) !== "churn" || !item.dataChurn) return false;
      const churnDate = new Date(item.dataChurn);
      return churnDate >= monthStart && churnDate <= (range ? range.end : endOfMonth(now));
    });

    const cancelledClients = new Set();
    churnThisMonth.forEach((item) => cancelledClients.add(String(item.cliente || "").trim().toLowerCase()));

    const activeCount = await Client.countDocuments({ statusContrato: "cliente" });
    const churnRate = activeCount ? (cancelledClients.size / activeCount) * 100 : 0;

    const npsDocs = support.filter((item) => classifySupport(item) === "nps");
    const npsScore = computeNpsScore(npsDocs);

    const churnByMonth = Array.from({ length: 12 }, () => 0);
    const churnDetailsByMonth = Array.from({ length: 12 }, () => []);
    const churnRows = supportRaw.filter((item) => classifySupport(item) === "churn" && item.dataChurn);
    const churnNames = [...new Set(churnRows.map((item) => String(item.cliente || "").trim()).filter(Boolean))];
    const clientRows = await Client.find({ nome: { $in: churnNames } })
      .select("nome plano statusContrato")
      .lean();
    const clientByName = new Map(clientRows.map((c) => [normalizeKey(c.nome), c]));

    churnRows.forEach((item) => {
      const ref = getSaoPauloMonthYear(item.dataChurn);
      if (!ref) return;
      if (ref.year !== churnYear) return;
      const idx = ref.month - 1;
      churnByMonth[idx] += 1;
      const c = clientByName.get(normalizeKey(item.cliente)) || null;
      churnDetailsByMonth[idx].push({
        cliente: item.cliente || "",
        dataChurn: item.dataChurn,
        motivoPrincipal: item.motivoPrincipal || "Sem Motivo",
        valorPerdido: Number(item.valorPerdido || 0),
        plano: c?.plano || "",
        statusContrato: c?.statusContrato || ""
      });
    });

    const npsDistribution = {
      Promotor: npsDocs.filter((item) => item.categoriaNPS === "Promotor").length,
      Neutro: npsDocs.filter((item) => item.categoriaNPS === "Neutro").length,
      Detrator: npsDocs.filter((item) => item.categoriaNPS === "Detrator").length
    };

    let clients = [];
    try {
      clients = await listAllClientsSorted(_req.query || {});
    } catch (err) {
      console.error("[MindLaw] listAllClientsSorted:", err.message);
      clients = [];
    }

    let clientEntradaStats = { byStatus: {}, total: 0, range: null };
    try {
      clientEntradaStats = await getClientEntradaStats(_req.query || {});
    } catch (err) {
      console.error("[MindLaw] getClientEntradaStats:", err.message);
    }

    return res.json({
      kpis: {
        churnRate,
        npsScore
      },
      churnByMonth,
      churnDetailsByMonth,
      churnYear,
      npsDistribution,
      support,
      clients,
      clientEntradaStats,
      totalMrrPerdido: support
        .filter((item) => classifySupport(item) === "churn")
        .reduce((acc, item) => acc + Number(item.valorPerdido || 0), 0)
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar dashboard de suporte." });
  }
});

router.get("/logs", async (_req, res) => {
  try {
    const [salesRaw, support] = await Promise.all([
      Sale.find().sort({ createdAt: -1 }).lean(),
      Support.find().sort({ createdAt: -1 }).lean()
    ]);
    const range = getRangeFromQuery(_req.query);
    const sales = filterSalesByRange(filterDuplicatedLostSales(salesRaw, support), range);
    const supportFiltered = filterSupportByRange(support, range);

    const logs = [
      ...sales.map((item) => ({
        id: String(item._id || ""),
        origem: "comercial",
        tipo: "Comercial",
        cliente: item.cliente,
        data: item.data,
        status: item.status,
        detalhe: item.motivoPerda || "-",
        payload: {
          cliente: item.cliente,
          data: item.data,
          valorContrato: item.valorContrato || 0,
          status: item.status || "Em Negociacao",
          motivoPerda: item.motivoPerda || "Sem Motivo",
          detalhamentoTecnico: item.detalhamentoTecnico || "",
          competidor: item.competidor || ""
        }
      })),
      ...supportFiltered.map((item) => ({
        id: String(item._id || ""),
        origem: classifySupport(item),
        tipo: classifySupport(item) === "nps" ? "NPS" : "Churn",
        cliente: item.cliente,
        data: item.dataChurn || item.dataNPS || item.createdAt,
        status: classifySupport(item) === "nps" ? item.categoriaNPS || "NPS" : "Churn",
        detalhe:
          classifySupport(item) === "nps"
            ? item.comentarioNPS || "-"
            : item.motivoPrincipal || "-",
        payload:
          classifySupport(item) === "nps"
            ? {
                registerType: "nps",
                cliente: item.cliente,
                dataNPS: item.dataNPS || null,
                notaNPS: item.notaNPS ?? "",
                comentarioNPS: item.comentarioNPS || ""
              }
            : {
                registerType: "churn",
                cliente: item.cliente,
                dataChurn: item.dataChurn || null,
                valorPerdido: item.valorPerdido || 0,
                motivoPrincipal: item.motivoPrincipal || "Sem Motivo"
              }
      }))
    ].sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));

    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar logs." });
  }
});

module.exports = router;
