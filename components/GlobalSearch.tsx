"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { normalizeText } from "@/lib/stringUtils";
import type { ClientDoc } from "@/components/ClientsPanel";
import type { AuditLogRow } from "@/components/LogsAuditPanel";

type Props = {
  clients: ClientDoc[];
  logRows: AuditLogRow[];
  onGoClient: (nome: string) => void;
  onGoLog: (clienteHint: string, auditTab: "comercial" | "churn" | "nps") => void;
};

function origemToAuditTab(o: string): "comercial" | "churn" | "nps" {
  const x = normalizeText(o);
  if (x === "comercial") return "comercial";
  if (x === "churn") return "churn";
  return "nps";
}

export function GlobalSearch({ clients, logRows, onGoClient, onGoLog }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const t = normalizeText(q.trim());
    if (t.length < 2) return { clients: [] as ClientDoc[], logs: [] as AuditLogRow[] };
    const max = 10;
    const cl = clients.filter((c) => normalizeText(String(c.nome || "")).includes(t)).slice(0, max);
    const lg = logRows
      .filter(
        (r) =>
          normalizeText(String(r.cliente || "")).includes(t) ||
          normalizeText(String(r.detalhe || "")).includes(t)
      )
      .slice(0, max);
    return { clients: cl, logs: lg };
  }, [clients, logRows, q]);

  const hasResults = results.clients.length > 0 || results.logs.length > 0;

  return (
    <div className="relative" ref={rootRef}>
      <label className="flex items-center gap-2 rounded-xl border border-white/12 bg-mindlaw-dark/50 px-3 py-2 text-xs text-white/70 focus-within:border-mindlaw-gold/40">
        <Search className="h-4 w-4 shrink-0 text-mindlaw-gold/90" aria-hidden />
        <span className="sr-only">Busca global</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente ou lançamento…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          autoComplete="off"
        />
      </label>
      {open && q.trim().length >= 2 ? (
        <div
          className="absolute right-0 top-full z-[90] mt-2 max-h-[min(70vh,22rem)] w-[min(96vw,22rem)] overflow-y-auto rounded-xl border border-white/15 bg-mindlaw-teal p-2 shadow-xl"
          role="listbox"
          aria-label="Resultados da busca"
        >
          {!hasResults ? (
            <p className="px-2 py-3 text-center text-xs text-white/55">Sem resultados.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {results.clients.map((c) => (
                <li key={c._id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-2 text-left text-white hover:bg-mindlaw-gold/15"
                    onClick={() => {
                      onGoClient(String(c.nome || ""));
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="text-[10px] font-semibold uppercase text-mindlaw-gold/90">Cliente</span>
                    <br />
                    <span className="font-medium">{c.nome}</span>
                  </button>
                </li>
              ))}
              {results.logs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-2 text-left text-white hover:bg-mindlaw-gold/15"
                    onClick={() => {
                      onGoLog(String(r.cliente || ""), origemToAuditTab(r.origem));
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="text-[10px] font-semibold uppercase text-mindlaw-gold/90">
                      {normalizeText(r.origem) === "comercial" ? "Comercial" : r.origem}
                    </span>
                    <br />
                    <span className="font-medium">{r.cliente || "—"}</span>
                    <span className="block truncate text-xs text-white/55">{r.detalhe || r.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
