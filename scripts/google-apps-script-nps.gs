/**
 * Integração Google Forms/Sheets -> MindLaw NPS
 *
 * COMO USAR:
 * 1) No Apps Script, crie as Script Properties:
 *    - MINDLAW_API_URL         = https://dashboard-mindlaw.vercel.app/api/integrations/nps
 *    - MINDLAW_INTEGRATION_KEY = <sua chave do Vercel INTEGRATION_KEY>
 *
 *    Opcional (modo legado):
 *    - MINDLAW_TOKEN = <seu bearer token>
 *
 * 2) Crie gatilho:
 *    - Função: onFormSubmit
 *    - Evento: Ao enviar formulário (da planilha)
 *
 * 3) Para importar respostas antigas:
 *    - Rode manualmente backfillExistingResponses()
 */

function onFormSubmit(e) {
  try {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    const cfg = getConfig_();
    const row = parseRow_(e);

    if (!row.notaNPS && row.notaNPS !== 0) {
      throw new Error("notaNPS não encontrada na resposta.");
    }
    if (row.notaNPS < 0 || row.notaNPS > 10) {
      throw new Error("notaNPS fora do intervalo 0-10.");
    }

    const dedupeKey = buildDedupeKey_(row);
    if (alreadyProcessed_(dedupeKey)) {
      Logger.log("Resposta já processada. Key: " + dedupeKey);
      return;
    }

    const payload = {
      cliente: row.cliente,
      notaNPS: row.notaNPS,
      comentarioNPS: row.comentarioNPS || "",
      dataNPS: row.dataNPS,
      npsMelhorarExperiencia: row.npsMelhorarExperiencia || "",
      npsFaltouNota9: row.npsFaltouNota9 || "",
      npsAreasMelhorar: row.npsAreasMelhorar || "",
      npsExperienciaAteAqui: row.npsExperienciaAteAqui || "",
      npsFuncionalidadeDiaadia: row.npsFuncionalidadeDiaadia || "",
      npsComentarioAdicional: row.npsComentarioAdicional || "",
      nota: row.notaNPS,
      comentario: row.comentarioNPS || "",
      data: row.dataNPS
    };

    const apiResult = sendNpsWithFallback_(cfg, payload);
    const status = apiResult.status;
    const body = apiResult.body;
    Logger.log("Payload enviado: " + JSON.stringify(payload));
    Logger.log("Endpoint utilizado: " + apiResult.url);
    Logger.log("Resposta API: " + status + " | " + body);

    if (status < 200 || status >= 300) {
      throw new Error("Falha API (" + status + "): " + body);
    }

    markProcessed_(dedupeKey);
    Logger.log("NPS enviado com sucesso.");
  } catch (err) {
    Logger.log("Erro onFormSubmit: " + (err && err.message ? err.message : err));
    throw err;
  }
}

function sendNpsWithFallback_(cfg, payload) {
  const primary = postJson_(cfg.apiUrl, cfg.token, payload);
  Logger.log("Tentativa primária: " + primary.url + " -> " + primary.status);
  if (primary.status >= 200 && primary.status < 300) return primary;

  const normalized = String(cfg.apiUrl || "").replace(/\/+$/, "");
  const canTryFallback = normalized.endsWith("/api/support/nps");
  if (!canTryFallback) return primary;

  const fallbackUrl = normalized.replace(/\/api\/support\/nps$/, "/api/support");
  const fallbackPayload = {
    registerType: "nps",
    cliente: payload.cliente,
    notaNPS: payload.notaNPS,
    comentarioNPS: payload.comentarioNPS || "",
    dataNPS: payload.dataNPS || null,
    npsMelhorarExperiencia: payload.npsMelhorarExperiencia || "",
    npsFaltouNota9: payload.npsFaltouNota9 || "",
    npsAreasMelhorar: payload.npsAreasMelhorar || "",
    npsExperienciaAteAqui: payload.npsExperienciaAteAqui || "",
    npsFuncionalidadeDiaadia: payload.npsFuncionalidadeDiaadia || "",
    npsComentarioAdicional: payload.npsComentarioAdicional || ""
  };
  const fallback = postJson_(fallbackUrl, cfg.token, fallbackPayload);
  Logger.log("Tentativa fallback: " + fallback.url + " -> " + fallback.status);
  if (fallback.status >= 200 && fallback.status < 300) return fallback;

  return primary;
}

function postJson_(url, token, payload) {
  const cfg = getConfig_();
  const headers = {};
  if (cfg.integrationKey) {
    headers["x-integration-key"] = cfg.integrationKey;
  } else if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  return {
    url,
    status: response.getResponseCode(),
    body: response.getContentText()
  };
}

