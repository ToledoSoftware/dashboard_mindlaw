const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const XLSX = require("xlsx");
const dotenv = require("dotenv");

const User = require("./models/User");
const Sale = require("./models/Sale");
const Support = require("./models/Support");
const Client = require("./models/Client");
const authMiddleware = require("./middleware/authMiddleware");
const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const { ensureClientByName, syncClientsFromSupport, importListaAtividadeIfNeeded } = require("./services/clientSync");

function extractIntegrationNpsFields(payload = {}) {
  return {
    npsMelhorarExperiencia: String(payload.npsMelhorarExperiencia || payload.melhorarExperiencia || "").trim().slice(0, 10000),
    npsFaltouNota9: String(payload.npsFaltouNota9 || payload.faltouNota9 || "").trim().slice(0, 10000),
    npsAreasMelhorar: String(payload.npsAreasMelhorar || payload.areasMelhorar || "").trim().slice(0, 10000),
    npsExperienciaAteAqui: String(payload.npsExperienciaAteAqui || payload.experienciaAteAqui || "").trim().slice(0, 10000),
    npsFuncionalidadeDiaadia: String(payload.npsFuncionalidadeDiaadia || payload.funcionalidadeDiaadia || "").trim().slice(0, 10000),
    npsComentarioAdicional: String(payload.npsComentarioAdicional || payload.comentarioAdicional || "").trim().slice(0, 10000)
  };
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

function resolveIntegrationNpsPayload(payload = {}) {
  const cliente = String(payload.cliente || "").trim();
  const notaRaw = payload.notaNPS ?? payload.nota;
  const notaNPS = Number(notaRaw);
  const comentarioNPS = String(payload.comentarioNPS ?? payload.comentario ?? "").trim();
  const dataRaw = payload.dataNPS ?? payload.data ?? null;
  const dataNPS = dataRaw ? new Date(dataRaw) : null;

  if (!cliente) {
    return { ok: false, error: "Cliente é obrigatório." };
  }
  if (!Number.isFinite(notaNPS) || notaNPS < 0 || notaNPS > 10) {
    return { ok: false, error: "Nota NPS inválida. Use valor entre 0 e 10." };
  }
  if (comentarioNPS.length > 10000) {
    return { ok: false, error: "Comentário NPS excede 10000 caracteres." };
  }
  if (dataRaw && Number.isNaN(dataNPS?.getTime())) {
    return { ok: false, error: "Data NPS inválida." };
  }

  return {
    ok: true,
    value: {
      cliente,
      notaNPS,
      comentarioNPS,
      dataNPS: dataNPS || null
    }
  };
}

// Rotas de API antes do static: evita qualquer ambiguidade com arquivos em /public
app.use("/api/auth", authRoutes);

// Webhook de integração (Google Apps Script, Zapier etc.) com chave fixa.
app.post("/api/integrations/nps", async (req, res) => {
  try {
    const expectedKey = String(process.env.INTEGRATION_KEY || "").trim();
    if (!expectedKey) {
      return res.status(503).json({ error: "INTEGRATION_KEY não configurada no servidor." });
    }

    const providedKey = String(req.headers["x-integration-key"] || req.headers["x-api-key"] || "").trim();
    if (!providedKey || providedKey !== expectedKey) {
      return res.status(401).json({ error: "Chave de integração inválida." });
    }

    const parsed = resolveIntegrationNpsPayload(req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const structured = extractIntegrationNpsFields(req.body || {});

    const support = await Support.create({
      registerType: "nps",
      cliente: parsed.value.cliente,
      notaNPS: parsed.value.notaNPS,
      comentarioNPS: parsed.value.comentarioNPS,
      dataNPS: parsed.value.dataNPS,
      ...structured
    });

    await ensureClientByName(parsed.value.cliente, {
      plano: String(req.body?.plano || "").trim(),
      telefone: String(req.body?.telefone || "").trim(),
      dataReferencia: parsed.value.dataNPS
    });

    return res.status(201).json({ status: "ok", data: support });
  } catch (error) {
    console.error("[MindLaw] integração nps:", error.message);
    return res.status(400).json({ error: "Falha ao salvar NPS na integração." });
  }
});

app.use("/api", apiRoutes);

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/", (_req, res) => {
  const token = _req.cookies?.mindlaw_token;
  if (!token) return res.redirect("/login");
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/export", authMiddleware, async (_req, res) => {
  try {
    const [salesRaw, supportRaw] = await Promise.all([
      Sale.find().sort({ data: -1 }).lean(),
      Support.find().sort({ createdAt: -1 }).lean()
    ]);
    const toRange = () => {
      const { month, year, startDate, endDate } = _req.query || {};
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(2000, 0, 1);
        const end = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date(2100, 0, 1);
        return { start, end };
      }
      if (month && year) {
        const m = Number(month) - 1;
        const y = Number(year);
        return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
      }
      return null;
    };
    const range = toRange();
    const inRange = (raw) => {
      if (!range) return true;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && d >= range.start && d <= range.end;
    };
    const sales = salesRaw.filter((item) => inRange(item.data));
    const support = supportRaw.filter((item) => inRange(item.dataChurn || item.dataNPS || item.createdAt));

    const churnRowsRaw = support.filter((item) => item.registerType === "churn" || (!item.registerType && item.dataChurn));
    const npsRowsRaw = support.filter((item) => item.registerType === "nps" || (!item.registerType && typeof item.notaNPS === "number"));

    const salesRows = sales.map((item) => ({
      Cliente: item.cliente,
      "Valor Contrato": item.valorContrato,
      Data: item.data ? new Date(item.data).toLocaleDateString("pt-BR") : "",
      Status: item.status,
      "Motivo de Perda": item.motivoPerda || "",
      "Detalhamento Tecnico": item.detalhamentoTecnico || "",
      Competidor: item.competidor || ""
    }));

    const supportRows = support.map((item) => ({
      Tipo: item.registerType || (typeof item.notaNPS === "number" ? "nps" : "churn"),
      Cliente: item.cliente,
      "Valor Perdido": item.valorPerdido || 0,
      "Data Churn": item.dataChurn ? new Date(item.dataChurn).toLocaleDateString("pt-BR") : "",
      "Motivo Principal": item.motivoPrincipal || "",
      "Nota NPS": item.notaNPS ?? "",
      "Categoria NPS": item.categoriaNPS || "",
      "Comentario NPS": item.comentarioNPS || "",
      "Data NPS": item.dataNPS ? new Date(item.dataNPS).toLocaleDateString("pt-BR") : ""
    }));
    const churnRows = churnRowsRaw.map((item) => ({
      Cliente: item.cliente,
      "Data do Churn": item.dataChurn ? new Date(item.dataChurn).toLocaleDateString("pt-BR") : "",
      "MRR Perdido": item.valorPerdido || 0,
      Motivo: item.motivoPrincipal || "Sem Motivo"
    }));
    const npsRows = npsRowsRaw.map((item) => ({
      Cliente: item.cliente,
      "Data da Pesquisa": item.dataNPS ? new Date(item.dataNPS).toLocaleDateString("pt-BR") : "",
      Nota: item.notaNPS ?? "",
      "Categoria NPS": item.categoriaNPS || "",
      Comentario: item.comentarioNPS || ""
    }));

    const workbook = XLSX.utils.book_new();
    const wsSales = XLSX.utils.json_to_sheet(salesRows);
    const wsSupport = XLSX.utils.json_to_sheet(supportRows);
    const wsChurn = XLSX.utils.json_to_sheet(churnRows);
    const wsNps = XLSX.utils.json_to_sheet(npsRows);
    wsSales["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 28 }, { wch: 45 }, { wch: 24 }];
    wsSupport["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 42 }, { wch: 14 }];
    wsChurn["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
    wsNps["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(workbook, wsSales, "Comercial");
    XLSX.utils.book_append_sheet(workbook, wsSupport, "Suporte");
    XLSX.utils.book_append_sheet(workbook, wsChurn, "Churn");
    XLSX.utils.book_append_sheet(workbook, wsNps, "NPS");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=MindLaw_Export.xlsx");
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: "Falha ao gerar exportacao." });
  }
});

app.use(express.static(path.join(__dirname, "public")));

async function seedDefaultUser() {
  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@mindlaw.com";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "mindlaw123";
  const exists = await User.findOne({ username });
  if (exists) return;

  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, email, password_hash: hash, role: "admin" });
  console.log(`Usuário padrão criado: ${username}`);
}

