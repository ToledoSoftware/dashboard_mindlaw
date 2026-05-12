"use client";

import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import { monthRangeToDates } from "@/lib/dashboardQuery";

export type PeriodFilterProps = {
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

export function PeriodFilters({ startDate, endDate, onChange }: PeriodFilterProps) {
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

  const selectClass =
    "mt-0.5 h-9 w-full min-w-[4.5rem] rounded-lg border border-white/12 bg-mindlaw-dark/60 px-2 text-xs outline-none ring-mindlaw-gold/25 focus:ring-1 sm:min-w-[5rem]";

  return (
    <div className="glass-card mx-auto w-full max-w-4xl px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex shrink-0 items-center gap-1.5 text-mindlaw-gold">
          <CalendarRange className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Período</span>
        </div>

        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
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

        <div className="hidden h-6 w-px shrink-0 bg-white/10 sm:block" aria-hidden />

        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
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

        <p className="w-full pb-0.5 text-[10px] leading-tight text-white/35 sm:ml-auto sm:w-auto">
          {MESES[sm.m - 1]} {sm.y} — {MESES[em.m - 1]} {em.y} · inclusivo nas APIs.
        </p>
      </div>
    </div>
  );
}

export function periodQuery(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "";
  return `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
}
