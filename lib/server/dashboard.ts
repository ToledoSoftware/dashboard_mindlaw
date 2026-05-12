import { getRangeFromQuery } from "../dateRange";
import { getCjsModels } from "../cjsModels";
import {
  classifySupport,
  computeNpsScore,
  endOfMonth,
  filterDuplicatedLostSales,
  filterSalesByRange,
  filterSupportByRange,
  getSaoPauloMonthYear,
  normalizeKey,
  startOfMonth
} from "./filters";

export async function getCommercialDashboard(query: Record<string, string | undefined>) {
  const { Sale, Support } = await getCjsModels();
  const [salesRaw, support] = await Promise.all([
    Sale.find().sort({ data: -1, createdAt: -1 }).lean(),
    Support.find().lean()
  ]);
  const range = getRangeFromQuery(query);
  const sales = filterSalesByRange(filterDuplicatedLostSales(salesRaw, support), range);
  const gains = sales.filter((item) => item.status === "Ganho").length;
  const losses = sales.filter((item) => item.status === "Perdido").length;
  const negotiating = sales.filter((item) => item.status === "Em Negociacao").length;
  const reasons = sales
    .filter((item) => item.status === "Perdido")
    .reduce((acc: Record<string, number>, item) => {
      const reason = (item as { motivoPerda?: string }).motivoPerda || "Sem Motivo";
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});

  return {
    kpis: {
      ltvEstimado: sales
        .filter((item) => item.status === "Ganho")
        .reduce((acc: number, item) => acc + ((item as { valorContrato?: number }).valorContrato || 0), 0),
      taxaConversao: sales.length ? (gains / sales.length) * 100 : 0
    },
    funnel: { gains, losses, negotiating },
    lossReasons: reasons,
    sales
  };
}

export async function getSupportDashboard(query: Record<string, string | undefined>) {
  const { Support, Client, deriveCategoriaNps, listAllClientsSorted, getClientEntradaStats } =
    await getCjsModels();
  const supportRaw = await Support.find().sort({ createdAt: -1 }).lean();
  const range = getRangeFromQuery(query);
  const support = filterSupportByRange(supportRaw, range);
  const now = new Date();
  const monthStart = range ? range.start : startOfMonth(now);

  const churnThisMonth = support.filter((item: Record<string, unknown>) => {
    if (classifySupport(item) !== "churn" || !item.dataChurn) return false;
    const churnDate = new Date(item.dataChurn as string);
    return churnDate >= monthStart && churnDate <= (range ? range.end : endOfMonth(now));
  });

  const cancelledClients = new Set();
  churnThisMonth.forEach((item: { cliente?: string }) =>
    cancelledClients.add(String(item.cliente || "").trim().toLowerCase())
  );

  const activeCount = await Client.countDocuments({ statusContrato: "cliente" });
  const churnRate = activeCount ? (cancelledClients.size / activeCount) * 100 : 0;

  const npsDocs = support.filter((item: Record<string, unknown>) => classifySupport(item) === "nps");
  const npsScore = computeNpsScore(npsDocs);

  const churnYear = Number(query.churnYear || now.getFullYear());

  const churnByMonth = Array.from({ length: 12 }, () => 0);
  const churnDetailsByMonth: unknown[][] = Array.from({ length: 12 }, () => []);
  const churnRows = supportRaw.filter(
    (item: Record<string, unknown>) => classifySupport(item) === "churn" && item.dataChurn
  );
  const churnNames = [...new Set(churnRows.map((item: { cliente?: string }) => String(item.cliente || "").trim()).filter(Boolean))];
  const clientRows = await Client.find({ nome: { $in: churnNames } })
    .select("nome plano statusContrato")
    .lean();
  const clientByName = new Map();
  for (const c of clientRows) {
    const key = normalizeKey(c.nome);
    if (!key) continue;
    const current = clientByName.get(key);
    if (!current) {
      clientByName.set(key, c);
      continue;
    }
    if (current.statusContrato !== "cancelado" && c.statusContrato === "cancelado") {
      clientByName.set(key, c);
    }
  }

  const churnReasonDistribution: Record<string, number> = {};
  churnRows.forEach((item: Record<string, unknown>) => {
    const ref = getSaoPauloMonthYear(item.dataChurn);
    if (!ref) return;
    if (ref.year !== churnYear) return;
    const idx = ref.month - 1;
    churnByMonth[idx] += 1;
    const reason = (item.motivoPrincipal as string) || "Sem Motivo";
    churnReasonDistribution[reason] = (churnReasonDistribution[reason] || 0) + 1;
    const c = clientByName.get(normalizeKey(item.cliente as string)) || null;
    (churnDetailsByMonth[idx] as unknown[]).push({
      cliente: item.cliente || "",
      dataChurn: item.dataChurn,
      motivoPrincipal: (item.motivoPrincipal as string) || "Sem Motivo",
      funcionalidadeFaltante: item.funcionalidadeFaltante || "",
      valorPerdido: Number(item.valorPerdido || 0),
      plano: c?.plano || "",
      statusContrato: c?.statusContrato || ""
    });
  });
  if (!Object.keys(churnReasonDistribution).length) {
    supportRaw
      .filter((item: Record<string, unknown>) => classifySupport(item) === "churn" && item.dataChurn)
      .forEach((item: Record<string, unknown>) => {
        const reason = (item.motivoPrincipal as string) || "Sem Motivo";
        churnReasonDistribution[reason] = (churnReasonDistribution[reason] || 0) + 1;
      });
  }

  const npsDistribution = {
    Promotor: npsDocs.filter((item: Record<string, unknown>) => deriveCategoriaNps(item) === "Promotor").length,
    Neutro: npsDocs.filter((item: Record<string, unknown>) => deriveCategoriaNps(item) === "Neutro").length,
    Detrator: npsDocs.filter((item: Record<string, unknown>) => deriveCategoriaNps(item) === "Detrator").length
  };

  let clients: unknown[] = [];
  try {
    clients = (await listAllClientsSorted(query)) as unknown[];
  } catch {
    clients = [];
  }

  let clientEntradaStats = { byStatus: {}, total: 0, range: null };
  try {
    clientEntradaStats = (await getClientEntradaStats(query)) as typeof clientEntradaStats;
  } catch {
    /* empty */
  }

  return {
    kpis: {
      churnRate,
      npsScore
    },
    churnByMonth,
    churnDetailsByMonth,
    churnYear,
    churnReasonDistribution,
    npsDistribution,
    support,
    clients,
    clientEntradaStats,
    totalMrrPerdido: support
      .filter((item: Record<string, unknown>) => classifySupport(item) === "churn")
      .reduce((acc: number, item: { valorPerdido?: number }) => acc + Number(item.valorPerdido || 0), 0)
  };
}

