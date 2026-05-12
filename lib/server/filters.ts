import type { DateRange } from "../dateRange.js";

export function normalizeNameKey(value: string | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeKey(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function classifySupport(doc: Record<string, unknown>): "churn" | "nps" {
  if (doc.registerType === "churn" || doc.registerType === "nps") return doc.registerType as "churn" | "nps";
  if (typeof doc.notaNPS === "number") return "nps";
  if (doc.dataChurn) return "churn";
  return "churn";
}

export function computeNpsScore(entries: { notaNPS?: number }[]) {
  const respondents = entries.filter((item) => typeof item.notaNPS === "number");
  const total = respondents.length;
  if (!total) return 0;
  const promoters = respondents.filter((item) => (item.notaNPS as number) >= 9).length;
  const detractors = respondents.filter((item) => (item.notaNPS as number) <= 6).length;
  return ((promoters - detractors) / total) * 100;
}

export function toDateKey(value: unknown) {
  if (!value) return "";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function filterDuplicatedLostSales(
  sales: { cliente?: string; status?: string; data?: Date; valorContrato?: number }[],
  support: { cliente?: string; dataChurn?: Date }[]
) {
  const churnSetByClientDate = new Set(
    support
      .filter((item) => classifySupport(item as Record<string, unknown>) === "churn")
      .map((item) => `${normalizeKey(item.cliente)}|${toDateKey(item.dataChurn)}`)
  );

  return sales.filter((sale) => {
    if (sale.status !== "Perdido") return true;
    const saleKey = `${normalizeKey(sale.cliente)}|${toDateKey(sale.data)}`;
    const mirrored = churnSetByClientDate.has(saleKey);
    const likelyLegacyMirror = Number(sale.valorContrato || 0) === 0;
    return !(mirrored && likelyLegacyMirror);
  });
}

export function filterSalesByRange<T extends { data?: Date }>(sales: T[], range: DateRange | null) {
  if (!range) return sales;
  return sales.filter((sale) => {
    const date = new Date(sale.data as Date);
    return !Number.isNaN(date.getTime()) && date >= range.start && date <= range.end;
  });
}

export function filterSupportByRange<T extends Record<string, unknown>>(support: T[], range: DateRange | null) {
  if (!range) return support;
  return support.filter((doc) => {
    const type = classifySupport(doc);
    const rawDate = type === "churn" ? doc.dataChurn || doc.createdAt : doc.dataNPS || doc.createdAt;
    const date = new Date(rawDate as string);
    return !Number.isNaN(date.getTime()) && date >= range.start && date <= range.end;
  });
}

export function normalizeMotivo(value: string | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function motivoExigeJustificativa(value: string | undefined) {
  const key = normalizeMotivo(value);
  return key === "falta de funcionalidade" || key === "falta de integracao" || key === "outros";
}

export function formatDetalheMotivo(motivo: string | undefined, justificativa: string | undefined) {
  const motivoText = String(motivo || "").trim() || "Sem Motivo";
  const justificativaText = String(justificativa || "").trim();
  if (motivoExigeJustificativa(motivoText) && justificativaText) {
    return `${motivoText}: ${justificativaText}`;
  }
  return motivoText || "-";
}

export function extractJustificativa(payload: Record<string, unknown> = {}) {
  return String(payload.justificativaMotivo ?? payload.funcionalidadeFaltante ?? "").trim();
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function getSaoPauloMonthYear(value: unknown) {
  const dt = new Date(value as string);
  if (Number.isNaN(dt.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(dt);
  const year = Number(parts.find((p) => p.type === "year")?.value || 0);
  const month = Number(parts.find((p) => p.type === "month")?.value || 0);
  if (!year || !month) return null;
  return { year, month };
}
