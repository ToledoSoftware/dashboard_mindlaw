"use client";

import { EmptyState } from "@/components/EmptyState";

export type NpsFeedbackItem = {
  _id?: string;
  cliente?: string;
  comentarioNPS?: string;
  notaNPS?: number;
  dataNPS?: string;
  createdAt?: string;
};

export function FeedbackFeed({ items }: { items: NpsFeedbackItem[] }) {
  const rows = [...items]
    .filter((i) => String(i.comentarioNPS || "").trim())
    .sort((a, b) => {
      const da = new Date(a.dataNPS || a.createdAt || 0).getTime();
      const db = new Date(b.dataNPS || b.createdAt || 0).getTime();
      return db - da;
    })
    .slice(0, 24);

  if (!rows.length) {
    return <EmptyState message="Nenhum comentário NPS recente no período para o filtro atual." />;
  }

  return (
    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
      {rows.map((r) => (
        <article
          key={String(r._id || r.cliente + (r.dataNPS || "") + (r.comentarioNPS || "").slice(0, 8))}
          className="rounded-2xl border border-white/10 bg-mindlaw-teal/70 p-4 shadow-inner backdrop-blur-md"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-mindlaw-gold">{r.cliente || "—"}</p>
            <span className="kpi-mono rounded-lg border border-mindlaw-gold/30 bg-mindlaw-dark/40 px-2 py-0.5 text-xs text-mindlaw-gold">
              Nota {typeof r.notaNPS === "number" ? r.notaNPS : "—"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/85">{r.comentarioNPS}</p>
          <p className="mt-2 text-[11px] text-white/45">
            {r.dataNPS || r.createdAt
              ? new Date(r.dataNPS || r.createdAt || "").toLocaleString("pt-BR")
              : ""}
          </p>
        </article>
      ))}
    </div>
  );
}
