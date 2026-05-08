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
 * Cortes do texto combinado pela ordem das perguntas no payload do Forms (mesma ordem do Apps Script).
 * Mais robusto que só blocos \n\n, especialmente para "Comentários adicionais" no fim do texto.
 */
function segmentComentarioNpsByMarkers(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const ordered = [
    ["melhorar", NPS_LABEL_MELHORAR],
    ["faltouNota9", NPS_LABEL_FALTOU],
    ["areas", NPS_LABEL_AREAS],
    ["experiencia", NPS_LABEL_EXPERIENCIA],
    ["funcionalidade", NPS_LABEL_FUNCIONALIDADE],
    ["adicional", NPS_LABEL_ADICIONAL]
  ];
  const positions = [];
  for (const [key, label] of ordered) {
    const idx = key === "adicional" ? text.lastIndexOf(label) : text.indexOf(label);
    if (idx >= 0) positions.push({ key, idx, len: label.length });
  }
  if (!positions.length) return {};
  positions.sort((a, b) => a.idx - b.idx);
  const out = {};
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx + positions[i].len;
    const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
    let val = text.slice(start, end).replace(/^[\s\n:;.,\-–—]+/u, "").trim();
    if (val) out[positions[i].key] = val;
  }
  return out;
}

/** Se o enunciado longo não bater (mojibake / edição no Forms), acha o bloco pelo gancho estável. */
function extractAdicionalFuzzy(comentarioNPS) {
  const text = String(comentarioNPS || "").replace(/\r\n/g, "\n");
  const anchors = [
    NPS_LABEL_ADICIONAL,
    "Gostaria de compartilhar mais algum comentário",
    "Gostaria de compartilhar mais algum comentario",
    "Gostaria de compartilhar"
  ];
  let startQ = -1;
  let anchorLen = 0;
  for (const a of anchors) {
    const i = text.lastIndexOf(a);
    if (i >= 0) {
      startQ = i;
      anchorLen = a.length;
      break;
    }
  }
  if (startQ < 0) return "";
  const afterAnchor = text.slice(startQ + anchorLen);
  const relQ = afterAnchor.indexOf("?");
  const bodyStart = relQ >= 0 ? startQ + anchorLen + relQ + 1 : startQ + anchorLen;
  let body = text.slice(bodyStart).replace(/^[\s\n:;.,\-–—]+/u, "").trim();
  const nextBlock = /\n\n(?=O que poderíamos|O que faltou|Quais áreas|Como tem sido|Qual funcionalidade|Gostaria de compartilhar)/;
  const cut = body.search(nextBlock);
  if (cut > 0) body = body.slice(0, cut).trim();
  return body;
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
    // Coincidência ampla com enunciados do Forms (evita falha por pequenas diferenças de texto)
    if (
      nq.includes(normalizeHeader(NPS_LABEL_MELHORAR)) ||
      ((nq.includes("poderiamos") || nq.includes("poderamos")) && nq.includes("experiencia") && nq.includes("melhorar"))
    ) {
      out.melhorar = a;
    } else if (nq.includes("principal motivo")) {
      out.melhorar = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_FALTOU)) || (nq.includes("faltou") && nq.includes("nota") && nq.includes("9"))) {
      out.faltouNota9 = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_AREAS)) || (nq.includes("areas") && nq.includes("melhorar"))) {
      out.areas = a;
    } else if (
      nq.includes(normalizeHeader(NPS_LABEL_EXPERIENCIA)) ||
      (nq.includes("como tem sido") && nq.includes("experiencia") && nq.includes("mindlaw")) ||
      (nq.includes("experiencia") && nq.includes("mindlaw") && nq.includes("ate aqui"))
    ) {
      out.experiencia = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_FUNCIONALIDADE)) || (nq.includes("funcionalidade") && nq.includes("mindlaw"))) {
      out.funcionalidade = a;
    } else if (nq.includes(normalizeHeader(NPS_LABEL_ADICIONAL)) || (nq.includes("gostaria") && nq.includes("compartilhar") && nq.includes("comentario"))) {
      out.adicional = a;
    }
  }
  return out;
}

