"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { mindlawJson } from "@/lib/mindlawFetch";
import { CLIENT_STATUS_LABELS } from "@/lib/dashboardQuery";
import { withHoverPointer } from "@/lib/chartInteractions";
import {
  buildClientPlanStats,
  buildClientStageStats,
  formatClientTenure,
  getClienteEtapaMes,
  getClientStageBaseDate
} from "@/lib/clientStageUtils";
import { normalizeText } from "@/lib/stringUtils";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonCard, SkeletonChart } from "@/components/SkeletonCard";

const STATUS_ORDER = ["cliente", "pagamento_pendente", "pagamento_recusado", "cancelado", "novo_lead"] as const;
const PLAN_ORDER = ["starter", "premium", "advanced", "outros", "sem_plano"] as const;
const STATUS_COLORS: Record<string, string> = {
  cliente: "#10B981",
  pagamento_pendente: "#F59E0B",
  pagamento_recusado: "#EA580C",
  cancelado: "#EF4444",
  novo_lead: "#3B82F6"
};
const PLAN_COLORS: Record<string, string> = {
  starter: "#60a5fa",
  premium: "#c5a059",
  advanced: "#34d399",
  outros: "#a78bfa",
  sem_plano: "#6b7280"
};

function formatPhoneBr(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function hasValidPhoneBr(value: string) {
  return String(value || "").replace(/\D/g, "").length === 11;
}

function clientStatusChipClass(st: string) {
  switch (st) {
    case "cliente":
      return "border border-emerald-400/50 bg-emerald-500/25 text-emerald-100";
    case "pagamento_pendente":
      return "border border-amber-400/50 bg-amber-500/25 text-amber-50";
    case "pagamento_recusado":
      return "border border-orange-400/50 bg-orange-600/25 text-orange-100";
    case "cancelado":
      return "border border-rose-400/50 bg-rose-500/25 text-rose-100";
    case "novo_lead":
      return "border border-sky-400/50 bg-sky-500/25 text-sky-100";
    default:
      return "border border-white/15 bg-white/10 text-mindlaw-gold";
  }
}

function includesSearch(client: Record<string, unknown>, term: string) {
  const base = normalizeText(term);
  if (!base) return true;
  const nome = normalizeText(String(client.nome || ""));
  const email = normalizeText(String(client.email || ""));
  const tel = String(client.telefone || "").replace(/\D/g, "");
  const raw = String(term || "").replace(/\D/g, "");
  const phoneMatch = raw ? tel.includes(raw) : false;
  return nome.includes(base) || email.includes(base) || phoneMatch;
}

export type ClientDoc = {
  _id: string;
  nome: string;
  email?: string;
  telefone?: string;
  plano?: string;
  statusContrato?: string;
  dataReferencia?: string;
  createdAt?: string;
};

type EntradaStats = {
  byStatus: Record<string, number>;
  total: number;
  range?: { start?: string; end?: string } | null;
};

type Props = {
  stats: EntradaStats;
  clientsRaw: ClientDoc[];
  clientsActiveCliente: ClientDoc[];
  filters: {
    clientSegment: string;
    clientPlan: string;
    clientStatus: string;
    sortBy: string;
    sortDir: string;
  };
  onFiltersChange: (patch: Partial<Props["filters"]>) => void;
  onToast: (msg: string) => void;
  onReload: () => void;
  chartOptsBar: Record<string, unknown>;
  chartOptsDough: Record<string, unknown>;
  searchPrefill?: string | null;
  onConsumedSearchPrefill?: () => void;
  onPlanChartAudit?: (planKey: string) => void;
  isLoading?: boolean;
};

export function ClientsPanel({
  stats,
  clientsRaw,
  clientsActiveCliente,
  filters,
  onFiltersChange,
  onToast,
  onReload,
  chartOptsBar,
  chartOptsDough,
  searchPrefill,
  onConsumedSearchPrefill,
  onPlanChartAudit,
  isLoading = false
}: Props) {
  const [clientSearch, setClientSearch] = useState("");
  const [clientStage, setClientStage] = useState("");
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsPageSize, setClientsPageSize] = useState(25);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (searchPrefill != null && searchPrefill !== "") {
      setClientSearch(searchPrefill);
      setClientsPage(1);
      onConsumedSearchPrefill?.();
    }
  }, [searchPrefill, onConsumedSearchPrefill]);

  const [editForm, setEditForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    statusContrato: "cliente",
    plano: "",
    dataReferencia: ""
  });

  const byStatus = stats.byStatus || {};
  const statusDistribSum = STATUS_ORDER.reduce((acc, k) => acc + (byStatus[k] || 0), 0);
  const statusChart = {
    labels: STATUS_ORDER.map((k) => CLIENT_STATUS_LABELS[k] || k),
    datasets: [
      {
        data: STATUS_ORDER.map((k) => byStatus[k] || 0),
        backgroundColor: STATUS_ORDER.map((k) => STATUS_COLORS[k] || "#94a3b8"),
        borderWidth: 0
      }
    ]
  };

  const planStats = useMemo(() => buildClientPlanStats(clientsActiveCliente), [clientsActiveCliente]);
  const planKeysOrdered = useMemo(
    () => PLAN_ORDER.filter((k) => (planStats[k] || 0) > 0),
    [planStats]
  );
  const planChart = {
    labels: planKeysOrdered.map((k) => (k === "sem_plano" ? "Sem plano" : k.charAt(0).toUpperCase() + k.slice(1))),
    datasets: [
      {
        data: planKeysOrdered.map((k) => planStats[k] || 0),
        backgroundColor: planKeysOrdered.map((k) => PLAN_COLORS[k] || "#94a3b8"),
        borderWidth: 0
      }
    ]
  };

  const statusDoughOpts = useMemo(
    () =>
      withHoverPointer({
        ...(chartOptsDough as ChartOptions<"doughnut">),
        onClick: (_e, els) => {
          if (!els.length) return;
          const k = STATUS_ORDER[els[0].index];
          if (!k) return;
          onFiltersChange({ clientStatus: filters.clientStatus === k ? "" : k });
        }
      }),
    [chartOptsDough, filters.clientStatus, onFiltersChange]
  );

  const planDoughOpts = useMemo(() => {
    const base = chartOptsDough as ChartOptions<"doughnut">;
    if (!onPlanChartAudit) {
      return withHoverPointer(base);
    }
    return withHoverPointer({
      ...base,
      onClick: (_e, els) => {
        if (!els.length || !planKeysOrdered.length) return;
        const k = planKeysOrdered[els[0].index];
        if (k) onPlanChartAudit(k);
      }
    });
  }, [chartOptsDough, onPlanChartAudit, planKeysOrdered]);

  const stageBarOpts = useMemo(
    () =>
      withHoverPointer({
        ...(chartOptsBar as ChartOptions<"bar">),
        onClick: (_e, els) => {
          if (!els.length) return;
          const idx = els[0].index;
          const m = idx < 11 ? String(idx + 1) : "12";
          setClientStage((prev) => (prev === m ? "" : m));
          setClientsPage(1);
        }
      }),
    [chartOptsBar]
  );

  const stageMap = useMemo(() => buildClientStageStats(clientsActiveCliente), [clientsActiveCliente]);
  const stageLabels = [...Array.from({ length: 11 }, (_, i) => `Mês ${i + 1}`), "Mês 12+"];
  const stageChart = {
    labels: stageLabels,
    datasets: [
      {
        label: "Clientes ativos",
        data: Array.from({ length: 12 }, (_, i) =>
          i < 11 ? stageMap.get(i + 1) || 0 : stageMap.get(12) || 0
        ),
        backgroundColor: "rgba(197, 160, 89, 0.55)",
        borderColor: "#C5A059",
        borderWidth: 1
      }
    ]
  };

  const searched = useMemo(() => {
    const stageFilter = Number(clientStage || 0);
    return (clientsRaw || []).filter((c) => {
      if (!includesSearch(c as Record<string, unknown>, clientSearch)) return false;
      if (!stageFilter) return true;
      if (String(c?.statusContrato || "") !== "cliente") return false;
      const stage = getClienteEtapaMes(getClientStageBaseDate(c));
      if (!stage) return false;
      if (stageFilter >= 12) return stage >= 12;
      return stage === stageFilter;
    });
  }, [clientsRaw, clientSearch, clientStage]);

  const totalResults = searched.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / clientsPageSize));
  const page = Math.min(clientsPage, totalPages);
  const startIdx = (page - 1) * clientsPageSize;
  const pageList = searched.slice(startIdx, startIdx + clientsPageSize);

  function openEdit(c: ClientDoc) {
    setEditId(String(c._id));
    setEditForm({
      nome: c.nome || "",
      telefone: formatPhoneBr(String(c.telefone || "")),
      email: String(c.email || ""),
      statusContrato: String(c.statusContrato || "cliente"),
      plano: String(c.plano || ""),
      dataReferencia: c.dataReferencia ? String(c.dataReferencia).slice(0, 10) : ""
    });
  }

  async function saveEdit() {
    if (!editId) return;
    if (!editForm.nome.trim()) {
      onToast("Nome é obrigatório.");
      return;
    }
    if (editForm.telefone && !hasValidPhoneBr(editForm.telefone)) {
      onToast("Telefone inválido. Use (xx) x xxxx-xxxx.");
      return;
    }
    try {
      await mindlawJson(`/api/clients/${editId}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: editForm.nome.trim(),
          telefone: editForm.telefone.trim(),
          email: editForm.email.trim(),
          statusContrato: editForm.statusContrato,
          plano: editForm.plano.trim(),
          dataReferencia: editForm.dataReferencia || null
        })
      });
      onToast("Cliente atualizado.");
      setEditId(null);
      onReload();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function handleCopy(text: string) {
    const ok = await copyToClipboard(text);
    onToast(ok ? "Copiado!" : "Não foi possível copiar.");
  }

  return (
    <section className="space-y-6">
      <h2 className="text-center text-2xl font-extrabold md:text-3xl">Clientes</h2>

      <div className="glass-card mx-auto grid max-w-5xl grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="text-xs text-white/65">
          Segmento
          <select
            value={filters.clientSegment}
            onChange={(e) => onFiltersChange({ clientSegment: e.target.value })}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="clientes">Clientes (exceto leads)</option>
            <option value="leads">Leads</option>
            <option value="leads_comercial">Leads em negociação</option>
          </select>
        </label>
        <label className="text-xs text-white/65">
          Plano
          <select
            value={filters.clientPlan}
            onChange={(e) => onFiltersChange({ clientPlan: e.target.value })}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="starter">Starter</option>
            <option value="premium">Premium</option>
            <option value="advanced">Advanced</option>
            <option value="sem_plano">Sem plano</option>
            <option value="outros">Outros</option>
          </select>
        </label>
        <label className="text-xs text-white/65">
          Status contrato
          <select
            value={filters.clientStatus}
            onChange={(e) => onFiltersChange({ clientStatus: e.target.value })}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            {STATUS_ORDER.map((k) => (
              <option key={k} value={k}>
                {CLIENT_STATUS_LABELS[k] || k}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/65">
          Ordenar por
          <select
            value={filters.sortBy}
            onChange={(e) => onFiltersChange({ sortBy: e.target.value })}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-2 py-2 text-sm"
          >
            <option value="cadastro">Data de cadastro</option>
            <option value="nome">Nome</option>
            <option value="plano">Plano</option>
            <option value="status">Status</option>
            <option value="data_ref">Data de referência</option>
          </select>
        </label>
        <label className="text-xs text-white/65">
          Direção
          <select
            value={filters.sortDir}
            onChange={(e) => onFiltersChange({ sortDir: e.target.value })}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-2 py-2 text-sm"
          >
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </select>
        </label>
        <label className="text-xs text-white/65">
          Etapa (só ativos)
          <select
            value={clientStage}
            onChange={(e) => {
              setClientStage(e.target.value);
              setClientsPage(1);
            }}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-2 py-2 text-sm"
          >
            <option value="">Todas</option>
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                Mês {i + 1}
              </option>
            ))}
            <option value="12">Mês 12 ou mais</option>
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <SkeletonChart className="mx-auto h-36 max-w-md w-full" />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SkeletonChart className="h-56 w-full" />
            <SkeletonChart className="h-56 w-full" />
            <SkeletonChart className="h-56 w-full" />
          </div>
        </div>
      ) : (
        <>
          <article className="glass-card mx-auto max-w-md border-t-2 border-mindlaw-gold p-5 text-center">
            <p className="text-xs text-white/65">Entradas no período (data de referência)</p>
            <p className="kpi-mono mt-2 text-4xl font-extrabold text-mindlaw-gold">{stats.total ?? 0}</p>
            {stats.range?.start ? (
              <p className="mt-2 text-[11px] text-white/45">
                {new Date(stats.range.start).toLocaleDateString("pt-BR")} —{" "}
                {stats.range.end ? new Date(stats.range.end).toLocaleDateString("pt-BR") : ""}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-white/45">Sem intervalo: contagem geral filtrada.</p>
            )}
          </article>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <article className="glass-card p-4">
              <h3 className="mb-2 text-center text-sm font-semibold text-mindlaw-gold">Por status (entradas)</h3>
              {statusDistribSum === 0 ? (
                <EmptyState message="Sem entradas por status para o período e filtros atuais." className="min-h-[14rem]" />
              ) : (
                <>
                  <div className="mx-auto h-56 max-w-xs">
                    <Doughnut data={statusChart} options={statusDoughOpts} />
                  </div>
                  <ul className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] text-white/70">
                    {STATUS_ORDER.map((k) => (
                      <li key={k} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[k] }} />
                        {CLIENT_STATUS_LABELS[k]}: <strong>{byStatus[k] || 0}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>
            <article className="glass-card p-4">
              <h3 className="mb-2 text-center text-sm font-semibold text-mindlaw-gold">Planos (ativos)</h3>
              {planKeysOrdered.length === 0 ? (
                <EmptyState message="Nenhum cliente ativo com plano identificado para estes filtros." className="min-h-[14rem]" />
              ) : (
                <div className="mx-auto h-56 max-w-xs">
                  <Doughnut data={planChart} options={planDoughOpts} />
                </div>
              )}
            </article>
            <article className="glass-card p-4">
              <h3 className="mb-2 text-center text-sm font-semibold text-white/85">Tempo na base (ativos)</h3>
              <div className="h-56">
                <Bar data={stageChart} options={stageBarOpts} />
              </div>
            </article>
          </div>
        </>
      )}

      <div className="mx-auto flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1 text-xs text-white/65">
          Buscar (nome, e-mail, telefone)
          <input
            value={clientSearch}
            onChange={(e) => {
              setClientSearch(e.target.value);
              setClientsPage(1);
            }}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-white/65">
          Por página
          <select
            value={String(clientsPageSize)}
            onChange={(e) => {
              setClientsPageSize(Number(e.target.value));
              setClientsPage(1);
            }}
            className="mt-1 min-h-[44px] rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-center text-sm text-white/55">
        {isLoading ? "A carregar…" : `${totalResults} resultado(s)`}
        {!isLoading && totalResults
          ? ` · exibindo ${startIdx + 1}-${Math.min(startIdx + clientsPageSize, totalResults)}`
          : ""}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={isLoading || page <= 1}
          onClick={() => setClientsPage((p) => Math.max(1, p - 1))}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="text-sm text-white/65">
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          disabled={isLoading || page >= totalPages}
          onClick={() => setClientsPage((p) => Math.min(totalPages, p + 1))}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm disabled:opacity-40"
        >
          Próxima
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {isLoading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} className="h-36 w-full border border-white/5" />
            ))}
          </>
        ) : totalResults === 0 ? (
          <div className="md:col-span-2">
            <EmptyState message="Nenhum cliente corresponde à busca ou aos filtros aplicados." />
          </div>
        ) : (
          pageList.map((c) => {
          const st = c.statusContrato || "cliente";
          const phone = formatPhoneBr(String(c.telefone || ""));
          const phoneDigits = String(c.telefone || "").replace(/\D/g, "");
          const tenure =
            st === "cliente" ? formatClientTenure(getClientStageBaseDate(c)) : "";
          return (
            <article key={c._id} className="rounded-xl border border-white/10 bg-mindlaw-teal/40 p-4">
              <button
                type="button"
                title="Clicar para copiar"
                className="block cursor-pointer text-left font-semibold text-white transition-colors hover:text-mindlaw-gold"
                onClick={() => void handleCopy(c.nome || "")}
              >
                {c.nome}
              </button>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${clientStatusChipClass(st)}`}
              >
                {CLIENT_STATUS_LABELS[st] || st}
              </span>
              {tenure ? <p className="mt-1 text-xs text-mindlaw-gold/90">Tempo na base: {tenure}</p> : null}
              <p className="mt-1 text-xs text-white/70">
                {c.plano || "—"} · ref.{" "}
                {c.dataReferencia ? new Date(c.dataReferencia).toLocaleDateString("pt-BR") : "—"}
              </p>
              <p className="text-xs text-white/70">
                {phone ? (
                  <button
                    type="button"
                    title="Clicar para copiar"
                    className="cursor-pointer font-mono transition-colors hover:text-mindlaw-gold"
                    onClick={() => void handleCopy(phoneDigits || phone)}
                  >
                    {phone}
                  </button>
                ) : (
                  "Sem telefone"
                )}{" "}
                · {c.email || "Sem e-mail"}
              </p>
              <button
                type="button"
                className="mt-2 rounded-lg border border-white/15 px-3 py-1 text-xs hover:border-mindlaw-gold/50"
                onClick={() => openEdit(c)}
              >
                Editar
              </button>
            </article>
          );
        })
        )}
      </div>

      {editId ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditId(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-mindlaw-teal p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h3 className="text-lg font-bold text-mindlaw-gold">Editar cliente</h3>
            <div className="mt-4 space-y-3 text-sm">
              <label className="block text-xs text-white/65">
                Nome
                <input
                  value={editForm.nome}
                  onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-white/65">
                Telefone
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={editForm.telefone}
                  onChange={(e) => setEditForm((f) => ({ ...f, telefone: formatPhoneBr(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                  maxLength={16}
                />
              </label>
              <label className="block text-xs text-white/65">
                E-mail
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-white/65">
                Status
                <select
                  value={editForm.statusContrato}
                  onChange={(e) => setEditForm((f) => ({ ...f, statusContrato: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                >
                  {STATUS_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {CLIENT_STATUS_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-white/65">
                Plano
                <input
                  value={editForm.plano}
                  onChange={(e) => setEditForm((f) => ({ ...f, plano: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-white/65">
                Data de referência
                <input
                  type="date"
                  value={editForm.dataReferencia}
                  onChange={(e) => setEditForm((f) => ({ ...f, dataReferencia: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="rounded-xl border border-white/20 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                className="rounded-xl bg-mindlaw-gold px-4 py-2 text-sm font-semibold text-mindlaw-dark"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