function backfillExistingResponses() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Respostas ao formulário 1");
  if (!sheet) throw new Error("Aba 'Respostas ao formulário 1' não encontrada.");

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0].map((h) => String(h || "").trim());
  let ok = 0;
  let fail = 0;

  for (let i = 1; i < values.length; i++) {
    try {
      const row = values[i];
      const namedValues = {};
      headers.forEach((h, idx) => {
        namedValues[h] = [row[idx]];
      });

      onFormSubmit({ namedValues });
      ok += 1;
    } catch (err) {
      fail += 1;
      Logger.log("Linha " + (i + 1) + " com erro: " + (err && err.message ? err.message : err));
    }
  }

  Logger.log("Backfill finalizado. Sucesso: " + ok + " | Erros: " + fail);
}

function parseRow_(e) {
  const named = (e && e.namedValues) ? e.namedValues : {};
  const get = (possibleKeys) => {
    for (const key of possibleKeys) {
      if (Object.prototype.hasOwnProperty.call(named, key)) {
        const arr = named[key];
        return Array.isArray(arr) ? arr[0] : arr;
      }
    }
    // fallback por similaridade de texto do cabeçalho
    for (const key of possibleKeys) {
      const fuzzy = getByApproxHeader_(named, key);
      if (fuzzy !== "") return fuzzy;
    }
    return "";
  };

  const timestampRaw = get([
    "Carimbo de data/hora"
  ]);

  const email = String(get([
    "Endereço de e-mail",
    "Endere�o de e-mail"
  ]) || "").trim();

  const nomeRespondente = String(get([
    "Nome",
    "Seu nome",
    "Qual seu nome?"
  ]) || "").trim();

  const notaRaw = get([
    "De 0 a 10, o quanto você indicaria o MindLaw para outro advogado ou escritório?",
    "De 0 a 10, o quanto voc� indicaria o MindLaw para outro advogado ou escrit�rio?"
  ]);

  const feedbackDetalhado = buildStructuredNpsPayload_(get);
  const notaNPS = parseNpsScore_(notaRaw);
  if (!Number.isFinite(notaNPS)) {
    throw new Error("Nota NPS inválida: " + notaRaw);
  }

  const notaAjustada = Math.max(0, Math.min(10, notaNPS));
  const emailLocalPart = email.includes("@") ? email.split("@")[0] : "";
  const clienteBase = nomeRespondente || emailLocalPart || "Cliente sem identificação";
  const cliente = clienteBase.slice(0, 120);
  const comentarioNPS = feedbackDetalhado.comentarioNPS;
  const dataNPS = toIsoDate_(timestampRaw);

  return {
    timestampRaw: String(timestampRaw || "").trim(),
    email,
    cliente,
    notaNPS: notaAjustada,
    comentarioNPS,
    dataNPS,
    npsMelhorarExperiencia: feedbackDetalhado.npsMelhorarExperiencia,
    npsFaltouNota9: feedbackDetalhado.npsFaltouNota9,
    npsAreasMelhorar: feedbackDetalhado.npsAreasMelhorar,
    npsExperienciaAteAqui: feedbackDetalhado.npsExperienciaAteAqui,
    npsFuncionalidadeDiaadia: feedbackDetalhado.npsFuncionalidadeDiaadia,
    npsComentarioAdicional: feedbackDetalhado.npsComentarioAdicional
  };
}

/** Colunas alinhadas ao formulário: ramificação por nota + colunas fixas. */
function buildStructuredNpsPayload_(get) {
  const Q_MELHORAR = [
    "O que poderíamos melhorar para tornar sua experiência melhor?",
    "O que poder�amos melhorar para tornar sua experi�ncia melhor?"
  ];
  const Q_FALTOU = [
    "O que faltou para sua experiência com o MindLaw ser nota 9 ou 10?",
    "O que faltou para sua experi�ncia com o MindLaw ser nota 9 ou 10?"
  ];
  const Q_AREAS = [
    "Quais áreas você acredita que ainda podem melhorar?",
    "Quais �reas voc� acredita que ainda podem melhorar?"
  ];
  const Q_EXP = [
    "Como tem sido sua experiência com o MindLaw até aqui?",
    "Como tem sido sua experi�ncia com o MindLaw at� aqui?"
  ];
  const Q_FUNC = [
    "Qual funcionalidade ou diferencial do MindLaw mais ajuda no seu dia a dia?"
  ];
  const Q_EXTRA = [
    "Gostaria de compartilhar mais algum comentário, sugestão ou experiência sobre o MindLaw?",
    "Gostaria de compartilhar mais algum coment�rio, sugest�o ou experi�ncia sobre o MindLaw?"
  ];

  let npsMelhorarExperiencia = trimStr_(get(Q_MELHORAR));
  const npsFaltouNota9 = trimStr_(get(Q_FALTOU));
  const npsAreasMelhorar = trimStr_(get(Q_AREAS));
  const npsExperienciaAteAqui = trimStr_(get(Q_EXP));
  const npsFuncionalidadeDiaadia = trimStr_(get(Q_FUNC));
  const npsComentarioAdicional = trimStr_(get(Q_EXTRA));

  if (!npsMelhorarExperiencia) {
    npsMelhorarExperiencia = trimStr_(get(["Qual foi o principal motivo da sua nota?"]));
  }

  const comentarioNPS = buildLegacyCombinedComentario_({
    npsMelhorarExperiencia: npsMelhorarExperiencia,
    npsFaltouNota9: npsFaltouNota9,
    npsAreasMelhorar: npsAreasMelhorar,
    npsExperienciaAteAqui: npsExperienciaAteAqui,
    npsFuncionalidadeDiaadia: npsFuncionalidadeDiaadia,
    npsComentarioAdicional: npsComentarioAdicional
  });

  return {
    npsMelhorarExperiencia: npsMelhorarExperiencia.slice(0, 2000),
    npsFaltouNota9: npsFaltouNota9.slice(0, 2000),
    npsAreasMelhorar: npsAreasMelhorar.slice(0, 2000),
    npsExperienciaAteAqui: npsExperienciaAteAqui.slice(0, 2000),
    npsFuncionalidadeDiaadia: npsFuncionalidadeDiaadia.slice(0, 2000),
    npsComentarioAdicional: npsComentarioAdicional.slice(0, 2000),
    comentarioNPS: comentarioNPS.slice(0, 2000)
  };
}

