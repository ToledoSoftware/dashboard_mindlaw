"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { mindlawJson } from "@/lib/mindlawFetch";
import { normalizeText } from "@/lib/stringUtils";
import { buildNpsRespostasDisplay } from "@/lib/npsEditClient";
import { LogEditModal, type AuditLogRow } from "@/components/LogEditModal";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonTableRows } from "@/components/SkeletonCard";

export type { AuditLogRow };

export type InteractiveLogFilter =
  | null
  | { type: "commercialStatus"; value: string }
  | { type: "commercialReason"; value: string }
  | { type: "supportNps"; value: string }
  | { type: "supportChurnReason"; value: string }
  | { type: "auditPlan"; value: string };

type Props = {
  rows: AuditLogRow[];
  isLoading?: boolean;
  auditTab: "comercial" | "churn" | "nps";
  onAuditTab: (t: "comercial" | "churn" | "nps") => void;
  logsFilterPlan: string;
  onLogsFilterPlan: (v: string) => void;
  logsSearchTerm: string;
  onLogsSearchTerm: (v: string) => void;
  interactiveFilter: InteractiveLogFilter;
  onInteractiveFilter: (f: InteractiveLogFilter) => void;
  clientRowsForPlano: { nome: string; plano?: string; telefone?: string }[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
  onGoToClients?: (clientName: string) => void;
};

const LOG_DETAIL_PREVIEW = 120;

const PLAN_AUDIT_LABELS: Record<string, string> = {
  starter: "Starter",
  premium: "Premium",
  advanced: "Advanced",
  outros: "Outros",
  sem_plano: "Sem plano"
};

function planMatchesFilter(rawPlano: string, logsFilterPlan: string) {
  const raw = normalizeText(rawPlano || "");
  if (logsFilterPlan === "sem_plano") return !raw;
  if (logsFilterPlan === "outros") {
    return raw && !raw.includes("starter") && !raw.includes("premium") && !raw.includes("advanced");
  }
  if (!logsFilterPlan) return true;
  return raw.includes(logsFilterPlan);
}

function lookupPlano(clientRows: { nome: string; plano?: string; telefone?: string }[], cliente: string) {
  const t = normalizeText(cliente);
  const hit = clientRows.find((c) => normalizeText(c.nome) === t);
  return hit?.plano || "";
}

function lookupTelefoneRaw(clientRows: { nome: string; telefone?: string }[], cliente: string) {
  const t = normalizeText(cliente);
  const hit = clientRows.find((c) => normalizeText(c.nome) === t);
  return String(hit?.telefone || "").trim();
}

function formatPhoneBr(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function LogsAuditPanel({
  rows,
  isLoading = false,
  auditTab,
  onAuditTab,
  logsFilterPlan,
  onLogsFilterPlan,
  logsSearchTerm,
  onLogsSearchTerm,
  interactiveFilter,
  onInteractiveFilter,
  clientRowsForPlano,
  onRefresh,
  onToast,
  onGoToClients
}: Props) {
  const [editRow, setEditRow] = useState<AuditLogRow | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    let list = [...(rows || [])];
    if (interactiveFilter?.type === "commercialStatus") {
      list = list.filter(
        (item) =>
          normalizeText(item.tipo) === "comercial" && normalizeText(item.status || "") === interactiveFilter.value
      );
    }
    if (interactiveFilter?.type === "supportNps") {
      list = list.filter(
        (item) => normalizeText(item.tipo) === "nps" && normalizeText(item.status || "").includes(interactiveFilter.value)
      );
    }
    if (interactiveFilter?.type === "commercialReason") {
      list = list.filter((item) => {
        if (normalizeText(item.origem) !== "comercial") return false;
        const blob = normalizeText(
          String((item.payload as { motivoPerda?: string })?.motivoPerda || item.detalhe || "")
        );
        return blob.includes(interactiveFilter.value);
      });
    }
    if (interactiveFilter?.type === "supportChurnReason") {
      list = list.filter((item) => {
        if (normalizeText(item.origem) !== "churn") return false;
        const blob = normalizeText(
          String((item.payload as { motivoPrincipal?: string })?.motivoPrincipal || item.detalhe || "")
        );
        return blob.includes(interactiveFilter.value);
      });
    }
    list = list.filter((item) => normalizeText(item.origem) === auditTab);
    if (logsFilterPlan) {
      list = list.filter((item) => planMatchesFilter(item.plano || "", logsFilterPlan));
    }
    if (logsSearchTerm.trim()) {
      const term = normalizeText(logsSearchTerm);
      list = list.filter((item) => {
        if (normalizeText(item.cliente).includes(term) || normalizeText(item.detalhe).includes(term)) return true;
        const p = item.payload || {};
        if (auditTab === "comercial") {
          if (normalizeText(String((p as { valorContrato?: unknown }).valorContrato ?? "")).includes(term))
            return true;
          if (normalizeText(String((p as { motivoPerda?: string }).motivoPerda || "")).includes(term)) return true;
          if (normalizeText(String((p as { competidor?: string }).competidor || "")).includes(term)) return true;
        }
        if (auditTab === "churn") {
          if (normalizeText(String((p as { motivoPrincipal?: string }).motivoPrincipal || "")).includes(term))
            return true;
          if (normalizeText(String((p as { valorPerdido?: unknown }).valorPerdido ?? "")).includes(term)) return true;
        }
        if (auditTab === "nps") {
          const uni = normalizeText(buildNpsRespostasDisplay(item));
          if (uni.includes(term)) return true;
          const rawCom = String((p as { comentarioNPS?: string }).comentarioNPS ?? "").trim();
          if (rawCom && normalizeText(rawCom).includes(term)) return true;
        }
        const notaStr = item.npsNota != null && item.npsNota !== undefined ? String(item.npsNota) : "";
        if (auditTab === "nps" && notaStr && normalizeText(notaStr).includes(term)) return true;
        return false;
      });
    }
    return list;
  }, [rows, auditTab, logsFilterPlan, logsSearchTerm, interactiveFilter]);

  async function handleDelete(row: AuditLogRow) {
    if (!window.confirm("Tem certeza que deseja apagar este lançamento? Esta ação não pode ser desfeita.")) return;
    try {
      if (row.origem === "comercial") {
        await mindlawJson(`/api/sales/${row.id}`, { method: "DELETE" });
      } else {
        await mindlawJson(`/api/support/${row.id}`, { method: "DELETE" });
      }
      onToast("Lançamento apagado.");
      await onRefresh();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  function statusChipClass(status: string | undefined, tipo: string) {
    const normalized = String(status || "").toLowerCase();
    if (normalizeText(tipo) === "nps") {
      if (normalized.includes("promotor")) return "border border-emerald-400/50 bg-emerald-500/25 text-emerald-100";
      if (normalized.includes("detrator")) return "border border-rose-400/50 bg-rose-500/25 text-rose-100";
      if (normalized.includes("neutro")) return "border border-amber-400/50 bg-amber-500/25 text-amber-50";
    }
    if (normalized.includes("ganho")) return "border border-emerald-400/50 bg-emerald-500/25 text-emerald-100";
    if (normalized.includes("perdido") || normalized.includes("detrator") || normalized.includes("churn"))
      return "border border-rose-400/50 bg-rose-500/25 text-rose-100";
    return "border border-sky-400/40 bg-sky-500/20 text-sky-100";
  }

  function renderDetalheCell(row: AuditLogRow) {
    const raw = String(row.detalhe || "-");
    const isLong = raw.length > LOG_DETAIL_PREVIEW;
    const open = expanded[row.id];
    if (!isLong) return <span className="text-white/75">{raw}</span>;
    return (
      <div>
        <span className="text-white/75">{open ? raw : `${raw.slice(0, LOG_DETAIL_PREVIEW)}…`}</span>
        <button
          type="button"
          className="ml-2 text-xs text-mindlaw-gold hover:underline"
          onClick={() => setExpanded((e) => ({ ...e, [row.id]: !open }))}
        >
          {open ? "Ver menos" : "Ver mais"}
        </button>
      </div>
    );
  }

  async function handleCopy(text: string) {
    const ok = await copyToClipboard(text);
    onToast(ok ? "Copiado!" : "Não foi possível copiar.");
  }

  const filterChip =
    interactiveFilter?.type && interactiveFilter.value ? (
      <div className="flex flex-wrap justify-center">
        <button
          type="button"
          onClick={() => {
            if (interactiveFilter?.type === "auditPlan") onLogsFilterPlan("");
            onInteractiveFilter(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-mindlaw-gold/40 bg-mindlaw-gold/10 px-3 py-1.5 text-xs font-semibold text-mindlaw-gold hover:border-mindlaw-gold/70"
        >
          <span className="font-normal text-white/90">
            {interactiveFilter.type === "commercialStatus"
              ? "Comercial · status"
              : interactiveFilter.type === "commercialReason"
                ? "Comercial · motivo"
                : interactiveFilter.type === "supportNps"
                  ? "NPS · categoria"
                  : interactiveFilter.type === "supportChurnReason"
                    ? "Churn · motivo"
                    : interactiveFilter.type === "auditPlan"
                      ? "Auditoria · plano"
                      : "Filtro"}{" "}
            :{" "}
            <strong className="text-white">
              {interactiveFilter.type === "auditPlan"
                ? PLAN_AUDIT_LABELS[interactiveFilter.value] || interactiveFilter.value
                : interactiveFilter.value}
            </strong>
          </span>
          Limpar filtros
        </button>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-center gap-2">
        {(["comercial", "churn", "nps"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onAuditTab(t)}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              auditTab === t
                ? "bg-mindlaw-gold text-mindlaw-dark"
                : "border border-white/15 bg-mindlaw-dark/40 text-white/75 hover:border-mindlaw-gold/40"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filterChip}

      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-center">
        <label className="block min-w-[140px] text-xs text-white/60">
          Plano
          <select
            value={logsFilterPlan}
            onChange={(e) => {
              onLogsFilterPlan(e.target.value);
              if (interactiveFilter?.type === "auditPlan") onInteractiveFilter(null);
            }}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="starter">Starter</option>
            <option value="premium">Premium</option>
            <option value="advanced">Advanced</option>
            <option value="outros">Outros</option>
            <option value="sem_plano">Sem plano</option>
          </select>
        </label>
        <label className="block min-w-[200px] flex-1 text-xs text-white/60">
          Busca
          <input
            value={logsSearchTerm}
            onChange={(e) => onLogsSearchTerm(e.target.value)}
            placeholder="Cliente, detalhe, motivo…"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10 p-2">
          <SkeletonTableRows rows={8} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum registo corresponde aos filtros desta aba. Limpe a busca, o plano ou o filtro interativo do gráfico." />
      ) : (
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-white/10 bg-mindlaw-teal/80 text-xs uppercase tracking-wide text-mindlaw-gold/90">
            <tr>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Cliente</th>
              <th className="px-3 py-3">Telefone</th>
              <th className="px-3 py-3">Plano</th>
              <th className="px-3 py-3">Data</th>
              <th className="px-3 py-3">Status</th>
              {auditTab === "nps" ? <th className="px-3 py-3 font-mono">Nota</th> : null}
              <th className="px-3 py-3">Detalhe</th>
              {auditTab === "nps" ? <th className="px-3 py-3">Respostas</th> : null}
              <th className="px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isNps = auditTab === "nps";
              const npsText = isNps ? buildNpsRespostasDisplay(r) : "";
              const telRaw = lookupTelefoneRaw(clientRowsForPlano, r.cliente);
              const telDigits = telRaw.replace(/\D/g, "");
              const telDisplay = formatPhoneBr(telRaw);
              return (
                <tr key={`${r.origem}-${r.id}`} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-3 py-3 font-medium text-mindlaw-gold">{r.tipo}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        title="Clicar para copiar"
                        className="cursor-pointer text-left font-medium text-white transition-colors hover:text-mindlaw-gold"
                        onClick={() => void handleCopy(r.cliente)}
                      >
                        {r.cliente}
                      </button>
                      {onGoToClients ? (
                        <button
                          type="button"
                          title="Abrir no Cliente"
                          aria-label="Abrir no Cliente"
                          className="inline-flex shrink-0 cursor-pointer rounded p-0.5 text-white/40 transition-colors hover:text-mindlaw-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mindlaw-gold/60"
                          onClick={() => onGoToClients(r.cliente)}
                        >
                          <ExternalLink size={16} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-white/75">
                    {telDisplay ? (
                      <button
                        type="button"
                        title="Clicar para copiar"
                        className="cursor-pointer font-mono text-sm transition-colors hover:text-mindlaw-gold"
                        onClick={() => void handleCopy(telDigits || telRaw)}
                      >
                        {telDisplay}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-white/70">{r.plano || "—"}</td>
                  <td className="kpi-mono px-3 py-3 text-xs text-white/65">
                    {r.data ? new Date(r.data).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${statusChipClass(r.status, r.tipo)}`}
                    >
                      {r.status || "—"}
                    </span>
                  </td>
                  {isNps ? (
                    <td className="kpi-mono px-3 py-3 text-white/85">
                      {r.npsNota != null && r.npsNota !== undefined ? String(r.npsNota) : "—"}
                    </td>
                  ) : null}
                  <td className="max-w-xs px-3 py-3 align-top text-white/75">{isNps ? "—" : renderDetalheCell(r)}</td>
                  {isNps ? (
                    <td className="max-w-[220px] px-3 py-3 align-top text-xs text-white/55">
                      <span className="line-clamp-4 whitespace-pre-wrap">{npsText || "—"}</span>
                    </td>
                  ) : null}
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        aria-label="Editar"
                        className="rounded-lg border border-white/15 p-2 hover:border-mindlaw-gold/50"
                        onClick={() => setEditRow(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Excluir"
                        className="rounded-lg border border-rose-500/30 p-2 text-rose-200 hover:bg-rose-500/10"
                        onClick={() => void handleDelete(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <p className="text-center text-xs text-white/45">
        {isLoading ? "A carregar…" : `${filtered.length} registro(s) na aba ${auditTab}.`}
      </p>

      {editRow ? (
        <LogEditModal
          row={editRow}
          relatedPlano={lookupPlano(clientRowsForPlano, editRow.cliente)}
          onClose={() => setEditRow(null)}
          onSaved={() => void onRefresh()}
          onToast={onToast}
        />
      ) : null}
    </div>
  );
}
