import { getRangeFromQuery } from "../dateRange.js";
import { getCjsModels } from "../cjsModels";
import {
  classifySupport,
  extractJustificativa,
  filterSupportByRange,
  motivoExigeJustificativa
} from "./filters";

function extractNpsStructuredFields(payload: Record<string, unknown> = {}) {
  return {
    npsMelhorarExperiencia: String(payload.npsMelhorarExperiencia || payload.melhorarExperiencia || "")
      .trim()
      .slice(0, 10000),
    npsFaltouNota9: String(payload.npsFaltouNota9 || payload.faltouNota9 || "").trim().slice(0, 10000),
    npsAreasMelhorar: String(payload.npsAreasMelhorar || payload.areasMelhorar || "").trim().slice(0, 10000),
    npsExperienciaAteAqui: String(payload.npsExperienciaAteAqui || payload.experienciaAteAqui || "")
      .trim()
      .slice(0, 10000),
    npsFuncionalidadeDiaadia: String(payload.npsFuncionalidadeDiaadia || payload.funcionalidadeDiaadia || "")
      .trim()
      .slice(0, 10000),
    npsComentarioAdicional: String(payload.npsComentarioAdicional || payload.comentarioAdicional || "")
      .trim()
      .slice(0, 10000)
  };
}

export async function getSupport(query: Record<string, string | undefined>) {
  const { Support } = await getCjsModels();
  const support = await Support.find().sort({ dataChurn: -1, dataNPS: -1 }).lean();
  return { support: filterSupportByRange(support, getRangeFromQuery(query)) };
}

export async function postSupport(payload: Record<string, unknown>) {
  const { Support, ensureClientByName } = await getCjsModels();
  const justificativaMotivo = extractJustificativa(payload);
  if (motivoExigeJustificativa(payload.motivoPrincipal as string) && !justificativaMotivo) {
    return { error: "Justificativa do motivo é obrigatória para este tipo de churn.", status: 400 };
  }
  const registerType =
    (payload.registerType as string) ||
    (payload.notaNPS !== undefined && payload.notaNPS !== "" ? "nps" : "churn");
  const support = await Support.create({
    registerType,
    cliente: payload.cliente,
    valorPerdido: Number(payload.valorPerdido || 0),
    dataChurn: payload.dataChurn || null,
    motivoPrincipal: payload.motivoPrincipal || "Sem Motivo",
    funcionalidadeFaltante: justificativaMotivo,
    notaNPS:
      payload.notaNPS !== undefined && payload.notaNPS !== "" ? Number(payload.notaNPS) : undefined,
    comentarioNPS: payload.comentarioNPS || "",
    dataNPS: payload.dataNPS || null,
    telefone: String(payload.telefone || "").trim(),
    plano: String(payload.plano || "").trim()
  });
  if (registerType === "churn") {
    await ensureClientByName(payload.cliente as string, {
      statusContrato: "cancelado",
      plano: (payload.plano as string) || "",
      telefone: String(payload.telefone || "").trim(),
      dataReferencia: payload.dataChurn
    });
  } else {
    await ensureClientByName(payload.cliente as string, {
      plano: (payload.plano as string) || "",
      telefone: String(payload.telefone || "").trim(),
      dataReferencia: payload.dataNPS
    });
  }
  return { data: support, status: 201 };
}

export async function postSupportChurn(payload: Record<string, unknown>) {
  const { Support, ensureClientByName } = await getCjsModels();
  const justificativaMotivo = extractJustificativa(payload);
  if (motivoExigeJustificativa(payload.motivoPrincipal as string) && !justificativaMotivo) {
    return { error: "Justificativa do motivo é obrigatória para este tipo de churn.", status: 400 };
  }
  const support = await Support.create({
    registerType: "churn",
    cliente: payload.cliente,
    valorPerdido: Number(payload.valorPerdido || 0),
    dataChurn: payload.dataChurn || null,
    motivoPrincipal: payload.motivoPrincipal || "Sem Motivo",
    funcionalidadeFaltante: justificativaMotivo,
    telefone: String(payload.telefone || "").trim(),
    plano: String(payload.plano || "").trim()
  });
  await ensureClientByName(payload.cliente as string, {
    statusContrato: "cancelado",
    plano: (payload.plano as string) || "",
    telefone: String(payload.telefone || "").trim(),
    dataReferencia: payload.dataChurn
  });
  return { data: support, status: 201 };
}

