/**
 * Chave canônica de nome de cliente (NFD, sem acentos, espaços colapsados).
 * Usar em sync, filtros, UI e deduplicação.
 */
function normalizeClientKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

module.exports = { normalizeClientKey };
