/** Chave canônica de nome de cliente (alinhada a `lib/normalizeClientKey.js`). */
export function normalizeClientKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
