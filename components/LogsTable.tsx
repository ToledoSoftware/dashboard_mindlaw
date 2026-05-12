"use client";

type LogRow = {
  id: string;
  tipo: string;
  cliente: string;
  data?: string;
  detalhe: string;
  origem: string;
};

export function LogsTable({
  rows,
  filter,
  onFilter
}: {
  rows: LogRow[];
  filter: string;
  onFilter: (v: string) => void;
}) {
  const filtered = rows.filter((r) => {
    if (filter === "todos") return true;
    return r.origem === filter;
  });

  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
        <label className="text-xs text-white/60">Filtrar por tipo</label>
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm sm:max-w-xs"
        >
          <option value="todos">Todos</option>
          <option value="comercial">Comercial</option>
          <option value="churn">Churn</option>
          <option value="nps">NPS</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-white/10 bg-mindlaw-teal/80 text-xs uppercase tracking-wide text-mindlaw-gold/90">
            <tr>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-mindlaw-gold">{r.tipo}</td>
                <td className="px-4 py-3">{r.cliente}</td>
                <td className="kpi-mono px-4 py-3 text-xs text-white/70">
                  {r.data ? new Date(r.data).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="max-w-md px-4 py-3 text-white/75">
                  <span className="line-clamp-2">{r.detalhe}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-center text-xs text-white/45">{filtered.length} registro(s) exibidos.</p>
    </div>
  );
}
