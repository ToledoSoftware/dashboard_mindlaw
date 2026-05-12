import { normalizeText } from "@/lib/stringUtils";

export function getElapsedMonthsSince(cadastroDate: string | Date | null | undefined): number | null {
  if (!cadastroDate) return null;
  const start = new Date(cadastroDate);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  if (now <= start) return 0;
  let monthDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) monthDiff -= 1;
  return Math.max(0, monthDiff);
}

export function getClienteEtapaMes(cadastroDate: string | Date | null | undefined): number | null {
  const elapsedMonths = getElapsedMonthsSince(cadastroDate);
  if (elapsedMonths === null) return null;
  return elapsedMonths + 1;
}

export function formatClientTenure(cadastroDate: string | Date | null | undefined): string {
  const elapsedMonths = getElapsedMonthsSince(cadastroDate);
  if (elapsedMonths === null) return "Mês 1";
  if (elapsedMonths < 12) return `Mês ${elapsedMonths + 1}`;
  const years = Math.floor(elapsedMonths / 12);
  const months = elapsedMonths % 12;
  if (!months) return `${years} ano${years > 1 ? "s" : ""}`;
  return `${years} ano${years > 1 ? "s" : ""} e ${months} ${months === 1 ? "mês" : "meses"}`;
}

export function getClientStageBaseDate(client: { dataReferencia?: string | Date; createdAt?: string | Date }) {
  return client?.dataReferencia || client?.createdAt || null;
}

export function buildClientPlanStats(
  clients: { plano?: string }[]
): Record<string, number> {
  const byPlan: Record<string, number> = {};
  for (const c of clients || []) {
    const raw = normalizeText(c?.plano || "");
    let key = "sem_plano";
    if (raw.includes("starter")) key = "starter";
    else if (raw.includes("premium")) key = "premium";
    else if (raw.includes("advanced")) key = "advanced";
    else if (raw) key = "outros";
    byPlan[key] = (byPlan[key] || 0) + 1;
  }
  return byPlan;
}

export function buildClientStageStats(
  clients: { statusContrato?: string; dataReferencia?: string | Date; createdAt?: string | Date }[]
): Map<number, number> {
  const byStage = new Map<number, number>();
  for (const client of clients || []) {
    if (String(client?.statusContrato || "") !== "cliente") continue;
    const stage = getClienteEtapaMes(getClientStageBaseDate(client));
    if (!stage) continue;
    const normalizedStage = stage >= 12 ? 12 : stage;
    byStage.set(normalizedStage, (byStage.get(normalizedStage) || 0) + 1);
  }
  return byStage;
}
