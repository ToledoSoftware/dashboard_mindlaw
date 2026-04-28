/**
 * Importa nomes para a coleção Client (upsert por nome normalizado).
 *
 * Uso:
 *   node scripts/import-clients.js
 *     → grava a lista embutida (clientes extraídos dos seus logs).
 *
 *   node scripts/import-clients.js caminho/para/lista.txt
 *     → um nome por linha; linhas com # são ignoradas;
 *       se a linha tiver tabulação (TSV), coluna "Cliente" após Tipo Churn/NPS/Comercial.
 *
 * Requer MONGODB_URI no .env (mesmo do app).
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { ensureClientByName } = require("../services/clientSync");

/** Clientes extraídos da tabela de logs que você enviou (Churn + NPS). */
const NOMES_EMBUTIDOS = [
  "Natalia Imbernon",
  "Alex Ponte",
  "Vitória Jéssica",
  "Brenda Mota",
  "Giovanny Navarro",
  "Silvio Lara",
  "João Carlos",
  "Ana Luiza (JRFB ADV)",
  "Albert Thales",
  "Marina Letro",
  "Diogo",
  "Lucas Barbosa",
  "Jani"
];

function parseNamesFromText(text) {
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.includes("\t")) {
      const cols = trimmed.split("\t").map((c) => c.trim());
      if (cols[0] === "Tipo") continue;
      if (cols.length >= 2 && ["Churn", "NPS", "Comercial"].includes(cols[0])) {
        if (cols[1]) names.add(cols[1]);
      }
      continue;
    }

    if (trimmed.includes(",")) {
      const first = trimmed.split(",")[0].trim();
      if (first && first.toLowerCase() !== "cliente") names.add(first);
      continue;
    }

    names.add(trimmed);
  }
  return [...names];
}

async function main() {
  const argFile = process.argv[2];
  let list;

  if (argFile) {
    const abs = path.resolve(process.cwd(), argFile);
    if (!fs.existsSync(abs)) {
      console.error(`Arquivo não encontrado: ${abs}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(abs, "utf8");
    list = parseNamesFromText(raw);
    if (!list.length) {
      console.error("Nenhum nome válido encontrado no arquivo.");
      process.exit(1);
    }
    console.log(`[import] Lendo arquivo: ${abs} (${list.length} nome(s) após deduplicar)`);
  } else {
    list = [...new Set(NOMES_EMBUTIDOS.map((n) => n.trim()).filter(Boolean))];
    console.log(`[import] Usando lista embutida (${list.length} cliente(s)).`);
  }

  if (!process.env.MONGODB_URI) {
    console.error("Defina MONGODB_URI no .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[import] MongoDB conectado.");

  let ok = 0;
  for (const nome of list) {
    try {
      await ensureClientByName(nome);
      ok += 1;
      console.log(`  + ${nome}`);
    } catch (e) {
      console.error(`  ERRO: ${nome} → ${e.message}`);
    }
  }

  await mongoose.disconnect();
  console.log(`[import] Concluído. ${ok}/${list.length} gravação(ões) OK.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
