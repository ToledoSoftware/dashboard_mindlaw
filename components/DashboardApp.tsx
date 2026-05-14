"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import "@/components/chartRegister";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PeriodFilterPopover } from "@/components/PeriodFilterPopover";
import { Sidebar, MobileHeader, DesktopSpacer, type TabId } from "@/components/Sidebar";
import { LaunchCenter, type ClientRow } from "@/components/LaunchCenter";
import { FeedbackFeed, type NpsFeedbackItem } from "@/components/FeedbackFeed";
import { LogsAuditPanel, type AuditLogRow, type AuditNavigateToClientPayload, type InteractiveLogFilter } from "@/components/LogsAuditPanel";
import { ClientsPanel, type ClientDoc } from "@/components/ClientsPanel";
import { GlobalSearch } from "@/components/GlobalSearch";
import { calcularNpsReal } from "@/lib/npsScore";
import { buildDashboardQuery, formatLocalDateYMD, CLIENT_STATUS_LABELS } from "@/lib/dashboardQuery";
import { mindlawJson, mindlawAuthHeaders } from "@/lib/mindlawFetch";
import { normalizeText } from "@/lib/stringUtils";
import { formatBrl, formatPct } from "@/lib/formatMoney";
import { clientContractStatusChipClass, clientContractStatusLabel } from "@/lib/clientContractStatus";
import { withHoverPointer } from "@/lib/chartInteractions";
import { SkeletonChart, SkeletonKpiGrid } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { KpiWithTooltip } from "@/components/KpiWithTooltip";
import { useFocusTrap } from "@/lib/useFocusTrap";

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

type SupportDashboard = {
  kpis: { churnRate: number; npsScore: number };
  churnByMonth: number[];
  churnDetailsByMonth?: ChurnDetailRow[][];
  churnReasonDistribution: Record<string, number>;
  npsDistribution: { Promotor: number; Neutro: number; Detrator: number };
  support: Record<string, unknown>[];
  totalMrrPerdido: number;
  clientEntradaStats?: { byStatus: Record<string, number>; total: number; range?: unknown };
};

type MainDashboardPayload = {
  clientsLaunch: ClientRow[];
  commercial: {
    kpis: { ltvEstimado: number; taxaConversao: number };
    funnel: { gains: number; losses: number; negotiating: number };
    lossReasons: Record<string, number>;
    sales?: Record<string, unknown>[];
  };
  support: SupportDashboard;
  clientsFull: ClientDoc[];
  clientsActiveCliente: ClientDoc[];
};

type LogsPageResponse = {
  logs: AuditLogRow[];
  logsTotal: number;
  logsHasMore: boolean;
  nextOffset?: number;
};

const LOGS_PAGE = 120;
const TAB_IDS: TabId[] = ["resumo", "clientes", "comercial", "churn", "nps", "lancamentos", "logs"];

function logsListUrl(apiQuery: string, offset: number) {
  const join = apiQuery.includes("?") ? "&" : "?";
  return `/api/logs${apiQuery}${join}logsLimit=${LOGS_PAGE}&logsOffset=${offset}`;
}

async function fetchMainDashboard(
  signal: AbortSignal,
  apiQuery: string,
  startDate: string,
  endDate: string,
  churnYear: number
): Promise<MainDashboardPayload> {
  const suffix = apiQuery;
  const generalCliente = buildDashboardQuery({
    startDate,
    endDate,
    clientStatus: "cliente",
    churnYear
  });
  const [cForm, comm, sup, clientsList, activeList] = await Promise.all([
    mindlawJson<{ clients: { _id: string; nome: string; plano?: string; telefone?: string; statusContrato?: string }[] }>(
      `/api/clients?forForms=1`,
      { signal }
    ),
    mindlawJson<MainDashboardPayload["commercial"]>(`/api/commercial/dashboard${suffix}`, { signal }),
    mindlawJson<SupportDashboard>(`/api/support/dashboard${suffix}`, { signal }),
    mindlawJson<{ clients: ClientDoc[] }>(`/api/clients${suffix}`, { signal }),
    mindlawJson<{ clients: ClientDoc[] }>(`/api/clients${generalCliente}`, { signal })
  ]);
  return {
    clientsLaunch: (cForm.clients || []).map((c) => ({
      _id: String(c._id),
      nome: c.nome,
      plano: c.plano,
      telefone: c.telefone,
      statusContrato: c.statusContrato
    })),
    commercial: comm,
    support: sup,
    clientsFull: (clientsList.clients || []).map((c) => ({
      ...c,
      _id: String((c as { _id?: unknown })._id)
    })) as ClientDoc[],
    clientsActiveCliente: (activeList.clients || []).map((c) => ({
      ...c,
      _id: String((c as { _id?: unknown })._id)
    })) as ClientDoc[]
  };
}

