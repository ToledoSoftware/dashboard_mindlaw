import { mapSaleStatusToClientContract } from "../clientContractStatus";
import { getRangeFromQuery } from "../dateRange.js";
import { getCjsModels } from "../cjsModels";
import { extractJustificativa, filterDuplicatedLostSales, filterSalesByRange, motivoExigeJustificativa } from "./filters";

export async function getSales(query: Record<string, string | undefined>) {
  const { Sale, Support } = await getCjsModels();
  const [salesRaw, support] = await Promise.all([
    Sale.find().sort({ data: -1, createdAt: -1 }).lean(),
    Support.find().lean()
  ]);
  const deduped = filterDuplicatedLostSales(salesRaw, support);
  return { sales: filterSalesByRange(deduped, getRangeFromQuery(query)) };
}

export async function postSale(payload: Record<string, unknown>) {
  const { Sale, ensureClientByName } = await getCjsModels();
  const justificativaMotivo = extractJustificativa(payload);
  if (motivoExigeJustificativa(payload.motivoPerda as string) && !justificativaMotivo) {
    return { error: "Justificativa do motivo é obrigatória para este tipo de perda.", status: 400 };
  }
  if (payload.registerType || payload.notaNPS !== undefined || payload.dataChurn) {
    return { error: "Payload inválido para Comercial. Use as rotas de Suporte para churn/NPS.", status: 400 };
  }
  const sale = await Sale.create({
    cliente: payload.cliente,
    valorContrato: Number(payload.valorContrato),
    data: payload.data,
    status: payload.status,
    motivoPerda: payload.motivoPerda || "Sem Motivo",
    funcionalidadeFaltante: justificativaMotivo,
    detalhamentoTecnico: payload.detalhamentoTecnico || "",
    competidor: payload.competidor || "",
    telefone: String(payload.telefone || "").trim(),
    plano: String(payload.plano || "").trim()
  });
  const statusContrato = mapSaleStatusToClientContract(payload.status as string);
  await ensureClientByName(payload.cliente as string, {
    plano: (payload.plano as string) || "",
    dataReferencia: payload.data,
    telefone: String(payload.telefone || "").trim(),
    ...(statusContrato ? { statusContrato } : { saleStatus: payload.status })
  });
  return { data: sale, status: 201 };
}

export async function putSale(id: string, payload: Record<string, unknown>) {
  const { Sale, ensureClientByName } = await getCjsModels();
  const justificativaMotivo = extractJustificativa(payload);
  const patch: Record<string, unknown> = {};
  if (payload.cliente !== undefined) patch.cliente = String(payload.cliente || "").trim();
  if (payload.valorContrato !== undefined) patch.valorContrato = Number(payload.valorContrato || 0);
  if (payload.data !== undefined) patch.data = payload.data || null;
  if (payload.status !== undefined) patch.status = payload.status;
  if (payload.motivoPerda !== undefined) patch.motivoPerda = payload.motivoPerda || "Sem Motivo";
  if (payload.justificativaMotivo !== undefined || payload.funcionalidadeFaltante !== undefined) {
    patch.funcionalidadeFaltante = justificativaMotivo;
  }
  const motivo = patch.motivoPerda !== undefined ? patch.motivoPerda : payload.motivoPerda;
  const funcVal =
    patch.funcionalidadeFaltante !== undefined ? patch.funcionalidadeFaltante : justificativaMotivo;
  if (motivoExigeJustificativa(motivo as string) && !String(funcVal || "").trim()) {
    return { error: "Justificativa do motivo é obrigatória para este tipo de perda.", status: 400 };
  }
  if (payload.detalhamentoTecnico !== undefined) patch.detalhamentoTecnico = payload.detalhamentoTecnico || "";
  if (payload.competidor !== undefined) patch.competidor = payload.competidor || "";
  if (payload.telefone !== undefined) patch.telefone = String(payload.telefone || "").trim();
  if (payload.plano !== undefined) patch.plano = String(payload.plano || "").trim();
  const updated = await Sale.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
  if (!updated) return { error: "Registro comercial não encontrado.", status: 404 };
  const extra: {
    dataReferencia: unknown;
    plano?: string;
    telefone?: string;
    statusContrato?: string;
    saleStatus?: unknown;
  } = { dataReferencia: updated.data };
  if (payload.plano !== undefined) extra.plano = String(payload.plano || "");
  if (payload.telefone !== undefined) {
    extra.telefone = String((updated as { telefone?: string }).telefone || "").trim();
  }
  const statusContrato = mapSaleStatusToClientContract(
    (payload.status !== undefined ? payload.status : updated.status) as string
  );
  if (statusContrato) extra.statusContrato = statusContrato;
  else if (payload.status !== undefined) extra.saleStatus = payload.status;
  await ensureClientByName(updated.cliente as string, extra);
  return { data: updated, status: 200 };
}

export async function deleteSale(id: string) {
  const { Sale } = await getCjsModels();
  const deleted = await Sale.findByIdAndDelete(id);
  if (!deleted) return { error: "Registro comercial não encontrado.", status: 404 };
  return { status: 200 };
}
