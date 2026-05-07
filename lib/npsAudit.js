/** Etiquetas canônicas (devem bater com o Google Forms / Apps Script). */

const NPS_LABEL_MELHORAR =
  "O que poderíamos melhorar para tornar sua experiência melhor?";
const NPS_LABEL_FALTOU =
  "O que faltou para sua experiência com o MindLaw ser nota 9 ou 10?";
const NPS_LABEL_AREAS = "Quais áreas você acredita que ainda podem melhorar?";
const NPS_LABEL_EXPERIENCIA =
  "Como tem sido sua experiência com o MindLaw até aqui?";
const NPS_LABEL_FUNCIONALIDADE =
  "Qual funcionalidade ou diferencial do MindLaw mais ajuda no seu dia a dia?";
const NPS_LABEL_ADICIONAL =
  "Gostaria de compartilhar mais algum comentário, sugestão ou experiência sobre o MindLaw?";

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Categoria NPS efetiva: usa campo salvo ou deriva da nota (corrige registros antigos sem categoriaNPS).
 */
function deriveCategoriaNps(item) {
  if (item && item.categoriaNPS) return item.categoriaNPS;
  const n = Number(item.notaNPS);
  if (!Number.isFinite(n)) return "";
  if (n >= 9) return "Promotor";
  if (n >= 7) return "Neutro";
  return "Detrator";
}

/**
 * Extrai blocos "pergunta\\nresposta" do texto legado em comentarioNPS.
 */
function parseLegacyNpsComentario(comentarioNPS) {
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
    if (nq.includes(normalizeHeader(NPS_LABEL_MELHORAR))) {
      out.melhorar = a;
    } else if (nq.includes("principal motivo")) {
      out.melhorar = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_FALTOU))) {
      out.faltouNota9 = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_AREAS))) {
      out.areas = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_EXPERIENCIA))) {
      out.experiencia = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_FUNCIONALIDADE))) {
      out.funcionalidade = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_ADICIONAL))) {
      out.adicional = a;
    }
  }
  return out;
}

/**
 * Monta objeto de colunas para exibição na auditoria (estruturado + fallback legado).
 */
function buildNpsColumnMap(doc) {
  const fromDb = {
    melhorar: String(doc.npsMelhorarExperiencia || "").trim(),
    faltouNota9: String(doc.npsFaltouNota9 || "").trim(),
    areas: String(doc.npsAreasMelhorar || "").trim(),
    experiencia: String(doc.npsExperienciaAteAqui || "").trim(),
    funcionalidade: String(doc.npsFuncionalidadeDiaadia || "").trim(),
    adicional: String(doc.npsComentarioAdicional || "").trim()
  };

  const legacy = parseLegacyNpsComentario(doc.comentarioNPS || "");
  return {
    melhorar: fromDb.melhorar || legacy.melhorar,
    faltouNota9: fromDb.faltouNota9 || legacy.faltouNota9,
    areas: fromDb.areas || legacy.areas,
    experiencia: fromDb.experiencia || legacy.experiencia,
    funcionalidade: fromDb.funcionalidade || legacy.funcionalidade,
    adicional: fromDb.adicional || legacy.adicional
  };
}

module.exports = {
  NPS_LABEL_MELHORAR,
  NPS_LABEL_FALTOU,
  NPS_LABEL_AREAS,
  NPS_LABEL_EXPERIENCIA,
  NPS_LABEL_FUNCIONALIDADE,
  NPS_LABEL_ADICIONAL,
  normalizeHeader,
  deriveCategoriaNps,
  parseLegacyNpsComentario,
  buildNpsColumnMap
};
