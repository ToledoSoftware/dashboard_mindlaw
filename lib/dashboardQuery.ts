/** Parâmetros de consulta para filtros do dashboard (período, clientes, churn). */
export type DashboardQueryParams = {
  month?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
  clientStatus?: string;
  clientPlan?: string;
  clientSegment?: string;
  clientStage?: string;
  sortBy?: string;
  sortDir?: string;
  churnYear?: string | number;
};

export function buildDashboardQuery(p: DashboardQueryParams): string {
  const params = new URLSearchParams();
  if (p.month) params.set("month", String(p.month));
  if (p.year) params.set("year", String(p.year));
  if (p.startDate) params.set("startDate", String(p.startDate));
  if (p.endDate) params.set("endDate", String(p.endDate));
  if (p.clientStatus) params.set("clientStatus", String(p.clientStatus));
  if (p.clientPlan) params.set("clientPlan", String(p.clientPlan));
  if (p.clientSegment) params.set("clientSegment", String(p.clientSegment));
  if (p.clientStage) params.set("clientStage", String(p.clientStage));
  if (p.sortBy) params.set("sortBy", String(p.sortBy));
  if (p.sortDir) params.set("sortDir", String(p.sortDir));
  if (p.churnYear != null && p.churnYear !== "") params.set("churnYear", String(p.churnYear));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function formatLocalDateYMD(d: Date): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Converte seleção mês/ano inicial e final em startDate/endDate (inclusivo). */
export function monthRangeToDates(
  startMonth: number,
  startYear: number,
  endMonth: number,
  endYear: number
): { startDate: string; endDate: string; month: string; year: string } {
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth, 0, 23, 59, 59, 999);
  const isSingle = startMonth === endMonth && startYear === endYear;
  return {
    startDate: formatLocalDateYMD(start),
    endDate: formatLocalDateYMD(end),
    month: isSingle ? String(startMonth) : "",
    year: isSingle ? String(startYear) : ""
  };
}

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  cliente: "Cliente (ativo)",
  pagamento_pendente: "Pagamento pendente",
  pagamento_recusado: "Pagamento recusado",
  cancelado: "Cancelado",
  novo_lead: "Novo lead"
};
