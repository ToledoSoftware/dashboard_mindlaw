"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";

type KpiWithTooltipProps = {
  label: string;
  tooltip: string;
  children: ReactNode;
  className?: string;
};

/** Título de KPI com ícone de contexto BI e tooltip em hover. */
export function KpiWithTooltip({ label, tooltip, children, className = "" }: KpiWithTooltipProps) {
  return (
    <div className={`relative flex flex-col items-center ${className}`.trim()}>
      <div className="group relative mb-0.5 flex items-center justify-center gap-1.5">
        <p className="text-xs text-white/65">{label}</p>
        <Info className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full left-1/2 z-[120] mb-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-mindlaw-gold/35 bg-mindlaw-teal px-3 py-2 text-left text-[11px] leading-snug text-white/90 opacity-0 shadow-xl ring-1 ring-black/20 transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
        >
          {tooltip}
        </span>
      </div>
      {children}
    </div>
  );
}
