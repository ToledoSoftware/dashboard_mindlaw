"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@/components/chartRegister";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { PeriodFilterPopover } from "@/components/PeriodFilterPopover";
import { Sidebar, MobileHeader, DesktopSpacer, type TabId } from "@/components/Sidebar";
import { LaunchCenter, type ClientRow } from "@/components/LaunchCenter";
import { FeedbackFeed, type NpsFeedbackItem } from "@/components/FeedbackFeed";
import { LogsAuditPanel, type AuditLogRow, type InteractiveLogFilter } from "@/components/LogsAuditPanel";
import { ClientsPanel, type ClientDoc } from "@/components/ClientsPanel";
import { calcularNpsReal } from "@/lib/npsScore";
import { buildDashboardQuery, formatLocalDateYMD, CLIENT_STATUS_LABELS } from "@/lib/dashboardQuery";
import { mindlawJson, mindlawAuthHeaders } from "@/lib/mindlawFetch";
import { normalizeText } from "@/lib/stringUtils";
import { formatBrl, formatPct } from "@/lib/formatMoney";
import { withHoverPointer } from "@/lib/chartInteractions";
import { SkeletonChart, SkeletonKpiGrid } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { KpiWithTooltip } from "@/components/KpiWithTooltip";

function monthBoundsLocal() {
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth(), 1);
  const end = new Date(n.getFullYear(), n.getMonth() + 1, 0);
  return { startDate: formatLocalDateYMD(start), endDate: formatLocalDateYMD(end) };
}

const STATUS_ORDER = ["cliente", "pagamento_pendente", "pagamento_recusado", "cancelado", "novo_lead"] as const;
const STATUS_COLORS: Record<string, string> = {
  cliente: "#10B981",
  pagamento_pendente: "#F59E0B",
  pagamento_recusado: "#EA580C",
  cancelado: "#EF4444",
  novo_lead: "#3B82F6"
};

const PLAN_AUDIT_LABELS: Record<string, string> = {
  starter: "Starter",
  premium: "Premium",
  advanced: "Advanced",
  outros: "Outros",
  sem_plano: "Sem plano"
};

/** Meses YYYY-MM entre as datas (inclusive), no calendário local. */
function eachMonthYmBetween(startYmd: string, endYmd: string): string[] {
  const parse = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((x) => Number(x));
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  };
  const a = parse(startYmd);
  const b = parse(endYmd);
  const cur = new Date(a.getFullYear(), a.getMonth(), 1);
  const endM = new Date(b.getFullYear(), b.getMonth(), 1);
  const out: string[] = [];
  while (cur.getTime() <= endM.getTime()) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out.length ? out : [startYmd.slice(0, 7)];
}

function clientEntryYmd(c: ClientDoc): string | null {
  const raw = c.dataReferencia || c.createdAt;
  if (!raw) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalDateYMD(d);
}

function normalizePlanBucket(plano: string | undefined): string {
  const p = normalizeText(plano || "");
  if (!p) return "sem_plano";
  if (p.includes("starter")) return "starter";
  if (p.includes("premium")) return "premium";
  if (p.includes("advanced")) return "advanced";
  return "outros";
}

/** Paleta premium: dourado escuro, dourado claro, teal claro, ardósia. */
const RESUMO_PLAN_COLORS = ["#7A6230", "#D4B87A", "#5EEAD4", "#64748B"] as const;

type ClientFilters = {
  clientSegment: string;
  clientPlan: string;
  clientStatus: string;
  sortBy: string;
  sortDir: string;
};

type ChurnDetailRow = {
  cliente: string;
  dataChurn?: string;
  motivoPrincipal?: string;
  funcionalidadeFaltante?: string;
  valorPerdido?: number;
  plano?: string;
  statusContrato?: string;
};