export async function postSupportNps(payload: Record<string, unknown>) {
  const { Support, ensureClientByName } = await getCjsModels();
  const structured = extractNpsStructuredFields(payload);
  const support = await Support.create({
    registerType: "nps",
    cliente: payload.cliente,
    notaNPS: Number(payload.notaNPS),
    comentarioNPS: String(payload.comentarioNPS || "").slice(0, 10000),
    dataNPS: payload.dataNPS || null,
    telefone: String(payload.telefone || "").trim(),
    plano: String(payload.plano || "").trim(),
    ...structured
  });
  await ensureClientByName(payload.cliente as string, {
    plano: (payload.plano as string) || "",
    telefone: String(payload.telefone || "").trim(),
    dataReferencia: payload.dataNPS
  });
  return { data: support, status: 201 };
}

export async function putSupport(id: string, payload: Record<string, unknown>) {
  const { Support, ensureClientByName } = await getCjsModels();
  const support = await Support.findById(id);
  if (!support) return { error: "Registro de suporte não encontrado.", status: 404 };
  if (payload.registerType !== undefined) support.registerType = payload.registerType;
  if (payload.cliente !== undefined) support.cliente = String(payload.cliente || "").trim();
  if (payload.valorPerdido !== undefined) support.valorPerdido = Number(payload.valorPerdido || 0);
  if (payload.dataChurn !== undefined) support.dataChurn = (payload.dataChurn || null) as Date | null;
  if (payload.motivoPrincipal !== undefined) support.motivoPrincipal = (payload.motivoPrincipal || "Sem Motivo") as string;
  if (payload.justificativaMotivo !== undefined || payload.funcionalidadeFaltante !== undefined) {
    support.funcionalidadeFaltante = extractJustificativa(payload);
  }
  if (motivoExigeJustificativa(support.motivoPrincipal) && !String(support.funcionalidadeFaltante || "").trim()) {
    return { error: "Justificativa do motivo é obrigatória para este tipo de churn.", status: 400 };
  }
  if (payload.notaNPS !== undefined) {
    support.notaNPS =
      payload.notaNPS === "" || payload.notaNPS === null ? undefined : Number(payload.notaNPS);
  }
  if (payload.comentarioNPS !== undefined) support.comentarioNPS = (payload.comentarioNPS || "") as string;
  if (payload.dataNPS !== undefined) support.dataNPS = (payload.dataNPS || null) as Date | null;
  if (payload.telefone !== undefined) support.telefone = String(payload.telefone || "").trim() as string;
  if (payload.plano !== undefined) support.plano = String(payload.plano || "").trim() as string;
  if (
    payload.npsMelhorarExperiencia !== undefined ||
    payload.npsFaltouNota9 !== undefined ||
    payload.npsAreasMelhorar !== undefined ||
    payload.npsExperienciaAteAqui !== undefined ||
    payload.npsFuncionalidadeDiaadia !== undefined ||
    payload.npsComentarioAdicional !== undefined ||
    payload.melhorarExperiencia !== undefined ||
    payload.faltouNota9 !== undefined ||
    payload.areasMelhorar !== undefined ||
    payload.experienciaAteAqui !== undefined ||
    payload.funcionalidadeDiaadia !== undefined ||
    payload.comentarioAdicional !== undefined
  ) {
    const s = extractNpsStructuredFields(payload);
    support.npsMelhorarExperiencia = s.npsMelhorarExperiencia;
    support.npsFaltouNota9 = s.npsFaltouNota9;
    support.npsAreasMelhorar = s.npsAreasMelhorar;
    support.npsExperienciaAteAqui = s.npsExperienciaAteAqui;
    support.npsFuncionalidadeDiaadia = s.npsFuncionalidadeDiaadia;
    support.npsComentarioAdicional = s.npsComentarioAdicional;
  }
  await support.save();
  const extra: Record<string, unknown> = {};
  if (payload.plano !== undefined) extra.plano = String(payload.plano || "");
  if (payload.telefone !== undefined) extra.telefone = String(payload.telefone || "").trim();
  if (support.registerType === "churn") {
    await ensureClientByName(support.cliente, {
      statusContrato: "cancelado",
      dataReferencia: support.dataChurn,
      ...extra
    });
  } else {
    await ensureClientByName(support.cliente, { dataReferencia: support.dataNPS, ...extra });
  }
  return { data: support, status: 200 };
}

export async function deleteSupport(id: string) {
  const { Support, ensureClientByName } = await getCjsModels();
  const support = await Support.findById(id);
  if (!support) return { error: "Registro de suporte não encontrado.", status: 404 };
  const clientName = String(support.cliente || "").trim();
  const wasChurn = classifySupport(support.toObject()) === "churn";
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
  return { status: 200 };
}
