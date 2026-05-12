import { getCjsModels } from "../cjsModels";

export function extractIntegrationNpsFields(payload: Record<string, unknown> = {}) {
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

export function resolveIntegrationNpsPayload(payload: Record<string, unknown> = {}) {
  const cliente = String(payload.cliente || "").trim();
  const notaRaw = payload.notaNPS ?? payload.nota;
  const notaNPS = Number(notaRaw);
  const comentarioNPS = String(payload.comentarioNPS ?? payload.comentario ?? "").trim();
  const dataRaw = payload.dataNPS ?? payload.data ?? null;
  const dataNPS = dataRaw ? new Date(dataRaw as string) : null;

  if (!cliente) {
    return { ok: false as const, error: "Cliente é obrigatório." };
  }
  if (!Number.isFinite(notaNPS) || notaNPS < 0 || notaNPS > 10) {
    return { ok: false as const, error: "Nota NPS inválida. Use valor entre 0 e 10." };
  }
  if (comentarioNPS.length > 10000) {
    return { ok: false as const, error: "Comentário NPS excede 10000 caracteres." };
  }
  if (dataRaw && (!dataNPS || Number.isNaN(dataNPS.getTime()))) {
    return { ok: false as const, error: "Data NPS inválida." };
  }

  return {
    ok: true as const,
    value: {
      cliente,
      notaNPS,
      comentarioNPS,
      dataNPS: dataNPS || null
    }
  };
}

export async function saveNpsIntegration(
  body: Record<string, unknown>,
  headers: { get(name: string): string | null }
) {
  const { Support, ensureClientByName } = await getCjsModels();
  const expectedKey = String(process.env.INTEGRATION_KEY || "").trim();
  if (!expectedKey) {
    return { error: "INTEGRATION_KEY não configurada no servidor.", status: 503 };
  }

  const providedKey = String(
    headers.get("x-integration-key") || headers.get("x-api-key") || ""
  ).trim();
  if (!providedKey || providedKey !== expectedKey) {
    return { error: "Chave de integração inválida.", status: 401 };
  }

  const parsed = resolveIntegrationNpsPayload(body);
  if (!parsed.ok) {
    return { error: parsed.error, status: 400 };
  }

  const structured = extractIntegrationNpsFields(body);

  const support = await Support.create({
    registerType: "nps",
    cliente: parsed.value.cliente,
    notaNPS: parsed.value.notaNPS,
    comentarioNPS: parsed.value.comentarioNPS,
    dataNPS: parsed.value.dataNPS,
    ...structured
  });

  await ensureClientByName(parsed.value.cliente, { plano: String(body?.plano || "").trim() });

  return { data: support, status: 201 };
}
