import XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import { getRangeFromQuery } from "../dateRange";
import { getCjsModels } from "../cjsModels";
import { filterDuplicatedLostSales, filterSalesByRange, filterSupportByRange } from "./filters";

const STATUS_LABEL_PT: Record<string, string> = {
  cliente: "Cliente (ativo)",
  pagamento_pendente: "Pagamento pendente",
  pagamento_recusado: "Pagamento recusado",
  cancelado: "Cancelado",
  novo_lead: "Novo lead"
};

export type ExportSectionSelection = {
  clients: boolean;
  commercial: boolean;
  support: boolean;
};

/** Interpreta `sections` da query (ex.: `clients,commercial` ou `all`). `null` = legado: só comercial+suporte. */
export function parseExportSectionsParam(raw: string | null | undefined): ExportSectionSelection | null {
  if (raw == null || raw === "") return null;
  const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.includes("all")) return { clients: true, commercial: true, support: true };
  return {
    clients: parts.includes("clients") || parts.includes("clientes"),
    commercial: parts.includes("commercial") || parts.includes("comercial"),
    support: parts.includes("support") || parts.includes("suporte")
  };
}

export function exportFilenameForSelection(sel: ExportSectionSelection): string {
  const parts: string[] = [];
  if (sel.clients) parts.push("Clientes");
  if (sel.commercial) parts.push("Comercial");
  if (sel.support) parts.push("Suporte");
  if (parts.length === 3) return "MindLaw_Export_Completo.xlsx";
  if (parts.length === 1) return `MindLaw_${parts[0]}.xlsx`;
  return `MindLaw_${parts.join("_")}.xlsx`;
}

