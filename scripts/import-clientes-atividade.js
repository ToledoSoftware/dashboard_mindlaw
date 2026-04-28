/**
 * Importa clientes a partir de data/lista-clientes-atividade.txt (formato bloco 6 linhas).
 * Uso: npm run import:atividade
 *        node scripts/import-clientes-atividade.js [outro-arquivo.txt]
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { parseBlocosCliente } = require("../lib/mapSituacaoCliente");
const { ensureClientByName } = require("../services/clientSync");

async function main() {
  const arg = process.argv[2];
  const file = arg
    ? path.resolve(process.cwd(), arg)
    : path.join(__dirname, "..", "data", "lista-clientes-atividade.txt");
  if (!fs.existsSync(file)) {
    console.error("Arquivo não encontrado:", file);
    console.error("Gere o padrão com: node scripts/gerar-arquivo-lista-clientes.js");
    process.exit(1);
  }
  const raw = fs.readFileSync(file, "utf8");
  const records = parseBlocosCliente(raw);
  if (!records.length) {
    console.error("Nenhum registro parseado. Confira o formato (nome, email, tel, data, plano, situação).");
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error("Defina MONGODB_URI no .env");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[import-atividade] MongoDB conectado. Registros:", records.length);
  let ok = 0;
  for (const r of records) {
    try {
      await ensureClientByName(r.nome, {
        email: r.email,
        telefone: r.telefone,
        statusContrato: r.statusContrato,
        plano: r.plano,
        dataReferencia: r.dataReferencia || undefined
      });
      ok += 1;
      console.log("  +", r.nome, "|", r.statusContrato);
    } catch (e) {
      console.error("  ERRO", r.nome, e.message);
    }
  }
  await mongoose.disconnect();
  console.log("[import-atividade] OK:", ok, "/", records.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