/** Resposta tipo "última pergunta" quando o aluno escreve "Sugestão: ..." sem o enunciado Gostaria no texto salvo. */
function extractSugestaoBlock(raw) {
  const t = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  const idx = t.lastIndexOf("\nSugestão:");
  if (idx >= 0) return t.slice(idx + 1).trim();
  const idxSp = t.lastIndexOf("\nSugestão :");
  if (idxSp >= 0) return t.slice(idxSp + 1).trim();
  if (/^\s*Sugestão\s*:/i.test(t)) return t;
  const j = t.search(/(^|\n)\s*Sugestão\s*:/i);
  if (j >= 0)   return t.slice(j).replace(/^\s*\n*/, "").trim();
  return "";
}

/**
 * Extrai só a resposta à pergunta de experiência (texto entre o enunciado e a próxima pergunta / Sugestão).
 * Usado quando a segmentação coloca o bloco inteiro errado em `experiencia`.
 */
function extractExperienciaRespostaFromRaw(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const label = NPS_LABEL_EXPERIENCIA;
  const i = text.indexOf(label);
  if (i < 0) return "";
  let body = text.slice(i + label.length);
  body = body.replace(/^[\s?:\u2013\u2014\-]+/u, "").replace(/^\n+/, "").trim();
  if (!body) return "";
  if (/^Sugestão\s*:/i.test(body)) return "";
  const stopAt = body.search(
    /\n\s*(?=Qual funcionalidade|Gostaria de compartilhar|Sugestão\s*:)/i
  );
  if (stopAt >= 0) body = body.slice(0, stopAt).trim();
  const sameLineFix = body.match(/^(.*?)(\s+Sugestão\s*:.*)$/is);
  if (sameLineFix && sameLineFix[1]) {
    const head = sameLineFix[1].trim();
    if (head && !/^Sugestão\s*:/i.test(head)) return head;
  }
  if (/^Sugestão\s*:/i.test(body)) return "";
  return body.trim();
}

/**
 * Quando faltam marcadores no meio do `comentarioNPS`, o segmentador coloca texto da última
 * pergunta (ou da funcionalidade) dentro de `experiencia`. Redistribui para as chaves corretas.
 */
function rebalanceNpsColumnMap(cols, rawCom) {
  const raw = String(rawCom || "");
  let exp = String(cols.experiencia || "").trim();
  let func = String(cols.funcionalidade || "").trim();
  let ad = String(cols.adicional || "").trim();

  if (!func && exp.includes(NPS_LABEL_FUNCIONALIDADE)) {
    const i = exp.indexOf(NPS_LABEL_FUNCIONALIDADE);
    const before = exp.slice(0, i).replace(/\s+$/, "").trim();
    let after = exp.slice(i + NPS_LABEL_FUNCIONALIDADE.length).replace(/^[\s:?\n]+/, "").trim();
    const gIdx = after.search(/\n\nGostaria de compartilhar/i);
    if (gIdx >= 0) {
      const tail = after.slice(gIdx).trim();
      after = after.slice(0, gIdx).trim();
      if (tail) ad = ad ? `${ad}\n\n${tail}` : tail;
    }
    const sIdx = after.search(/\n\s*Sugestão\s*:/i);
    if (sIdx >= 0) {
      const st = after.slice(sIdx).trim();
      after = after.slice(0, sIdx).trim();
      if (st) ad = ad ? `${ad}\n\n${st}` : st;
    }
    func = after.trim();
    exp = before;
  }

  const sugInExp = exp.search(/\n\s*Sugestão\s*:/i);
  if (sugInExp >= 0) {
    const tail = exp.slice(sugInExp).replace(/^\s*\n*/, "").trim();
    exp = exp.slice(0, sugInExp).trim();
    if (tail) ad = ad ? `${ad}\n\n${tail}` : tail;
  }
  const oneLineSug = exp.match(/^([\s\S]*?)(\s+Sugestão\s*:[\s\S]*)$/i);
  if (oneLineSug && oneLineSug[2]) {
    exp = oneLineSug[1].trim();
    const tail = oneLineSug[2].trim();
    if (tail) ad = ad ? `${ad}\n\n${tail}` : tail;
  }
  if (/^\s*Sugestão\s*:/i.test(exp)) {
    ad = ad ? `${ad}\n\n${exp.trim()}` : exp.trim();
    exp = "";
  }

  if (!ad) {
    ad = extractAdicionalFuzzy(raw) || extractSugestaoBlock(raw) || "";
  }

  if (normalizeHeader(exp) === normalizeHeader(NPS_LABEL_EXPERIENCIA)) exp = "";
  if (exp && ad && normalizeHeader(exp) === normalizeHeader(ad)) exp = "";

  if (raw) {
    const rec = extractExperienciaRespostaFromRaw(raw);
    if (rec && !/^Sugestão\s*:/i.test(rec.trim())) {
      const ne = normalizeHeader(exp);
      const nr = normalizeHeader(rec);
      const useRecover =
        !exp ||
        /^Sugestão\s*:/i.test(exp) ||
        ne === normalizeHeader(NPS_LABEL_EXPERIENCIA) ||
        (ad && (ne === normalizeHeader(ad) || exp.trim() === ad.trim()));
      if (useRecover && (!exp || ne !== nr)) exp = rec.trim();
    }
  }

  cols.experiencia = exp.trim();
  cols.funcionalidade = func.trim();
  cols.adicional = ad.trim();
  return cols;
}