async function connectMongo() {
  if (!MONGODB_URI) {
    console.error("[MindLaw] MONGODB_URI ausente; conexão com MongoDB não será iniciada (serverless/cold start).");
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000
    });
    console.log("MongoDB conectado.");
  } catch (error) {
    console.error("[MindLaw] Falha ao conectar no MongoDB:", error.message);
    console.error("[MindLaw] Em cold start na Vercel, URI ausente ou rede indisponível não derruba o processo; novas invocações podem reconectar.");
  }
}

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.error("[MindLaw] JWT_SECRET não configurado; autenticação JWT pode falhar.");
  }

  await connectMongo();

  if (mongoose.connection.readyState !== 1) {
    console.warn("[MindLaw] Bootstrap sem MongoDB conectado; seed/sync ignorados até conexão estável.");
    return;
  }

  try {
    await seedDefaultUser();
  } catch (error) {
    console.error("[MindLaw] Aviso: seedDefaultUser:", error.message);
  }

  try {
    await Client.syncIndexes();
    console.log("Indices da colecao Client alinhados ao schema.");
  } catch (error) {
    console.error("Aviso: syncIndexes Client:", error.message);
  }

  try {
    const imp = await importListaAtividadeIfNeeded();
    if (imp.ran) console.log(`Import automatico de lista: ${imp.count} cliente(s) (${imp.reason}).`);
  } catch (error) {
    console.error("Aviso: import lista atividade:", error.message);
  }

  try {
    await syncClientsFromSupport();
    console.log("Clientes espelhados a partir de Suporte (Churn/NPS) e Comercial.");
  } catch (error) {
    console.error("Aviso: sincronizacao de clientes na subida:", error.message);
  }
}

bootstrap().catch((error) => {
  console.error("[MindLaw] Erro inesperado no bootstrap:", error.message);
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log("Rodando local"));
}

module.exports = app;
