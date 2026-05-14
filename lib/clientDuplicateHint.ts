import { normalizeText } from "@/lib/stringUtils";

export function findClientNameDuplicate<T extends { nome?: string }>(rows: T[], nome: string): string | null {
  const key = normalizeText(nome);
  if (!key) return null;
  const hit = rows.find((r) => normalizeText(String(r.nome || "")) === key);
  return hit ? String(hit.nome || "").trim() || null : null;
}