export function DashboardApp() {
  const [tab, setTab] = useState<TabId>("resumo");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [{ startDate, endDate }, setPeriod] = useState(monthBoundsLocal);
  const [toast, setToast] = useState("");
  const [clientsLaunch, setClientsLaunch] = useState<ClientRow[]>([]);
  const [churnYear, setChurnYear] = useState(new Date().getFullYear());
  const [clientFilters, setClientFilters] = useState<ClientFilters>({
    clientSegment: "",
    clientPlan: "",
    clientStatus: "",
    sortBy: "cadastro",
    sortDir: "desc"
  });
  const [auditTab, setAuditTab] = useState<"comercial" | "churn" | "nps">("nps");
  const [logsFilterPlan, setLogsFilterPlan] = useState("");
  const [logsSearchTerm, setLogsSearchTerm] = useState("");
  const [interactiveFilter, setInteractiveFilter] = useState<InteractiveLogFilter>(null);
  const interactiveRef = useRef<InteractiveLogFilter>(null);
  const [selectedChurnMonth, setSelectedChurnMonth] = useState<number | null>(null);
  const [clientsSearchPrefill, setClientsSearchPrefill] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSel, setExportSel] = useState({
    clients: false,
    commercial: true,
    support: true
  });

  const [commercial, setCommercial] = useState<{
    kpis: { ltvEstimado: number; taxaConversao: number };
    funnel: { gains: number; losses: number; negotiating: number };
    lossReasons: Record<string, number>;
    sales?: Record<string, unknown>[];
  } | null>(null);

  const [support, setSupport] = useState<{
    kpis: { churnRate: number; npsScore: number };
    churnByMonth: number[];
    churnDetailsByMonth?: ChurnDetailRow[][];
    churnReasonDistribution: Record<string, number>;
    npsDistribution: { Promotor: number; Neutro: number; Detrator: number };
    support: Record<string, unknown>[];
    totalMrrPerdido: number;
    clientEntradaStats?: { byStatus: Record<string, number>; total: number; range?: unknown };
  } | null>(null);

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [clientsFull, setClientsFull] = useState<ClientDoc[]>([]);
  const [clientsActiveCliente, setClientsActiveCliente] = useState<ClientDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const apiQuery = useMemo(
    () =>
      buildDashboardQuery({
        startDate,
        endDate,
        clientStatus: clientFilters.clientStatus || undefined,
        clientPlan: clientFilters.clientPlan || undefined,
        clientSegment: clientFilters.clientSegment || undefined,
        sortBy: clientFilters.sortBy || undefined,
        sortDir: clientFilters.sortDir || undefined,
        churnYear
      }),
    [startDate, endDate, clientFilters, churnYear]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => {
    interactiveRef.current = interactiveFilter;
  }, [interactiveFilter]);

  const handlePlanChartAudit = useCallback(
    (planKey: string) => {
      const prev = interactiveRef.current;
      const off = prev?.type === "auditPlan" && prev.value === planKey;
      setLogsFilterPlan(off ? "" : planKey);
      setInteractiveFilter(off ? null : { type: "auditPlan", value: planKey });
      setTab("logs");
      showToast(
        off ? "Filtro de plano removido." : `Auditoria filtrada por plano: ${PLAN_AUDIT_LABELS[planKey] || planKey}`
      );
    },
    [showToast]
  );

  const loadCore = useCallback(async () => {
    setIsLoading(true);
    const suffix = apiQuery;
    const generalCliente = buildDashboardQuery({
      startDate,
      endDate,
      clientStatus: "cliente",
      churnYear
    });
    try {
      const [cForm, comm, sup, lg, clientsList, activeList] = await Promise.all([
        mindlawJson<{ clients: { _id: string; nome: string; plano?: string }[] }>(`/api/clients?forForms=1`),
        mindlawJson<{
          kpis: { ltvEstimado: number; taxaConversao: number };
          funnel: { gains: number; losses: number; negotiating: number };
          lossReasons: Record<string, number>;
          sales?: Record<string, unknown>[];
        }>(`/api/commercial/dashboard${suffix}`),
        mindlawJson<typeof support>(`/api/support/dashboard${suffix}`),
        mindlawJson<{ logs: AuditLogRow[] }>(`/api/logs${suffix}`),
        mindlawJson<{ clients: ClientDoc[] }>(`/api/clients${suffix}`),
        mindlawJson<{ clients: ClientDoc[] }>(`/api/clients${generalCliente}`)
      ]);
      setClientsLaunch((cForm.clients || []).map((c) => ({ _id: String(c._id), nome: c.nome, plano: c.plano })));
      setCommercial(comm);
      setSupport(sup);
      setLogs(lg.logs || []);
      setClientsFull(
        (clientsList.clients || []).map((c) => ({
          ...c,
          _id: String((c as { _id?: unknown })._id)
        })) as ClientDoc[]
      );
      setClientsActiveCliente(
        (activeList.clients || []).map((c) => ({
          ...c,
          _id: String((c as { _id?: unknown })._id)
        })) as ClientDoc[]
      );
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiQuery, startDate, endDate, churnYear, showToast]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const npsEntries = useMemo(() => {
    const s = support?.support || [];
    return s.filter((r) => r.registerType === "nps" || typeof r.notaNPS === "number");
  }, [support]);

  const npsCalculado = useMemo(() => calcularNpsReal(npsEntries as { notaNPS?: number }[]), [npsEntries]);

  const clientPlanoLookup = useMemo(() => {
    const rows: { nome: string; plano?: string; telefone?: string }[] = clientsLaunch.map((c) => ({
      nome: c.nome,
      plano: c.plano
    }));
    for (const c of clientsFull) {
      rows.push({ nome: c.nome, plano: c.plano, telefone: c.telefone });
    }
    return rows;
  }, [clientsLaunch, clientsFull]);

  const resumoStrictActiveClients = useMemo(
    () =>
      (clientsFull || []).filter(
        (c) => normalizeText(String(c.statusContrato || "")) === "cliente"
      ),
    [clientsFull]
  );

  const resumoClientEvolution = useMemo(() => {
    const monthKeys = eachMonthYmBetween(startDate, endDate);
    const counts = new Map<string, number>();
    for (const k of monthKeys) counts.set(k, 0);
    for (const c of resumoStrictActiveClients) {
      const ref = clientEntryYmd(c);
      if (!ref || ref < startDate || ref > endDate) continue;
      const bucket = ref.slice(0, 7);
      if (counts.has(bucket)) counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }
    const labels = monthKeys.map((ym) => {
      const [y, m] = ym.split("-").map(Number);
      const d = new Date(y, (m || 1) - 1, 1);
      return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    });
    const data = monthKeys.map((k) => counts.get(k) || 0);
    return { labels, data };
  }, [resumoStrictActiveClients, startDate, endDate]);

  const resumoEvolutionChartData = useMemo(
    () => ({
      labels: resumoClientEvolution.labels,
      datasets: [
        {
          label: "Clientes ativos (entrada / referência)",
          data: resumoClientEvolution.data,
          borderColor: "#C5A059",
          backgroundColor: "rgba(197, 160, 89, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 4,
          pointBackgroundColor: "#C5A059",
          pointBorderColor: "#ffffff",
          borderWidth: 2
        }
      ]
    }),
    [resumoClientEvolution]
  );

  const resumoPlanChart = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of resumoStrictActiveClients) {
      const k = normalizePlanBucket(c.plano);
      acc[k] = (acc[k] || 0) + 1;
    }
    const order = ["starter", "premium", "advanced", "outros", "sem_plano"] as const;
    const keys = order.filter((k) => (acc[k] || 0) > 0);
    if (!keys.length) return null;
    return {
      labels: keys.map((k) => PLAN_AUDIT_LABELS[k] || k),
      datasets: [
        {
          data: keys.map((k) => acc[k] || 0),
          backgroundColor: keys.map((_, i) => RESUMO_PLAN_COLORS[i % RESUMO_PLAN_COLORS.length]),
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1
        }
      ]
    };
  }, [resumoStrictActiveClients]);

  const resumoEvolutionTotal = useMemo(
    () => resumoClientEvolution.data.reduce((a, b) => a + b, 0),
    [resumoClientEvolution]
  );

  const openExportModal = useCallback(() => {
    setExportSel({ clients: false, commercial: true, support: true });
    setExportModalOpen(true);
    setMobileOpen(false);
  }, []);

  const runExportDownload = useCallback(
    async (sel: { clients: boolean; commercial: boolean; support: boolean }) => {
      if (!sel.clients && !sel.commercial && !sel.support) {
        showToast("Selecione pelo menos uma secção.");
        return;
      }
      try {
        const sections =
          sel.clients && sel.commercial && sel.support
            ? "all"
            : [sel.clients && "clients", sel.commercial && "commercial", sel.support && "support"]
                .filter(Boolean)
                .join(",");
        const joiner = apiQuery.includes("?") ? "&" : "?";
        const res = await fetch(`/api/export${apiQuery}${joiner}sections=${encodeURIComponent(sections)}`, {
          credentials: "include",
          headers: mindlawAuthHeaders()
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "Falha ao exportar.");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cd = res.headers.get("Content-Disposition");
        const m = cd?.match(/filename="([^"]+)"/);
        a.download = m?.[1] ?? "MindLaw_Export.xlsx";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Planilha gerada.");
        setExportModalOpen(false);
      } catch (e) {
        showToast((e as Error).message);
      }
    },
    [apiQuery, showToast]
  );

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("mindlaw_token");
    window.location.href = "/login";
  }

  const barOpts = useMemo(
    () =>
      withHoverPointer<"bar">({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#e2e8f0" } }
        },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.06)" } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.06)" } }
        }
      }),
    []
  );

  const doughOpts = useMemo(
    () =>
      withHoverPointer<"doughnut">({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { color: "#e2e8f0" } } }
      }),
    []
  );

  const resumoEvolutionLineOpts = useMemo(
    () =>
      withHoverPointer<"line">({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "rgba(255,255,255,0.9)", usePointStyle: true, padding: 16 }
          }
        },
        scales: {
          x: {
            ticks: { color: "rgba(255,255,255,0.85)" },
            grid: { color: "rgba(255,255,255,0.06)" }
          },
          y: {
            ticks: { color: "rgba(255,255,255,0.85)", precision: 0 },
            grid: { color: "rgba(255,255,255,0.06)" },
            beginAtZero: true
          }
        }
      }),
    []
  );

  const resumoPlansDoughOpts = useMemo<ChartOptions<"doughnut">>(
    () => ({
      ...doughOpts,
      plugins: {
        ...(doughOpts.plugins ?? {}),
        legend: {
          position: "bottom" as const,
          labels: { color: "#FFFFFF", font: { size: 11 }, padding: 12 }
        }
      }
    }),
    [doughOpts]
  );

  const funnelOpts = useMemo<ChartOptions<"doughnut">>(
    () => ({
      ...doughOpts,
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const labels = ["Ganho", "Perdido", "Em Negociacao"];
        const selected = labels[elements[0].index];
        if (!selected) return;
        const key = normalizeText(selected);
        setInteractiveFilter((prev) =>
          prev?.type === "commercialStatus" && prev.value === key ? null : { type: "commercialStatus", value: key }
        );
        setAuditTab("comercial");
        setTab("logs");
        showToast(`Filtro comercial · status (${selected}).`);
      }
    }),
    [doughOpts, showToast]
  );

  const lossBarOpts = useMemo<ChartOptions<"bar">>(
    () => ({
      ...barOpts,
      onClick: (_e, elements) => {
        if (!elements.length || !commercial) return;
        const labels = Object.keys(commercial.lossReasons || {});
        const lab = labels[elements[0].index];
        if (!lab) return;
        const key = normalizeText(lab);
        setInteractiveFilter((prev) =>
          prev?.type === "commercialReason" && prev.value === key ? null : { type: "commercialReason", value: key }
        );
        setAuditTab("comercial");
        setTab("logs");
        showToast(`Filtro comercial · motivo (${lab}).`);
      }
    }),
    [barOpts, commercial, showToast]
  );

  const churnBarOpts = useMemo<ChartOptions<"bar">>(
    () => ({
      ...barOpts,
      onClick: (_e, elements) => {
        if (!elements.length || !support) return;
        const labels = Object.keys(support.churnReasonDistribution || {});
        const lab = labels[elements[0].index];
        if (!lab) return;
        const key = normalizeText(lab);
        setInteractiveFilter((prev) =>
          prev?.type === "supportChurnReason" && prev.value === key ? null : { type: "supportChurnReason", value: key }
        );
        setAuditTab("churn");
        setTab("logs");
        showToast(`Filtro churn · motivo (${lab}).`);
      }
    }),
    [barOpts, support, showToast]
  );

  const npsDoughOpts = useMemo<ChartOptions<"doughnut">>(
    () => ({
      ...doughOpts,
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const labels = ["Promotor", "Neutro", "Detrator"];
        const selected = labels[elements[0].index];
        if (!selected) return;
        const key = normalizeText(selected);
        setInteractiveFilter((prev) =>
          prev?.type === "supportNps" && prev.value === key ? null : { type: "supportNps", value: key }
        );
        setAuditTab("nps");
        setTab("logs");
        showToast(`Filtro NPS (${selected}).`);
      }
    }),
    [doughOpts, showToast]
  );

  const lossChart = commercial?.lossReasons || {};
  const lossData = {
    labels: Object.keys(lossChart),
    datasets: [
      {
        label: "Ocorrências",
        data: Object.values(lossChart),
        backgroundColor: "rgba(197, 160, 89, 0.55)",
        borderColor: "#C5A059",
        borderWidth: 1
      }
    ]
  };

  const funnelData = commercial
    ? {
        labels: ["Ganho", "Perdido", "Em Negociacao"],
        datasets: [
          {
            data: [commercial.funnel.gains, commercial.funnel.losses, commercial.funnel.negotiating],
            backgroundColor: ["#34d399", "#f87171", "#fbbf24"],
            borderWidth: 0
          }
        ]
      }
    : null;

  const churnReasons = support?.churnReasonDistribution || {};
  const churnBar = {
    labels: Object.keys(churnReasons),
    datasets: [
      {
        label: "Churns",
        data: Object.values(churnReasons),
        backgroundColor: "rgba(248, 113, 113, 0.5)",
        borderColor: "#f87171"
      }
    ]
  };

  const npsDist = support?.npsDistribution;
  const npsDoughnut = npsDist
    ? {
        labels: ["Promotor", "Neutro", "Detrator"],
        datasets: [
          {
            data: [npsDist.Promotor, npsDist.Neutro, npsDist.Detrator],
            backgroundColor: ["#4ade80", "#facc15", "#f87171"],
            borderWidth: 0
          }
        ]
      }
    : null;

  const entStats = support?.clientEntradaStats || { byStatus: {}, total: 0, range: null };
  const byEnt = entStats.byStatus || {};
  const resumoEntradasChart = {
    labels: STATUS_ORDER.map((k) => CLIENT_STATUS_LABELS[k] || k),
    datasets: [
      {
        data: STATUS_ORDER.map((k) => byEnt[k] || 0),
        backgroundColor: STATUS_ORDER.map((k) => STATUS_COLORS[k] || "#94a3b8"),
        borderWidth: 0
      }
    ]
  };

  const entradasDistribSum = STATUS_ORDER.reduce((acc, k) => acc + (byEnt[k] || 0), 0);
  const lossLabelsEmpty = lossData.labels.length === 0;
  const churnReasonsSum = Object.values(churnReasons).reduce((a, b) => a + Number(b || 0), 0);
  const npsDistTotal = npsDist
    ? (npsDist.Promotor || 0) + (npsDist.Neutro || 0) + (npsDist.Detrator || 0)
    : 0;
  const funnelTotal =
    commercial != null
      ? commercial.funnel.gains + commercial.funnel.losses + commercial.funnel.negotiating
      : 0;

  const receitaPeriodo = commercial?.kpis.ltvEstimado ?? 0;
  const mrrPerdido = support?.totalMrrPerdido ?? 0;

  const churnByMonth = support?.churnByMonth || Array(12).fill(0);
  const maxChurn = Math.max(...churnByMonth, 1);
  const churnMonthIdx =
    selectedChurnMonth !== null ? selectedChurnMonth : Math.max(0, churnByMonth.findIndex((n) => n > 0));
  const safeMonthIdx = churnMonthIdx >= 0 ? churnMonthIdx : 0;
  const churnDetails = support?.churnDetailsByMonth?.[safeMonthIdx] || [];
  const monthShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  return (
    <div className="relative min-h-screen bg-mindlaw-dark">
      {toast ? (
        <div className="fixed right-4 top-4 z-[100] rounded-xl border border-mindlaw-gold/40 bg-mindlaw-teal px-4 py-3 text-sm font-semibold shadow-lg">
          {toast}
        </div>
      ) : null}

      {exportModalOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setExportModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-mindlaw-teal p-6 shadow-2xl"
            role="dialog"
            aria-labelledby="export-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="export-modal-title" className="text-lg font-bold text-mindlaw-gold">
              Gerar planilha
            </h2>
            <p className="mt-2 text-sm text-white/70">
              Os filtros de período e de clientes aplicados ao dashboard serão usados na exportação. Escolha o que
              incluir num único ficheiro Excel.
            </p>
            <div className="mt-5 space-y-3 text-sm text-white/90">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-mindlaw-dark/30 p-3 hover:border-mindlaw-gold/30">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30"
                  checked={exportSel.clients}
                  onChange={(e) => setExportSel((s) => ({ ...s, clients: e.target.checked }))}
                />
                <span>
                  <strong className="text-white">Clientes</strong>
                  <span className="mt-0.5 block text-xs text-white/55">Folhas &quot;Clientes&quot; e &quot;Resumo período&quot;.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-mindlaw-dark/30 p-3 hover:border-mindlaw-gold/30">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30"
                  checked={exportSel.commercial}
                  onChange={(e) => setExportSel((s) => ({ ...s, commercial: e.target.checked }))}
                />
                <span>
                  <strong className="text-white">Comercial</strong>
                  <span className="mt-0.5 block text-xs text-white/55">Folha &quot;Comercial&quot; (vendas / funil exportado).</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-mindlaw-dark/30 p-3 hover:border-mindlaw-gold/30">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30"
                  checked={exportSel.support}
                  onChange={(e) => setExportSel((s) => ({ ...s, support: e.target.checked }))}
                />
                <span>
                  <strong className="text-white">Suporte</strong>
                  <span className="mt-0.5 block text-xs text-white/55">
                    Folhas &quot;Suporte&quot;, &quot;Churn&quot; e &quot;NPS&quot;.
                  </span>
                </span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs font-semibold text-mindlaw-gold underline-offset-2 hover:underline"
                onClick={() => setExportSel({ clients: true, commercial: true, support: true })}
              >
                Marcar tudo
              </button>
              <span className="text-white/30">·</span>
              <button
                type="button"
                className="text-xs font-semibold text-mindlaw-gold underline-offset-2 hover:underline"
                onClick={() => setExportSel({ clients: false, commercial: true, support: true })}
              >
                Apenas comercial + suporte
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/85 hover:border-white/40"
                onClick={() => setExportModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl bg-mindlaw-gold px-4 py-2 text-sm font-semibold text-mindlaw-dark hover:bg-mindlaw-gold/90"
                onClick={() => void runExportDownload(exportSel)}
              >
                Descarregar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MobileHeader
        onOpenMenu={() => setMobileOpen(true)}
        trailing={<PeriodFilterPopover startDate={startDate} endDate={endDate} onChange={setPeriod} />}
      />
      <Sidebar
        active={tab}
        onSelect={setTab}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onExport={openExportModal}
        onLogout={handleLogout}
      />

      <div className="lg:flex">
        <DesktopSpacer />
        <main className="flex-1 space-y-8 px-4 py-6 pb-24 lg:px-10 lg:py-10">
          <div className="flex justify-end lg:sticky lg:top-0 lg:z-20 lg:-mt-2 lg:pb-2">
            <div className="hidden lg:block">
              <PeriodFilterPopover startDate={startDate} endDate={endDate} onChange={setPeriod} />
            </div>
          </div>

          {tab === "resumo" && (
            <section className="space-y-6">
              <h2 className="text-center text-2xl font-extrabold tracking-tight md:text-3xl">Visão geral</h2>
              {isLoading ? (
                <>
                  <SkeletonKpiGrid />
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <SkeletonChart className="h-72 w-full" />
                    <SkeletonChart className="h-72 w-full" />
                  </div>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <SkeletonChart className="mx-auto mt-4 h-64 max-w-sm w-full" />
                    <SkeletonChart className="h-64 w-full" />
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => setTab("comercial")}
                      className="glass-card mx-auto w-full max-w-md cursor-pointer border-t-2 border-mindlaw-gold p-5 text-center transition hover:border-mindlaw-gold/80"
                    >
                      <p className="text-xs text-white/65">Receita ganha (período)</p>
                      <p className="kpi-mono mt-2 text-3xl font-extrabold text-mindlaw-gold">{formatBrl(receitaPeriodo)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("churn")}
                      className="glass-card mx-auto w-full max-w-md cursor-pointer border-t-2 border-mindlaw-gold p-5 text-center transition hover:border-mindlaw-gold/80"
                    >
                      <p className="text-xs text-white/65">MRR perdido (período)</p>
                      <p className="kpi-mono mt-2 text-3xl font-extrabold text-white">{formatBrl(mrrPerdido)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("churn")}
                      className="glass-card mx-auto w-full max-w-md cursor-pointer border-t-2 border-mindlaw-gold p-5 text-center transition hover:border-mindlaw-gold/80"
                    >
                      <KpiWithTooltip
                        label="Churn rate (visão suporte)"
                        tooltip="Cancelamentos do mês / Total de clientes ativos."
                      >
                        <p className="kpi-mono mt-2 text-3xl font-extrabold text-white">
                          {formatPct(support?.kpis.churnRate || 0)}
                        </p>
                      </KpiWithTooltip>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("nps")}
                      className="glass-card mx-auto w-full max-w-md cursor-pointer border-t-2 border-mindlaw-gold p-5 text-center transition hover:border-mindlaw-gold/80"
                    >
                      <KpiWithTooltip label="NPS score (período)" tooltip="(% Promotores - % Detratores) * 100.">
                        <p className="kpi-mono mt-2 text-3xl font-extrabold text-mindlaw-gold">{formatPct(npsCalculado)}</p>
                      </KpiWithTooltip>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/5 bg-mindlaw-teal/80 p-6 backdrop-blur-md">
                      <h3 className="mb-1 text-lg font-semibold text-white">Evolução de clientes ativos</h3>
                      <p className="mb-4 text-xs text-white/80">
                        Contagem mensal pela data de referência (ou cadastro). Apenas contratos com status{" "}
                        <span className="text-mindlaw-gold/90">cliente</span>, respeitando o período e os filtros de
                        clientes ao carregar os dados.
                      </p>
                      {resumoEvolutionTotal === 0 ? (
                        <EmptyState
                          message="Não há clientes ativos com data de referência ou cadastro dentro do período filtrado para montar esta evolução."
                          className="min-h-[18rem]"
                        />
                      ) : (
                        <div className="h-72 w-full">
                          <Line data={resumoEvolutionChartData} options={resumoEvolutionLineOpts} />
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-mindlaw-teal/80 p-6 backdrop-blur-md">
                      <h3 className="mb-1 text-lg font-semibold text-white">Distribuição por plano</h3>
                      <p className="mb-4 text-xs text-white/80">
                        Apenas clientes ativos (status cliente), agrupados por plano (Starter, Premium, Advanced,
                        outros, sem plano).
                      </p>
                      {!resumoPlanChart ? (
                        <EmptyState
                          message="Não há clientes ativos com plano identificável para estes filtros."
                          className="min-h-[18rem]"
                        />
                      ) : (
                        <div className="mx-auto h-72 max-w-sm">
                          <Doughnut data={resumoPlanChart} options={resumoPlansDoughOpts} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <article className="glass-card p-6">
                      <h3 className="mb-4 text-center text-lg font-semibold text-mindlaw-gold">
                        Entradas no período (status)
                      </h3>
                      <p className="text-center text-xs text-white/55">
                        Total: <strong className="text-mindlaw-gold">{entStats.total ?? 0}</strong>
                      </p>
                      {entradasDistribSum === 0 ? (
                        <EmptyState
                          message="Sem distribuição de entradas por status neste período para o filtro atual."
                          className="mt-4 min-h-[16rem]"
                        />
                      ) : (
                        <div className="mx-auto mt-4 h-64 max-w-sm">
                          <Doughnut data={resumoEntradasChart} options={doughOpts} />
                        </div>
                      )}
                    </article>
                    <article className="glass-card p-6">
                      <h3 className="mb-4 text-center text-lg font-semibold text-white/85">Comercial · motivos de perda</h3>
                      {lossLabelsEmpty ? (
                        <EmptyState
                          message="Nenhum motivo de perda registado no período para o filtro atual."
                          className="min-h-[16rem]"
                        />
                      ) : (
                        <div className="h-64">
                          <Bar data={lossData} options={lossBarOpts} />
                        </div>
                      )}
                    </article>
                  </div>

                  <p className="mx-auto max-w-2xl text-center text-sm text-white/55">
                    Indicadores consolidados do período. Clique nos KPIs para abrir a secção correspondente. O gráfico de
                    motivos de perda aplica o mesmo filtro interativo da auditoria comercial.
                  </p>
                </>
              )}
            </section>
          )}

          {tab === "clientes" && (
            <ClientsPanel
              isLoading={isLoading}
              stats={{
                byStatus: (entStats.byStatus as Record<string, number>) || {},
                total: typeof entStats.total === "number" ? entStats.total : 0,
                range: entStats.range as { start?: string; end?: string } | null
              }}
              clientsRaw={clientsFull}
              clientsActiveCliente={clientsActiveCliente}
              filters={clientFilters}
              onFiltersChange={(patch) => setClientFilters((f) => ({ ...f, ...patch }))}
              onToast={showToast}
              onReload={() => void loadCore()}
              chartOptsBar={barOpts as Record<string, unknown>}
              chartOptsDough={doughOpts as Record<string, unknown>}
              searchPrefill={clientsSearchPrefill}
              onConsumedSearchPrefill={() => setClientsSearchPrefill(null)}
              onPlanChartAudit={handlePlanChartAudit}
            />
          )}

          {tab === "comercial" && (
            <section className="space-y-6">
              <h2 className="text-center text-2xl font-extrabold md:text-3xl">Comercial</h2>
              {isLoading || !commercial ? (
                <>
                  <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
                    <SkeletonChart className="h-36 w-full" />
                    <SkeletonChart className="h-36 w-full" />
                  </div>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <SkeletonChart className="h-72 w-full" />
                    <SkeletonChart className="h-72 w-full" />
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
                    <article className="glass-card border-t-2 border-mindlaw-gold p-5 text-center">
                      <KpiWithTooltip
                        label="LTV estimado"
                        tooltip="Ticket Médio Mensal x Tempo médio de retenção."
                      >
                        <p className="kpi-mono mt-2 text-4xl font-extrabold text-mindlaw-gold">
                          {formatBrl(commercial.kpis.ltvEstimado)}
                        </p>
                      </KpiWithTooltip>
                    </article>
                    <article className="glass-card border-t-2 border-mindlaw-gold p-5 text-center">
                      <p className="text-xs text-white/65">Taxa de conversão</p>
                      <p className="kpi-mono mt-2 text-4xl font-extrabold text-mindlaw-gold">
                        {formatPct(commercial.kpis.taxaConversao)}
                      </p>
                    </article>
                  </div>
                  <p className="mx-auto max-w-2xl text-center text-xs text-white/50">
                    Clique no funil ou nas barras de motivos para filtrar a aba Auditoria (comercial).
                  </p>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <article className="glass-card p-6">
                      <h3 className="mb-4 text-center text-lg font-semibold text-mindlaw-gold">Proporção de fechamento</h3>
                      {funnelTotal === 0 ? (
                        <EmptyState
                          message="Sem movimentação de funil (ganho / perdido / negociação) no período."
                          className="min-h-[18rem]"
                        />
                      ) : (
                        <div className="mx-auto h-72 w-full max-w-md">
                          {funnelData ? <Doughnut data={funnelData} options={funnelOpts} /> : null}
                        </div>
                      )}
                    </article>
                    <article className="glass-card p-6">
                      <h3 className="mb-4 text-center text-lg font-semibold text-mindlaw-gold">Motivos de perda</h3>
                      {lossLabelsEmpty ? (
                        <EmptyState
                          message="Nenhum motivo de perda registado no período para o filtro atual."
                          className="min-h-[18rem]"
                        />
                      ) : (
                        <div className="h-72">
                          <Bar data={lossData} options={lossBarOpts} />
                        </div>
                      )}
                    </article>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "churn" && (
            <section className="space-y-6">
              <h2 className="text-center text-2xl font-extrabold md:text-3xl">Churn</h2>
              {isLoading || !support ? (
                <div className="space-y-6">
                  <SkeletonChart className="mx-auto h-44 max-w-md w-full" />
                  <SkeletonChart className="h-52 w-full max-w-4xl mx-auto" />
                  <SkeletonChart className="h-72 w-full" />
                </div>
              ) : (
                <>
                  <p className="mx-auto max-w-2xl text-center text-sm text-white/60">
                    Taxa de churn, calendário por ano e motivos. Clique num mês para ver detalhes; no gráfico de motivos,
                    filtre a auditoria.
                  </p>
                  <article className="glass-card mx-auto max-w-md border-t-2 border-mindlaw-gold p-6 text-center">
                    <KpiWithTooltip
                      label="Churn rate (visão suporte)"
                      tooltip="Cancelamentos do mês / Total de clientes ativos."
                    >
                      <p className="kpi-mono mt-2 text-4xl font-extrabold text-white">{formatPct(support.kpis.churnRate)}</p>
                    </KpiWithTooltip>
                  </article>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <label className="text-xs text-white/60">Ano (heatmap)</label>
                    <select
                      value={churnYear}
                      onChange={(e) => {
                        setChurnYear(Number(e.target.value));
                        setSelectedChurnMonth(null);
                      }}
                      className="min-h-[48px] rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
                    >
                      {[0, 1, 2, 3, 4, 5].map((i) => {
                        const y = new Date().getFullYear() - i;
                        return (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="glass-card p-4">
                    <h3 className="mb-3 text-center text-sm font-semibold text-white/85">
                      Cancelamentos por mês ({churnYear})
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                      {monthShort.map((m, idx) => {
                        const count = churnByMonth[idx] || 0;
                        const ratio = count / maxChurn;
                        const r = Math.round(31 + (197 - 31) * ratio);
                        const g = Math.round(20 + (160 - 20) * ratio);
                        const b = Math.round(0 + (89 - 0) * ratio);
                        const bg = `rgb(${r},${g},${b})`;
                        const textColor = ratio > 0.55 ? "#001A1E" : "#FFFFFF";
                        const active = safeMonthIdx === idx;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSelectedChurnMonth(idx)}
                            className={`rounded-xl p-3 text-center text-xs font-semibold transition ring-mindlaw-gold/80 ${
                              active ? "ring-2" : ""
                            }`}
                            style={{ background: bg, color: textColor }}
                          >
                            {m}
                            <br />
                            <span className="text-[10px]">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <article className="glass-card p-4">
                    <h3 className="mb-2 text-center text-sm font-semibold text-mindlaw-gold">
                      Detalhes · {monthShort[safeMonthIdx]}
                    </h3>
                    <div className="mx-auto max-w-2xl space-y-2">
                      {!churnDetails.length ? (
                        <EmptyState message="Sem cancelamentos registados neste mês." className="py-8" />
                      ) : (
                        churnDetails.map((row, i) => (
                          <article
                            key={`${row.cliente}-${i}`}
                            className="rounded-lg border border-white/10 bg-mindlaw-teal/40 p-3 text-sm"
                          >
                            <button
                              type="button"
                              className="font-semibold text-left text-white hover:text-mindlaw-gold hover:underline"
                              onClick={() => {
                                setClientsSearchPrefill(String(row.cliente || ""));
                                setTab("clientes");
                                showToast(`Cliente: ${row.cliente}`);
                              }}
                            >
                              {row.cliente || "—"}
                            </button>
                            <p className="text-xs text-white/65">
                              {row.plano || "Sem plano"} · status: {row.statusContrato || "—"}
                            </p>
                            <p className="text-xs text-white/65">
                              Data:{" "}
                              {row.dataChurn ? new Date(row.dataChurn).toLocaleDateString("pt-BR") : "—"} · Motivo:{" "}
                              {row.motivoPrincipal || "—"} · Valor: {formatBrl(Number(row.valorPerdido || 0))}
                            </p>
                            {row.funcionalidadeFaltante ? (
                              <p className="text-xs text-white/55">Justificativa: {String(row.funcionalidadeFaltante)}</p>
                            ) : null}
                          </article>
                        ))
                      )}
                    </div>
                  </article>

                  <article className="glass-card p-6">
                    <h3 className="mb-4 text-center text-lg font-semibold text-white/85">Motivos de cancelamento</h3>
                    {churnReasonsSum === 0 ? (
                      <EmptyState
                        message="Sem dados de motivos de cancelamento no período para o filtro atual."
                        className="min-h-[18rem]"
                      />
                    ) : (
                      <div className="h-72">
                        <Bar data={churnBar} options={churnBarOpts} />
                      </div>
                    )}
                  </article>
                </>
              )}
            </section>
          )}

          {tab === "nps" && (
            <section className="space-y-6">
              <h2 className="text-center text-2xl font-extrabold md:text-3xl">NPS</h2>
              {isLoading || !support ? (
                <div className="space-y-6">
                  <SkeletonChart className="mx-auto h-44 max-w-md w-full" />
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <SkeletonChart className="h-80 w-full" />
                    <SkeletonChart className="h-80 w-full" />
                  </div>
                </div>
              ) : (
                <>
                  <p className="mx-auto max-w-2xl text-center text-sm text-white/60">
                    Distribuição e feedback. Clique no gráfico para filtrar a auditoria NPS por categoria.
                  </p>
                  <article className="glass-card mx-auto max-w-md border-t-2 border-mindlaw-gold p-6 text-center">
                    <KpiWithTooltip label="NPS score (período)" tooltip="(% Promotores - % Detratores) * 100.">
                      <p className="kpi-mono mt-2 text-4xl font-extrabold text-mindlaw-gold">{formatPct(npsCalculado)}</p>
                    </KpiWithTooltip>
                    <p className="mt-2 text-[11px] text-white/45">Referência API: {formatPct(support.kpis.npsScore)}</p>
                  </article>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <article className="glass-card p-6">
                      <h3 className="mb-4 text-center text-lg font-semibold text-white/85">Distribuição NPS</h3>
                      {npsDistTotal === 0 ? (
                        <EmptyState
                          message="Sem respostas NPS no período para montar a distribuição."
                          className="min-h-[20rem]"
                        />
                      ) : (
                        <div className="mx-auto h-80 max-w-md">
                          {npsDoughnut ? <Doughnut data={npsDoughnut} options={npsDoughOpts} /> : null}
                        </div>
                      )}
                    </article>
                    <article className="glass-card p-6">
                      <h3 className="mb-4 text-center text-lg font-semibold text-mindlaw-gold">Feed de feedback</h3>
                      <FeedbackFeed items={npsEntries as NpsFeedbackItem[]} />
                    </article>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "lancamentos" && (
            <section className="space-y-6">
              <h2 className="text-center text-2xl font-extrabold md:text-3xl">Lançamentos</h2>
              <LaunchCenter clients={clientsLaunch} onClientsChange={setClientsLaunch} onToast={showToast} />
            </section>
          )}

          {tab === "logs" && (
            <section className="space-y-6">
              <h2 className="text-center text-2xl font-extrabold md:text-3xl">Auditoria</h2>
              <LogsAuditPanel
                isLoading={isLoading}
                rows={logs}
                auditTab={auditTab}
                onAuditTab={setAuditTab}
                logsFilterPlan={logsFilterPlan}
                onLogsFilterPlan={setLogsFilterPlan}
                logsSearchTerm={logsSearchTerm}
                onLogsSearchTerm={setLogsSearchTerm}
                interactiveFilter={interactiveFilter}
                onInteractiveFilter={setInteractiveFilter}
                clientRowsForPlano={clientPlanoLookup}
                onRefresh={loadCore}
                onToast={showToast}
                onGoToClients={(name) => {
                  setClientsSearchPrefill(name);
                  setTab("clientes");
                }}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
