/**
 * Converte texto de situação (plano/status do negócio) para enum do modelo Client.
 */
function mapSituacaoParaStatus(situacao) {
  const x = String(situacao || "")
    .trim()
    .toLowerCase();
  if (x.includes("cancelado")) return "cancelado";
  if (x.includes("pagamento pendente") || x === "pendente") return "pagamento_pendente";
  if (x.includes("pagamento recusado") || x.includes("recusado")) return "pagamento_recusado";
  if (x === "ativo") return "cliente";
  // "Sem cobrança automática" = PIX/boleto etc.; é cliente ativo, não lead/trial
  if (x.includes("cobranca automática") || x.includes("cobrança automática") || x.includes("cobranca automatica") || x.includes("cobrança automatica")) {
    if (x.includes("sem ")) return "cliente";
  }
  if (x.includes("trial") || x.includes("demonstr") || x.includes("teste gratuito") || x.includes("periodo de teste") || (x.includes("novo") && x.includes("lead"))) {
    return "novo_lead";
  }
  return "cliente";
}

function parseDataBR(s) {
  const m = String(s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parseia blocos: Nome, email, telefone, dd/mm/aaaa, Plano, Situação (uma linha cada).
 */
function parseBlocosCliente(raw) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.includes("@") && !/^(Starter|Premium|Advanced)$/i.test(line)) {
      const nome = i > 0 ? lines[i - 1] : "";
      const email = line;
      const telefone = lines[i + 1] || "";
      const dataStr = lines[i + 2] || "";
      const plano = lines[i + 3] || "";
      const situacao = lines[i + 4] || "";
      if (nome && email) {
        records.push({
          nome,
          email,
          telefone: telefone === "—" || telefone === "-" ? "" : telefone,
          dataReferencia: parseDataBR(dataStr),
          plano: String(plano || "").trim(),
          situacao: String(situacao || "").trim(),
          statusContrato: mapSituacaoParaStatus(situacao)
        });
      }
      i += 4;
    }
  }
  return records;
}

module.exports = { mapSituacaoParaStatus, parseDataBR, parseBlocosCliente };
