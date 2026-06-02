import { normalizeClientKey } from "@/lib/clientKey";

export function findClientNameDuplicate<T extends { nome?: string }>(rows: T[], nome: string): string | null {
  const key = normalizeClientKey(nome);
  if (!key) return null;
  const hit = rows.find((r) => normalizeClientKey(String(r.nome || "")) === key);
  return hit ? String(hit.nome || "").trim() || null : null;
}
