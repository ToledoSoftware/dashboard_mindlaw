"use client";

import type { ReactNode } from "react";

const base = "animate-pulse rounded-lg bg-white/5";

type SkeletonCardProps = {
  className?: string;
  children?: ReactNode;
};

/** Bloco base de skeleton (Tailwind pulse). */
export function SkeletonCard({ className = "", children }: SkeletonCardProps) {
  return <div className={`${base} ${className}`.trim()}>{children}</div>;
}

/** Grade de KPIs (4 colunas em desktop). */
export function SkeletonKpiGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className="h-28 w-full border border-white/5" />
      ))}
    </div>
  );
}

/** Área reservada a gráfico (altura fixa). */
export function SkeletonChart({ className = "h-64 w-full" }: { className?: string }) {
  return <SkeletonCard className={className} />;
}

/** Linhas de tabela (auditoria). */
export function SkeletonTableRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