function trimStr_(v) {
  return String(v || "").trim();
}

function buildLegacyCombinedComentario_(cols) {
  const blocks = [
    ["O que poderíamos melhorar para tornar sua experiência melhor?", cols.npsMelhorarExperiencia],
    ["O que faltou para sua experiência com o MindLaw ser nota 9 ou 10?", cols.npsFaltouNota9],
    ["Quais áreas você acredita que ainda podem melhorar?", cols.npsAreasMelhorar],
    ["Como tem sido sua experiência com o MindLaw até aqui?", cols.npsExperienciaAteAqui],
    ["Qual funcionalidade ou diferencial do MindLaw mais ajuda no seu dia a dia?", cols.npsFuncionalidadeDiaadia],
    ["Gostaria de compartilhar mais algum comentário, sugestão ou experiência sobre o MindLaw?", cols.npsComentarioAdicional]
  ];
  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    const q = blocks[i][0];
    const a = String(blocks[i][1] || "").trim();
    if (a) parts.push(q + "\n" + a);
  }
  return parts.join("\n\n");
}

function normalizeHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getByApproxHeader_(namedValues, expectedHeader) {
  const expected = normalizeHeader_(expectedHeader);
  const allKeys = Object.keys(namedValues || {});
  for (const realKey of allKeys) {
    const normalizedKey = normalizeHeader_(realKey);
    // match por inclusão para tolerar pequenas edições de enunciado no Forms
    if (normalizedKey.includes(expected) || expected.includes(normalizedKey)) {
      const arr = namedValues[realKey];
      return Array.isArray(arr) ? arr[0] : arr;
    }
  }
  return "";
}

function parseNpsScore_(value) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  const direct = Number(raw.replace(",", "."));
  if (Number.isFinite(direct)) return direct;
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return NaN;
  return Number(String(match[0]).replace(",", "."));
}

function toIsoDate_(value) {
  const date = value ? new Date(value) : new Date();
  if (isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return Utilities.formatDate(date, Session.getScriptTimeZone() || "America/Sao_Paulo", "yyyy-MM-dd");
}

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const apiUrl = String(props.getProperty("MINDLAW_API_URL") || "https://dashboard-mindlaw.vercel.app/api/integrations/nps").trim();
  const token = String(props.getProperty("MINDLAW_TOKEN") || "").trim();
  const integrationKey = String(props.getProperty("MINDLAW_INTEGRATION_KEY") || "").trim();

  if (!apiUrl) throw new Error("Propriedade MINDLAW_API_URL não configurada.");
  if (!integrationKey && !token) {
    throw new Error("Configure MINDLAW_INTEGRATION_KEY (recomendado) ou MINDLAW_TOKEN.");
  }

  return { apiUrl, token, integrationKey };
}

function buildDedupeKey_(row) {
  return [
    row.timestampRaw || row.dataNPS,
    row.email || row.cliente,
    String(row.notaNPS)
  ].join("|");
}

function alreadyProcessed_(key) {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("NPS_SYNC_" + key) === "1";
}

function markProcessed_(key) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("NPS_SYNC_" + key, "1");
}

function backfillExistingResponsesForce() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all)
    .filter((k) => k.indexOf("NPS_SYNC_") === 0)
    .forEach((k) => props.deleteProperty(k));

  Logger.log("Chaves de deduplicação limpas. Reprocessando respostas...");
  backfillExistingResponses();
}
