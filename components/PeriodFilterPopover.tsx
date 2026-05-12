"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
import { monthRangeToDates } from "@/lib/dashboardQuery";

export type PeriodFilterPopoverProps = {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
};

function parseParts(ymd: string) {
  const [y, m] = String(ymd || "").split("-").map(Number);
  const now = new Date();
  return { y: Number.isFinite(y) ? y : now.getFullYear(), m: Number.isFinite(m) ? m : now.getMonth() + 1 };
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function PeriodFilterPopover({ startDate, endDate, onChange }: PeriodFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sm = useMemo(() => parseParts(startDate), [startDate]);
  const em = useMemo(() => parseParts(endDate), [endDate]);

  function applyRange(nextSm: number, nextSy: number, nextEm: number, nextEy: number) {
    const { startDate: sd, endDate: ed } = monthRangeToDates(nextSm, nextSy, nextEm, nextEy);
    onChange({ startDate: sd, endDate: ed });
  }

  const yearOpts = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => y - 4 + i);
  }, []);

  const summary = `${MESES[sm.m - 1]} ${sm.y} — ${MESES[em.m - 1]} ${em.y}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  const selectClass =
    "mt-0.5 h-9 w-full min-w-[4.5rem] rounded-lg border border-white/12 bg-mindlaw-dark/60 px-2 text-xs outline-none ring-mindlaw-gold/25 focus:ring-1 sm:min-w-[5rem]";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-mindlaw-dark/50 px-3 py-2 text-xs font-semibold text-white/90 hover:border-mindlaw-gold/45"
      >
        <CalendarRange className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
        <span className="hidden sm:inline">Filtrar período</span>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-[80] mt-2 w-[min(92vw,20rem)] rounded-xl border border-white/15 bg-mindlaw-teal p-4 shadow-xl"
          role="dialog"
          aria-label="Filtro de período"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Intervalo (mês/ano)</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <span className="pb-2 text-[10px] font-medium uppercase text-white/40">De</span>
              <label className="w-[4.75rem] shrink-0 text-[10px] text-white/55 sm:w-[5.25rem]">
                Mês
                <select
                  value={sm.m}
                  onChange={(e) => applyRange(Number(e.target.value), sm.y, em.m, em.y)}
                  className={selectClass}
                >
                  {MESES.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-[4.5rem] shrink-0 text-[10px] text-white/55 sm:w-[4.75rem]">
                Ano
                <select
                  value={sm.y}
                  onChange={(e) => applyRange(sm.m, Number(e.target.value), em.m, em.y)}
                  className={selectClass}
                >
                  {yearOpts.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <span className="pb-2 text-[10px] font-medium uppercase text-white/40">Até</span>
              <label className="w-[4.75rem] shrink-0 text-[10px] text-white/55 sm:w-[5.25rem]">
                Mês
                <select
                  value={em.m}
                  onChange={(e) => applyRange(sm.m, sm.y, Number(e.target.value), em.y)}
                  className={selectClass}
                >
                  {MESES.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-[4.5rem] shrink-0 text-[10px] text-white/55 sm:w-[4.75rem]">
                Ano
                <select
                  value={em.y}
                  onChange={(e) => applyRange(sm.m, sm.y, em.m, Number(e.target.value))}
                  className={selectClass}
                >
                  {yearOpts.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                className="rounded-lg border border-mindlaw-gold/40 bg-mindlaw-gold/15 px-3 py-2 text-xs font-semibold text-mindlaw-gold hover:bg-mindlaw-gold/25"
                onClick={() => {
                  const tM = em.m;
                  const tY = em.y;
                  const d = new Date(tY, tM, 1);
                  applyRange(sm.m, sm.y, d.getMonth() + 1, d.getFullYear());
                }}
              >
                + mês
              </button>
              <button
                type="button"
                className="ml-auto rounded-lg border border-white/12 px-3 py-2 text-xs text-white/75 hover:border-white/25"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>
            <p className="text-[10px] leading-tight text-white/40">{summary} · inclusivo nas APIs.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