async function appendClientsSheetsToWorkbook(workbook: WorkBook, query: Record<string, string | undefined>) {
  const { listAllClientsSorted, getClientEntradaStats } = await getCjsModels();
  const clients = (await listAllClientsSorted(query)) as Record<string, unknown>[];
  const rows = clients.map((c) => ({
    Nome: c.nome || "",
    "E-mail": c.email || "",
    Telefone: c.telefone || "",
    Status: STATUS_LABEL_PT[c.statusContrato as string] || c.statusContrato || "",
    Plano: c.plano || "",
    "Data de referência": c.dataReferencia
      ? new Date(c.dataReferencia as string).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : ""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 36 }, { wch: 32 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, ws, "Clientes");
  let ent = { byStatus: {} as Record<string, number>, total: 0 };
  try {
    ent = (await getClientEntradaStats(query)) as typeof ent;
  } catch {
    /* empty */
  }
  const resumo = Object.keys(ent.byStatus || {})
    .sort()
    .map((k) => ({ Status: STATUS_LABEL_PT[k] || k, Quantidade: ent.byStatus[k] }));
  resumo.push({ Status: "Total (todos os status, mesmo período do filtro)", Quantidade: ent.total });
  const ws2 = XLSX.utils.json_to_sheet(resumo);
  XLSX.utils.book_append_sheet(workbook, ws2, "Resumo período");
}

type MindLawExportRows = {
  salesRows: Record<string, unknown>[];
  supportRows: Record<string, unknown>[];
  churnRows: Record<string, unknown>[];
  npsRows: Record<string, unknown>[];
};

async function loadMindLawExportRows(query: Record<string, string | undefined>): Promise<MindLawExportRows> {
  const { Sale, Support } = await getCjsModels();
  const [salesRaw, supportRaw] = await Promise.all([
    Sale.find().sort({ data: -1 }).lean(),
    Support.find().sort({ createdAt: -1 }).lean()
  ]);
  const range = getRangeFromQuery(query);
  const inRange = (raw: unknown) => {
    if (!range) return true;
    const d = new Date(raw as string);
    return !Number.isNaN(d.getTime()) && d >= range.start && d <= range.end;
  };
  const sales = filterSalesByRange(filterDuplicatedLostSales(salesRaw, supportRaw), range).filter((item: { data?: Date }) =>
    inRange(item.data)
  );
  const support = filterSupportByRange(supportRaw, range).filter((item: Record<string, unknown>) =>
    inRange(item.dataChurn || item.dataNPS || item.createdAt)
  );

  const churnRowsRaw = support.filter(
    (item: Record<string, unknown>) => item.registerType === "churn" || (!item.registerType && item.dataChurn)
  );
  const npsRowsRaw = support.filter(
    (item: Record<string, unknown>) => item.registerType === "nps" || (!item.registerType && typeof item.notaNPS === "number")
  );

  const salesRows = sales.map((item: Record<string, unknown>) => ({
    Cliente: item.cliente,
    "Valor Contrato": item.valorContrato,
    Data: item.data ? new Date(item.data as string).toLocaleDateString("pt-BR") : "",
    Status: item.status,
    "Motivo de Perda": item.motivoPerda || "",
    "Detalhamento Técnico": item.detalhamentoTecnico || "",
    Competidor: item.competidor || ""
  }));

  const supportRows = support.map((item: Record<string, unknown>) => ({
    Tipo: item.registerType || (typeof item.notaNPS === "number" ? "nps" : "churn"),
    Cliente: item.cliente,
    "Valor Perdido": item.valorPerdido || 0,
    "Data Churn": item.dataChurn ? new Date(item.dataChurn as string).toLocaleDateString("pt-BR") : "",
    "Motivo Principal": item.motivoPrincipal || "",
    "Nota NPS": item.notaNPS ?? "",
    "Categoria NPS": item.categoriaNPS || "",
    "Comentário NPS": item.comentarioNPS || "",
    "Data NPS": item.dataNPS ? new Date(item.dataNPS as string).toLocaleDateString("pt-BR") : ""
  }));
  const churnRows = churnRowsRaw.map((item: Record<string, unknown>) => ({
    Cliente: item.cliente,
    "Data do Churn": item.dataChurn ? new Date(item.dataChurn as string).toLocaleDateString("pt-BR") : "",
    "MRR Perdido": item.valorPerdido || 0,
    Motivo: item.motivoPrincipal || "Sem Motivo"
  }));
  const npsRows = npsRowsRaw.map((item: Record<string, unknown>) => ({
    Cliente: item.cliente,
    "Data da Pesquisa": item.dataNPS ? new Date(item.dataNPS as string).toLocaleDateString("pt-BR") : "",
    Nota: item.notaNPS ?? "",
    "Categoria NPS": item.categoriaNPS || "",
    Comentário: item.comentarioNPS || ""
  }));

  return { salesRows, supportRows, churnRows, npsRows };
}

function appendCommercialSheet(workbook: WorkBook, rows: Record<string, unknown>[]) {
  const wsSales = XLSX.utils.json_to_sheet(rows);
  wsSales["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 45 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, wsSales, "Comercial");
}

function appendSupportSheetsToWorkbook(workbook: WorkBook, rows: MindLawExportRows) {
  const wsSupport = XLSX.utils.json_to_sheet(rows.supportRows);
  const wsChurn = XLSX.utils.json_to_sheet(rows.churnRows);
  const wsNps = XLSX.utils.json_to_sheet(rows.npsRows);
  wsSupport["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 42 }, { wch: 14 }];
  wsChurn["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  wsNps["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(workbook, wsSupport, "Suporte");
  XLSX.utils.book_append_sheet(workbook, wsChurn, "Churn");
  XLSX.utils.book_append_sheet(workbook, wsNps, "NPS");
}

export async function exportClientsXlsx(query: Record<string, string | undefined>) {
  const workbook = XLSX.utils.book_new();
  await appendClientsSheetsToWorkbook(workbook, query);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function exportMindLawXlsx(query: Record<string, string | undefined>) {
  const workbook = XLSX.utils.book_new();
  const rows = await loadMindLawExportRows(query);
  appendCommercialSheet(workbook, rows.salesRows);
  appendSupportSheetsToWorkbook(workbook, rows);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Exportação modular: clientes, comercial e/ou suporte (Churn+NPS) no mesmo ficheiro, conforme seleção. */
export async function exportDashboardBundleXlsx(
  query: Record<string, string | undefined>,
  selection: ExportSectionSelection
) {
  if (!selection.clients && !selection.commercial && !selection.support) {
    throw new Error("Seleção de exportação vazia.");
  }
  const workbook = XLSX.utils.book_new();
  if (selection.clients) {
    await appendClientsSheetsToWorkbook(workbook, query);
  }
  if (selection.commercial || selection.support) {
    const rows = await loadMindLawExportRows(query);
    if (selection.commercial) appendCommercialSheet(workbook, rows.salesRows);
    if (selection.support) appendSupportSheetsToWorkbook(workbook, rows);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function listClients(query: Record<string, string | undefined>, forForms?: boolean) {
  const { listAllClientsSorted } = await getCjsModels();
  const q = forForms ? {} : query;
  const clients = await listAllClientsSorted(q);
  return { clients };
}

export async function createClient(payload: Record<string, unknown>) {
  const { ensureClientByName } = await getCjsModels();
  const nome = String(payload.nome || "").trim();
  if (!nome) return { error: "Nome é obrigatório.", status: 400 };
  const client = await ensureClientByName(nome, {
    telefone: payload.telefone || "",
    email: payload.email || "",
    statusContrato: payload.statusContrato,
    plano: payload.plano,
    dataReferencia: payload.dataReferencia
  });
  return { data: client, status: 201 };
}

export async function updateClient(id: string, payload: Record<string, unknown>) {
  const { Client, computeChaveUnica } = await getCjsModels();
  if (!id) return { error: "ID inválido.", status: 400 };
  const existing = await Client.findById(id);
  if (!existing) return { error: "Cliente não encontrado.", status: 404 };
  const patch: Record<string, unknown> = {};
  if (payload.nome !== undefined) {
    const nome = String(payload.nome || "").trim();
    if (!nome) return { error: "Nome é obrigatório.", status: 400 };
    patch.nome = nome;
    patch.normalizedName = nome.toLowerCase().trim().replace(/\s+/g, " ");
  }
  if (payload.telefone !== undefined) patch.telefone = String(payload.telefone || "").trim();
  if (payload.email !== undefined) patch.email = String(payload.email || "").trim().toLowerCase();
  if (payload.plano !== undefined) patch.plano = String(payload.plano || "").trim();
  if (payload.statusContrato !== undefined) patch.statusContrato = payload.statusContrato;
  if (payload.dataReferencia !== undefined) {
    patch.dataReferencia = payload.dataReferencia ? new Date(payload.dataReferencia as string) : null;
  }
  const nextNome = patch.nome !== undefined ? patch.nome : existing.nome;
  const nextEmail = patch.email !== undefined ? patch.email : existing.email;
  const nextTel = patch.telefone !== undefined ? patch.telefone : existing.telefone;
  patch.chaveUnica = computeChaveUnica(nextNome, nextEmail, nextTel);
  const updated = await Client.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
  return { data: updated, status: 200 };
}