export async function getLegacyDashboard() {
  const { Sale, Support } = await getCjsModels();
  const [salesRaw, support] = await Promise.all([Sale.find().lean(), Support.find().lean()]);
  const sales = filterDuplicatedLostSales(salesRaw, support);

  const ganhos = sales.filter((s) => s.status === "Ganho");
  const perdidos = sales.filter((s) => s.status === "Perdido");
  const negociacao = sales.filter((s) => s.status === "Em Negociacao");
  const conversionRate = sales.length ? (ganhos.length / sales.length) * 100 : 0;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonthEnd = new Date(monthStart.getTime() - 1);

  const activeClientsAtMonthStart = new Set();
  sales.forEach((sale: { status?: string; data?: Date; cliente?: string }) => {
    if (!["Ganho", "Em Negociacao"].includes(sale.status || "")) return;
    const saleDate = new Date(sale.data as Date);
    if (saleDate <= prevMonthEnd) {
      activeClientsAtMonthStart.add(String(sale.cliente || "").trim().toLowerCase());
    }
  });

  const cancelledClients = new Set();
  support
    .filter((item: Record<string, unknown>) => classifySupport(item) === "churn" && item.dataChurn)
    .forEach((item: Record<string, unknown>) => {
      const churnDate = new Date(item.dataChurn as string);
      if (churnDate >= monthStart && churnDate <= endOfMonth(now)) {
        cancelledClients.add(String(item.cliente || "").trim().toLowerCase());
      }
    });

  const churnRate = activeClientsAtMonthStart.size
    ? (cancelledClients.size / activeClientsAtMonthStart.size) * 100
    : 0;

  const npsScore = computeNpsScore(support.filter((item: Record<string, unknown>) => classifySupport(item) === "nps"));

  const ltvEstimado = ganhos.reduce(
    (acc: number, item) => acc + ((item as { valorContrato?: number }).valorContrato || 0),
    0
  );

  const lossReasons = perdidos.reduce((acc: Record<string, number>, item) => {
    const reason = (item as { motivoPerda?: string }).motivoPerda || "Sem Motivo";
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  return {
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
  };
}
