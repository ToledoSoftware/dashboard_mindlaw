require("dotenv").config();
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const Client = require("../models/Client");
const { ensureClientByName } = require("../services/clientSync");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mapStatusPagamento(status) {
  const s = normalize(status);
  if (s.includes("trial")) return "cliente";
  if (s.includes("pagamento pendente")) return "pagamento_pendente";
  if (s.includes("pagamento recusado")) return "pagamento_recusado";
  if (s.includes("cancelado")) return "cancelado";
  if (
    s.includes("sem cobranca automatica") ||
    s.includes("sem cobrança automática") ||
    s === "ativo" ||
    s === "desconhecido"
  ) {
    return "cliente";
  }
  return "cliente";
}

function mapPlano(rawPlano) {
  const text = String(rawPlano || "").trim();
  const match = text.match(/^(Starter|Premium|Advanced|Beta)/i);
  if (!match) return "";
  const p = match[1].toLowerCase();
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function parseOwner(raw) {
  const text = String(raw || "").trim();
  if (!text || text === "—" || text === "-") return null;
  const match = text.match(/^(.*?)\s*\(([^,\)]+)?(?:,\s*([^\)]+))?\)\s*$/);
  if (!match) {
    return { nome: text, email: "", telefone: "" };
  }
  return {
    nome: String(match[1] || "").trim(),
    email: String(match[2] || "").trim(),
    telefone: String(match[3] || "").trim()
  };
}

function parseExcelDate(value) {
  if (typeof value !== "number") return null;
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, parsed.d);
}

async function main() {
  const filePath = process.argv[2] || "C:/mindlaw/escritorios-mindlaw.xlsx";
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  await mongoose.connect(process.env.MONGODB_URI);

  const created = [];
  const existing = [];
  const skipped = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const office = String(row[0] || "").trim();
    const owner = parseOwner(row[1]);
    const plano = mapPlano(row[2]);
    const statusContrato = mapStatusPagamento(row[4]);
    const dataReferencia = parseExcelDate(row[5]);

    if (!owner || !owner.nome) {
      skipped.push({ linha: i + 1, escritorio: office, motivo: "sem_dono" });
      continue;
    }

    const normalizedName = normalize(owner.nome);
    const already = await Client.findOne({ normalizedName }).lean();
    if (already) {
      existing.push({ nome: owner.nome, statusAtual: already.statusContrato || "", planoAtual: already.plano || "" });
      continue;
    }

    await ensureClientByName(owner.nome, {
      email: owner.email || "",
      telefone: String(owner.telefone || "").replace(/\D/g, ""),
      plano,
      statusContrato,
      dataReferencia: dataReferencia || undefined
    });

    created.push({
      nome: owner.nome,
      statusContrato,
      plano: plano || "Sem plano",
      escritorio: office
    });
  }

  await mongoose.disconnect();

  console.log(
    JSON.stringify(
      {
        arquivo: filePath,
        totalLinhas: rows.length - 1,
        criados: created.length,
        jaExistiam: existing.length,
        ignoradosSemDono: skipped.length,
        criadosDetalhes: created,
        ignoradosDetalhes: skipped
      },
      null,
      2
    )
  );
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (_e) {
    // noop
  }
  process.exit(1);
});
