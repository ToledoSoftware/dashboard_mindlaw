/** Parser NPS legado (espelha `lib/npsAudit.js` — só no cliente, sem CJS). */

const NPS_LABEL_MELHORAR =
  "O que poderíamos melhorar para tornar sua experiência melhor?";
const NPS_LABEL_FALTOU = "O que faltou para sua experiência com o MindLaw ser nota 9 ou 10?";
const NPS_LABEL_AREAS = "Quais áreas você acredita que ainda podem melhorar?";
const NPS_LABEL_EXPERIENCIA = "Como tem sido sua experiência com o MindLaw até aqui?";
const NPS_LABEL_FUNCIONALIDADE =
  "Qual funcionalidade ou diferencial do MindLaw mais ajuda no seu dia a dia?";
const NPS_LABEL_ADICIONAL =
  "Gostaria de compartilhar mais algum comentário, sugestão ou experiência sobre o MindLaw?";

function normalizeHeader(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseLegacyNpsComentario(comentarioNPS: string) {
  const out = {
    melhorar: "",
    faltouNota9: "",
    areas: "",
    experiencia: "",
    funcionalidade: "",
    adicional: ""
  };
  const raw = String(comentarioNPS || "").trim();
  if (!raw) return out;

  const chunks = raw.split(/\n\n+/);
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const q = String(lines[0] || "").trim();
    const a = lines.slice(1).join("\n").trim();
    if (!q || !a) continue;
    const nq = normalizeHeader(q);
    if (
      nq.includes(normalizeHeader(NPS_LABEL_MELHORAR)) ||
      ((nq.includes("poderiamos") || nq.includes("poderamos")) && nq.includes("experiencia") && nq.includes("melhorar"))
    ) {
      out.melhorar = a;
    } else if (nq.includes("principal motivo")) {
      out.melhorar = a;
    } else if (
      nq.includes(normalizeHeader(NPS_LABEL_FALTOU)) ||
      (nq.includes("faltou") && nq.includes("nota") && nq.includes("9"))
    ) {
      out.faltouNota9 = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_AREAS)) || (nq.includes("areas") && nq.includes("melhorar"))) {
      out.areas = a;
    } else if (
      nq.includes(normalizeHeader(NPS_LABEL_EXPERIENCIA)) ||
      (nq.includes("como tem sido") && nq.includes("experiencia") && nq.includes("mindlaw")) ||
      (nq.includes("experiencia") && nq.includes("mindlaw") && nq.includes("ate aqui"))
    ) {
      out.experiencia = a;
    } else if (
      nq.includes(normalizeHeader(NPS_LABEL_FUNCIONALIDADE)) ||
      (nq.includes("funcionalidade") && nq.includes("mindlaw"))
    ) {
      out.funcionalidade = a;
    } else if (
      nq.includes(normalizeHeader(NPS_LABEL_ADICIONAL)) ||
      (nq.includes("gostaria") && nq.includes("compartilhar") && nq.includes("comentario"))
    ) {
      out.adicional = a;
    }
  }
  return out;
}

type NpsLegacyKey = "melhorar" | "faltouNota9" | "areas" | "experiencia" | "funcionalidade" | "adicional";

const NPS_QA: [string, NpsLegacyKey, string][] = [
  ["O que poderíamos melhorar para tornar sua experiência melhor?", "melhorar", "npsMelhorarExperiencia"],
  ["O que faltou para sua experiência com o MindLaw ser nota 9 ou 10?", "faltouNota9", "npsFaltouNota9"],
  ["Quais áreas você acredita que ainda podem melhorar?", "areas", "npsAreasMelhorar"],
  ["Como tem sido sua experiência com o MindLaw até aqui?", "experiencia", "npsExperienciaAteAqui"],
  ["Qual funcionalidade ou diferencial do MindLaw mais ajuda no seu dia a dia?", "funcionalidade", "npsFuncionalidadeDiaadia"],
  ["Gostaria de compartilhar mais algum comentário, sugestão ou experiência sobre o MindLaw?", "adicional", "npsComentarioAdicional"]
];

export type NpsResolvedFields = {
  npsMelhorarExperiencia: string;
  npsFaltouNota9: string;
  npsAreasMelhorar: string;
  npsExperienciaAteAqui: string;
  npsFuncionalidadeDiaadia: string;
  npsComentarioAdicional: string;
};

export function resolveNpsFieldsForEdit(item: {
  payload?: Record<string, unknown>;
  npsColunas?: Record<string, string> | null;
}): NpsResolvedFields {
  const p = item.payload || {};
  const cols = item.npsColunas || {};
  const legacy = parseLegacyNpsComentario(String(p.comentarioNPS || ""));
  const out = {} as NpsResolvedFields;
  for (const [, cKey, pKey] of NPS_QA) {
    const v =
      String(p[pKey] || "").trim() ||
      String(cols[cKey] || "").trim() ||
      String(legacy[cKey] || "").trim();
    (out as Record<string, string>)[pKey] = v;
  }
  return out;
}

export function buildLegacyCombinedComentarioFromFields(f: Partial<NpsResolvedFields>): string {
  const blocks: [string, string][] = NPS_QA.map(([q, , pk]) => [q, String((f as Record<string, string>)[pk] || "").trim()]);
  const parts: string[] = [];
  for (const [q, a] of blocks) {
    if (a) parts.push(`${q}\n${a}`);
  }
  return parts.join("\n\n").slice(0, 10000);
}

export function buildNpsRespostasDisplay(item: {
  payload?: Record<string, unknown>;
  npsColunas?: Record<string, string> | null;
}): string {
  const r = resolveNpsFieldsForEdit(item);
  const parts: string[] = [];
  for (const [pergunta, , key] of NPS_QA) {
    const a = String((r as Record<string, string>)[key] ?? "").trim();
    if (a) parts.push(`${pergunta}\n${a}`);
  }
  let out = parts.join("\n\n").trim();
  if (!out) {
    const raw = String(item.payload?.comentarioNPS ?? "").trim();
    if (raw) out = raw;
  }
  return out;
}
