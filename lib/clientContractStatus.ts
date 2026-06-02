import { CLIENT_STATUS_LABELS } from "@/lib/dashboardQuery";

/** Status da venda comercial → enum `Client.statusContrato` (espelha `mapComercialStatusParaStatus`). */
export function mapSaleStatusToClientContract(saleStatus: string | undefined | null): string | null {
  const s = String(saleStatus || "").trim();
  if (s === "Ganho") return "cliente";
  if (s === "Em Negociacao" || s === "Perdido") return "novo_lead";
  return null;
}

/** Rótulo PT do `statusContrato` (mesmo texto da listagem de clientes). */
export function clientContractStatusLabel(status: string | undefined | null): string {
  const k = String(status || "").trim();
  if (!k) return "Sem cadastro";
  return CLIENT_STATUS_LABELS[k] || k;
}

/** Classes Tailwind do chip de status (alinhado à listagem em `ClientsPanel`). */
export function clientContractStatusChipClass(st: string | undefined | null): string {
  switch (String(st || "").trim()) {
    case "cliente":
      return "border border-emerald-400/50 bg-emerald-500/25 text-emerald-100";
    case "pagamento_pendente":
      return "border border-amber-400/50 bg-amber-500/25 text-amber-50";
    case "pagamento_recusado":
      return "border border-orange-400/50 bg-orange-600/25 text-orange-100";
    case "cancelado":
      return "border border-rose-400/50 bg-rose-500/25 text-rose-100";
    case "novo_lead":
      return "border border-sky-400/50 bg-sky-500/25 text-sky-100";
    default:
      return "border border-white/15 bg-white/10 text-mindlaw-gold";
  }
}
