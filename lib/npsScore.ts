/**
 * NPS clássico: ((% promotores 9–10) − (% detratores 0–6)) × 100, sobre respondentes com nota válida.
 */
export function calcularNpsReal(entries: { notaNPS?: number | null }[]): number {
  const respondents = entries.filter((e) => typeof e.notaNPS === "number" && !Number.isNaN(e.notaNPS as number));
  const total = respondents.length;
  if (!total) return 0;
  const promotores = respondents.filter((e) => (e.notaNPS as number) >= 9).length;
  const detratores = respondents.filter((e) => (e.notaNPS as number) <= 6).length;
  return ((promotores / total - detratores / total) * 100);
}