export function DashboardApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const urlInitRef = useRef(false);
  const exportModalRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<TabId>("resumo");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [{ startDate, endDate }, setPeriod] = useState(monthBoundsLocal);
  type ToastState = { msg: string; variant: "info" | "error" } | null;
  const [toast, setToast] = useState<ToastState>(null);
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
  const [clientsAuditCreatePrefill, setClientsAuditCreatePrefill] = useState<AuditNavigateToClientPayload | null>(null);
  const [launchPrefillId, setLaunchPrefillId] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSel, setExportSel] = useState({
    clients: false,
    commercial: true,
    support: true
  });

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

  const showToast = useCallback((msg: string, variant: "info" | "error" = "info") => {
    setToast({ msg, variant });
    window.setTimeout(() => setToast(null), variant === "error" ? 12_000 : 3200);
  }, []);

  const clearLaunchPrefill = useCallback(() => setLaunchPrefillId(null), []);

  useLayoutEffect(() => {
    if (urlInitRef.current) return;
    urlInitRef.current = true;
    const t = searchParams.get("tab") as TabId | null;
    if (t && TAB_IDS.includes(t)) setTab(t);
    const sd = searchParams.get("startDate");
    const ed = searchParams.get("endDate");
    if (sd && ed) setPeriod({ startDate: sd, endDate: ed });
  }, [searchParams]);

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("tab", tab);
    p.set("startDate", startDate);
    p.set("endDate", endDate);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }, [tab, startDate, endDate, pathname, router]);

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

  const mainQuery = useQuery({
    queryKey: ["mindlaw-main", apiQuery],
    queryFn: ({ signal }) => fetchMainDashboard(signal, apiQuery, startDate, endDate, churnYear)
  });

  const logsInfinite = useInfiniteQuery({
    queryKey: ["mindlaw-logs", apiQuery],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      mindlawJson<LogsPageResponse>(logsListUrl(apiQuery, Number(pageParam)), { signal }),
    getNextPageParam: (last) => (last.logsHasMore && last.nextOffset != null ? last.nextOffset : undefined)
  });

  const lastMainErr = useRef<string | null>(null);
  useEffect(() => {
    const m = mainQuery.error ? (mainQuery.error as Error).message : null;
    if (m && m !== lastMainErr.current) {
      lastMainErr.current = m;
      showToast(m, "error");
    }
    if (!mainQuery.error) lastMainErr.current = null;
  }, [mainQuery.error, showToast]);

  const lastLogsErr = useRef<string | null>(null);
  useEffect(() => {
    const m = logsInfinite.error ? (logsInfinite.error as Error).message : null;
    if (m && m !== lastLogsErr.current) {
      lastLogsErr.current = m;
      showToast(m, "error");
    }
    if (!logsInfinite.error) lastLogsErr.current = null;
  }, [logsInfinite.error, showToast]);

  const sessionQ = useQuery({
    queryKey: ["auth-me"],
    queryFn: ({ signal }) => mindlawJson<{ expiresAtMs?: number | null }>("/api/auth/me", { signal }),
    staleTime: 60_000,
    refetchInterval: 120_000
  });
  const expMs = sessionQ.data?.expiresAtMs ?? null;
  const sessionWarn =
    expMs != null && expMs > Date.now() && expMs - Date.now() < 20 * 60 * 1000;

  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mindlaw-main", apiQuery] }),
      queryClient.invalidateQueries({ queryKey: ["mindlaw-logs", apiQuery] })
    ]);
  }, [apiQuery, queryClient]);

  const onClientsLaunchChange = useCallback(
    (u: SetStateAction<ClientRow[]>) => {
      queryClient.setQueryData(["mindlaw-main", apiQuery], (prev: MainDashboardPayload | undefined) => {
        if (!prev) return prev;
        const next = typeof u === "function" ? (u as (c: ClientRow[]) => ClientRow[])(prev.clientsLaunch) : u;
        return { ...prev, clientsLaunch: next };
      });
    },
    [apiQuery, queryClient]
  );

  const clientsLaunch = useMemo(() => mainQuery.data?.clientsLaunch ?? [], [mainQuery.data]);
  const commercial = useMemo(() => mainQuery.data?.commercial ?? null, [mainQuery.data]);
  const support = useMemo(() => mainQuery.data?.support ?? null, [mainQuery.data]);
  const clientsFull = useMemo(() => mainQuery.data?.clientsFull ?? [], [mainQuery.data]);
  const clientsActiveCliente = useMemo(() => mainQuery.data?.clientsActiveCliente ?? [], [mainQuery.data]);
  const logs = useMemo(
    () => logsInfinite.data?.pages.flatMap((p) => p.logs) ?? [],
    [logsInfinite.data]
  );

  const isLoading =
    mainQuery.isPending || (logsInfinite.isPending && logsInfinite.data == null);

  useFocusTrap(exportModalOpen, exportModalRef, () => setExportModalOpen(false));

  const npsEntries = useMemo(() => {
    const s = support?.support || [];
    return s.filter((r) => r.registerType === "nps" || typeof r.notaNPS === "number");
  }, [support]);

  const npsCalculado = useMemo(() => calcularNpsReal(npsEntries as { notaNPS?: number }[]), [npsEntries]);

  const clientRegistryByNomeKey = useMemo(() => {
    const m = new Map<string, { nome: string; plano?: string; telefone?: string; statusContrato?: string }>();
    const merge = (c: { nome: string; plano?: string; telefone?: string; statusContrato?: string }) => {
      const k = normalizeText(String(c.nome || ""));
      if (!k) return;
      const prev = m.get(k);
      const plano = String(c.plano ?? "").trim();
      const tel = String(c.telefone ?? "").trim();
      m.set(k, {
        nome: c.nome,
        plano: plano || prev?.plano,
        telefone: tel || prev?.telefone,
        statusContrato: c.statusContrato || prev?.statusContrato
      });
    };
    for (const c of clientsLaunch) merge(c);
    for (const c of clientsFull) merge(c);
    return m;
  }, [clientsLaunch, clientsFull]);

  const clientPlanoLookup = useMemo(() => Array.from(clientRegistryByNomeKey.values()), [clientRegistryByNomeKey]);

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
        showToast((e as Error).message, "error");
      }
    },
    [apiQuery, showToast]
  );

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
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

  const comercialMirrorLogs = useMemo(() => {
    const sales = commercial?.sales;
    if (!sales?.length) return [];
    const byNome = clientRegistryByNomeKey;
    return sales.map((raw) => {
      const item = raw as Record<string, unknown>;
      const nome = String(item.cliente || "");
      const hit = byNome.get(normalizeText(nome));
      const snapPlano = String(item.plano || "").trim();
      const snapTel = String(item.telefone || "").trim();
      const motivo = String(item.motivoPerda || "Sem Motivo");
      const funcionalidadeFaltante = String(item.funcionalidadeFaltante || "");
      const detalhe = funcionalidadeFaltante ? `${motivo} — ${funcionalidadeFaltante}` : motivo;
      const planoDisplay = snapPlano || String(hit?.plano || "");
      return {
        id: String(item._id || ""),
        origem: "comercial",
        tipo: "Comercial",
        cliente: nome,
        plano: planoDisplay,
        statusContrato: hit?.statusContrato,
        data: item.data as string | undefined,
        status: String(item.status || ""),
        detalhe,
        payload: {
          cliente: nome,
          data: item.data,
          valorContrato: Number(item.valorContrato ?? 0),
          status: String(item.status || "Em Negociacao"),
          motivoPerda: item.motivoPerda || "Sem Motivo",
          funcionalidadeFaltante: item.funcionalidadeFaltante || "",
          detalhamentoTecnico: item.detalhamentoTecnico || "",
          competidor: item.competidor || "",
          telefone: snapTel,
          plano: snapPlano || String(hit?.plano || "")
        }
      } as AuditLogRow;
    });
  }, [commercial?.sales, clientRegistryByNomeKey]);

  return (
    <div className="relative min-h-screen bg-mindlaw-dark">
      {sessionWarn ? (
        <div
          className="fixed inset-x-0 top-0 z-[110] border-b border-amber-400/50 bg-amber-950/90 px-4 py-2 text-center text-xs font-semibold text-amber-100 backdrop-blur-sm"
          role="status"
        >
          A sua sessão expira em breve. Guarde o trabalho em curso ou volte a iniciar sessão após guardar.
        </div>
      ) : null}

      {toast ? (
        <div
          role={toast.variant === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`fixed right-4 top-4 z-[100] flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.variant === "error"
              ? "border-rose-400/50 bg-rose-950/90 text-rose-50"
              : "border-mindlaw-gold/40 bg-mindlaw-teal text-white"
          }`}
        >
          <span className="flex-1">{toast.msg}</span>
          {toast.variant === "error" ? (
            <button
              type="button"
              className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-xs font-semibold hover:bg-white/10"
              onClick={() => setToast(null)}
            >
              Fechar
            </button>
          ) : null}
        </div>
      ) : null}

      {exportModalOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setExportModalOpen(false)}
        >
          <div
            ref={exportModalRef}
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
        trailing={
          <div className="flex max-w-[100vw] items-center gap-2 pr-1">
            <div className="min-w-0 flex-1">
              <GlobalSearch
                clients={clientsFull}
                logRows={logs}
                onGoClient={(nome) => {
                  setClientsSearchPrefill(nome);
                  setTab("clientes");
                  showToast(`Cliente: ${nome}`);
                }}
                onGoLog={(hint, at) => {
                  setAuditTab(at);
                  setLogsSearchTerm(hint);
                  setTab("logs");
                  showToast("Auditoria aberta com filtro da busca.");
                }}
              />
            </div>
            <PeriodFilterPopover startDate={startDate} endDate={endDate} onChange={setPeriod} />
          </div>
        }
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
          <div className="flex w-full flex-wrap items-center justify-end gap-3 lg:sticky lg:top-0 lg:z-20 lg:-mt-2 lg:pb-2">
            <div className="hidden min-w-[12rem] max-w-md flex-1 lg:block">
              <GlobalSearch
                clients={clientsFull}
                logRows={logs}
                onGoClient={(nome) => {
                  setClientsSearchPrefill(nome);
                  setTab("clientes");
                  showToast(`Cliente: ${nome}`);
                }}
                onGoLog={(hint, at) => {
                  setAuditTab(at);
                  setLogsSearchTerm(hint);
                  setTab("logs");
                  showToast("Auditoria aberta com filtro da busca.");
                }}
              />
            </div>
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
              onReload={() => void refreshAll()}
              chartOptsBar={barOpts as Record<string, unknown>}
              chartOptsDough={doughOpts as Record<string, unknown>}
              searchPrefill={clientsSearchPrefill}
              onConsumedSearchPrefill={() => setClientsSearchPrefill(null)}
              auditCreatePrefill={clientsAuditCreatePrefill}
              onConsumedAuditCreatePrefill={() => setClientsAuditCreatePrefill(null)}
              onPlanChartAudit={handlePlanChartAudit}
              auditLogs={logs}
              onClientCreated={(id) => {
                setLaunchPrefillId(id);
                setTab("lancamentos");
                showToast("Cliente criado! Preencha o lançamento.");
              }}
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

                  <article className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-mindlaw-teal/35 p-5 shadow-lg shadow-black/25 backdrop-blur-md">
                    <h3 className="mb-1 text-center text-lg font-semibold text-mindlaw-gold">Tabela espelho · comercial</h3>
                    <p className="mb-4 text-center text-xs text-white/50">
                      Lançamentos comerciais do período (mesma origem da auditoria).
                    </p>
                    {comercialMirrorLogs.length === 0 ? (
                      <EmptyState message="Sem registos comerciais no período filtrado." className="min-h-[12rem]" />
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-white/10 bg-mindlaw-dark/25">
                        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/15 bg-mindlaw-dark/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                              <th className="px-3 py-3">Cliente</th>
                              <th className="px-3 py-3">Data</th>
                              <th className="px-3 py-3">Plano</th>
                              <th className="px-3 py-3">Funil</th>
                              <th className="px-3 py-3">Contrato</th>
                              <th className="px-3 py-3">Motivo</th>
                              <th className="px-3 py-3 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comercialMirrorLogs.map((row) => {
                              const p = row.payload as { motivoPerda?: string; valorContrato?: number } | undefined;
                              const motivo = p?.motivoPerda || "—";
                              const valor = Number(p?.valorContrato ?? 0);
                              const dataStr = row.data
                                ? new Date(String(row.data)).toLocaleDateString("pt-BR")
                                : "—";
                              const st = row.statusContrato;
                              return (
                                <tr
                                  key={row.id}
                                  className="border-b border-white/5 text-white/85 transition hover:bg-mindlaw-gold/5"
                                >
                                  <td className="px-3 py-2.5 font-medium text-white">{row.cliente || "—"}</td>
                                  <td className="px-3 py-2.5 text-white/75">{dataStr}</td>
                                  <td className="px-3 py-2.5 text-white/70">{row.plano || "—"}</td>
                                  <td className="px-3 py-2.5 text-white/75">{row.status || "—"}</td>
                                  <td className="px-3 py-2.5">
                                    <span
                                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${clientContractStatusChipClass(st)}`}
                                    >
                                      {clientContractStatusLabel(st)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-white/70">{motivo}</td>
                                  <td className="kpi-mono px-3 py-2.5 text-right text-mindlaw-gold/95">{formatBrl(valor)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
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
              <LaunchCenter
                clients={clientsLaunch}
                onClientsChange={onClientsLaunchChange}
                onToast={showToast}
                prefillClientId={launchPrefillId}
                onPrefillConsumed={clearLaunchPrefill}
              />
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
                onRefresh={refreshAll}
                onToast={showToast}
                logsTotal={logsInfinite.data?.pages?.[0]?.logsTotal ?? logs.length}
                logsHasMore={Boolean(logsInfinite.hasNextPage)}
                onLoadMoreLogs={() => void logsInfinite.fetchNextPage()}
                isLoadingMoreLogs={logsInfinite.isFetchingNextPage}
                onGoToClients={(ctx) => {
                  setClientsSearchPrefill(ctx.nome);
                  setClientsAuditCreatePrefill(ctx);
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
