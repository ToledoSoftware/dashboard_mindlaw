export function formatBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

export function formatPct(n: number) {
  return `${(n || 0).toFixed(1)}%`;
}