/** Classifica linha que é só o enunciado de uma pergunta do Forms (texto normalizado). */
function classifyNpsQuestionLineKey(line) {
  const t = normalizeHeader(line);
  if (!t) return null;
  if (t.includes("gostaria") && t.includes("compartilhar")) return "adicional";
  if (t.includes("qual funcionalidade") && t.includes("mindlaw")) return "funcionalidade";
  if (t.includes("como tem sido") && t.includes("mindlaw")) return "experiencia";
  if (t.includes("quais areas") && t.includes("melhorar")) return "areas";
  if (t.includes("o que faltou") && t.includes("9 ou 10")) return "faltouNota9";
  if ((t.includes("o que poderiamos") || t.includes("o que poderamos")) && t.includes("melhorar")) return "melhorar";
  if (t.includes("principal motivo") && t.includes("nota")) return "melhorar";
  return null;
}

/**
 * Extrai respostas do texto `comentarioNPS` por blocos linha-a-linha (robusto quando \\n\\n falha ou o enunciado difere ligeiramente).
 */
function parseNpsFormBlocksFromRaw(raw) {
  const out = {
    melhorar: "",
    faltouNota9: "",
    areas: "",
    experiencia: "",
    funcionalidade: "",
    adicional: ""
  };
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return out;
  const lines = text.split("\n");
  let cur = null;
  const buf = [];
  const flush = () => {
    if (!cur || !buf.length) return;
    const s = buf.join("\n").trim();
    if (s && !out[cur]) out[cur] = s;
    buf.length = 0;
  };
  const assignVal = (key, val) => {
    const s = String(val || "").trim();
    if (s && !out[key]) out[key] = s;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const same = line.match(/^(.+?\?|.+?？)\s+(.+)$/);
    if (same) {
      const qk = classifyNpsQuestionLineKey(same[1]);
      if (qk && String(same[2]).trim()) {
        flush();
        assignVal(qk, same[2]);
        cur = null;
        continue;
      }
    }
    const nk = classifyNpsQuestionLineKey(line);
    if (nk) {
      flush();
      cur = nk;
    } else if (cur) {
      buf.push(line);
    }
  }
  flush();
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

  const rawCom = doc.comentarioNPS || "";
  const legacy = parseLegacyNpsComentario(rawCom);
  const segmented = segmentComentarioNpsByMarkers(rawCom);
  const hasAdicionalFromSources = !!(fromDb.adicional || legacy.adicional || segmented.adicional);
  const fuzzyAdicional = hasAdicionalFromSources ? "" : extractAdicionalFuzzy(rawCom) || extractSugestaoBlock(rawCom);

  const merged = {
    melhorar: fromDb.melhorar || legacy.melhorar || segmented.melhorar || "",
    faltouNota9: fromDb.faltouNota9 || legacy.faltouNota9 || segmented.faltouNota9 || "",
    areas: fromDb.areas || legacy.areas || segmented.areas || "",
    experiencia: fromDb.experiencia || legacy.experiencia || segmented.experiencia || "",
    funcionalidade: fromDb.funcionalidade || legacy.funcionalidade || segmented.funcionalidade || "",
    adicional: fromDb.adicional || legacy.adicional || segmented.adicional || fuzzyAdicional || ""
  };
  rebalanceNpsColumnMap(merged, rawCom);
  const lineBlocks = parseNpsFormBlocksFromRaw(rawCom);
  for (const k of ["melhorar", "faltouNota9", "areas", "experiencia", "funcionalidade", "adicional"]) {
    if (!String(merged[k] || "").trim() && String(lineBlocks[k] || "").trim()) merged[k] = lineBlocks[k].trim();
  }
  return merged;
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
  segmentComentarioNpsByMarkers,
  extractAdicionalFuzzy,
  buildNpsColumnMap
};
