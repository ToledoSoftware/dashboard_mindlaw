import { getRangeFromQuery } from "../dateRange";
import { getCjsModels } from "../cjsModels";
import {
  classifySupport,
  filterDuplicatedLostSales,
  filterSalesByRange,
  filterSupportByRange,
  formatDetalheMotivo,
  normalizeNameKey
} from "./filters";

export async function getLogs(query: Record<string, string | undefined>) {
  const { Sale, Support, Client, deriveCategoriaNps, buildNpsColumnMap } = await getCjsModels();
  const [salesRaw, support, clients] = await Promise.all([
    Sale.find().sort({ createdAt: -1 }).lean(),
    Support.find().sort({ createdAt: -1 }).lean(),
    Client.find({}).select("nome plano").lean()
  ]);
  const clientPlanByName = new Map(
    clients.map((client: { nome: string; plano?: string }) => [normalizeNameKey(client.nome), client.plano || ""])
  );
  const range = getRangeFromQuery(query);
  const sales = filterSalesByRange(filterDuplicatedLostSales(salesRaw, support), range);
  const supportFiltered = filterSupportByRange(support, range);

  const logs = [
    ...sales.map((item: Record<string, unknown>) => ({
      id: String(item._id || ""),
      origem: "comercial",
      tipo: "Comercial",
      cliente: item.cliente,
      plano: clientPlanByName.get(normalizeNameKey(item.cliente as string)) || "",
      data: item.data,
      status: item.status,
      detalhe: formatDetalheMotivo(item.motivoPerda as string, item.funcionalidadeFaltante as string),
      payload: {
        cliente: item.cliente,
        data: item.data,
        valorContrato: item.valorContrato || 0,
        status: item.status || "Em Negociacao",
        motivoPerda: item.motivoPerda || "Sem Motivo",
        funcionalidadeFaltante: item.funcionalidadeFaltante || "",
        detalhamentoTecnico: item.detalhamentoTecnico || "",
        competidor: item.competidor || ""
      }
    })),
    ...supportFiltered.map((item: Record<string, unknown>) => {
      const isNps = classifySupport(item) === "nps";
      const cat = isNps ? deriveCategoriaNps(item) : "";
      const npsCols = isNps ? buildNpsColumnMap(item) : null;
      return {
        id: String(item._id || ""),
        origem: classifySupport(item),
        tipo: isNps ? "NPS" : "Churn",
        cliente: item.cliente,
        plano: clientPlanByName.get(normalizeNameKey(item.cliente as string)) || "",
        data: item.dataChurn || item.dataNPS || item.createdAt,
        status: isNps ? cat || "NPS" : "Churn",
        detalhe: isNps
          ? item.comentarioNPS || "-"
          : formatDetalheMotivo(item.motivoPrincipal as string, item.funcionalidadeFaltante as string),
        npsNota: isNps ? item.notaNPS : null,
        npsColunas: npsCols,
        payload: isNps
          ? {
              registerType: "nps",
              cliente: item.cliente,
              dataNPS: item.dataNPS || null,
              notaNPS: item.notaNPS ?? "",
              comentarioNPS: item.comentarioNPS || "",
              npsMelhorarExperiencia: item.npsMelhorarExperiencia || "",
              npsFaltouNota9: item.npsFaltouNota9 || "",
              npsAreasMelhorar: item.npsAreasMelhorar || "",
              npsExperienciaAteAqui: item.npsExperienciaAteAqui || "",
              npsFuncionalidadeDiaadia: item.npsFuncionalidadeDiaadia || "",
              npsComentarioAdicional: item.npsComentarioAdicional || ""
            }
          : {
              registerType: "churn",
              cliente: item.cliente,
              dataChurn: item.dataChurn || null,
              valorPerdido: item.valorPerdido || 0,
              motivoPrincipal: item.motivoPrincipal || "Sem Motivo",
              funcionalidadeFaltante: item.funcionalidadeFaltante || ""
            }
      };
    })
  ].sort((a, b) => new Date((b as { data?: string }).data || 0).getTime() - new Date((a as { data?: string }).data || 0).getTime());

  return { logs };
}

export async function getDataBundle(query: Record<string, string | undefined>) {
  const { Sale, Support } = await getCjsModels();
  const [salesRaw, support] = await Promise.all([
    Sale.find().sort({ data: -1, createdAt: -1 }).lean(),
    Support.find().sort({ createdAt: -1 }).lean()
  ]);
  const range = getRangeFromQuery(query);
  const sales = filterSalesByRange(filterDuplicatedLostSales(salesRaw, support), range);
  const supportFiltered = filterSupportByRange(support, range);

  const distributionByTheme = sales
    .filter((item) => item.status === "Perdido")
    .reduce((acc: Record<string, number>, item) => {
      const reason = (item as { motivoPerda?: string }).motivoPerda || "Sem Motivo";
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});

  const closureProportion = {
    ganho: sales.filter((item) => item.status === "Ganho").length,
    perdido: sales.filter((item) => item.status === "Perdido").length,
    negociacao: sales.filter((item) => item.status === "Em Negociacao").length
  };

  return {
    sales,
    support: supportFiltered,
    distributionByTheme,
    closureProportion
  };
}
