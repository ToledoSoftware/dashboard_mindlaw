/**
 * Converte mês/ano ou intervalo (startDate/endDate) em intervalo { start, end }.
 */
function getRangeFromQuery(query) {
  const { month, year, startDate, endDate } = query || {};
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : new Date(2000, 0, 1);
    const end = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date(2100, 0, 1);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) return { start, end };
  }
  if (month && year) {
    const m = Number(month) - 1;
    const y = Number(year);
    if (!Number.isNaN(m) && !Number.isNaN(y) && m >= 0 && m <= 11) {
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
    }
  }
  return null;
}

module.exports = { getRangeFromQuery };
