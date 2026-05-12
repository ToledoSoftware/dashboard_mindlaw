"use client";

import type { ReactNode } from "react";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Smile,
  TrendingDown,
  Users,
  X
} from "lucide-react";

export type TabId =
  | "resumo"
  | "clientes"
  | "comercial"
  | "churn"
  | "nps"
  | "lancamentos"
  | "logs";

const NAV: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "resumo", label: "Visão geral", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "clientes", label: "Clientes", icon: <Users className="h-4 w-4" /> },
  { id: "comercial", label: "Comercial", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "churn", label: "Churn", icon: <TrendingDown className="h-4 w-4" /> },
  { id: "nps", label: "NPS", icon: <Smile className="h-4 w-4" /> },
  { id: "lancamentos", label: "Lançamentos", icon: <Rocket className="h-4 w-4" /> },
  { id: "logs", label: "Auditoria", icon: <ClipboardList className="h-4 w-4" /> }
];

type SidebarProps = {
  active: TabId;
  onSelect: (t: TabId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onExport: () => void;
  onLogout: () => void;
};

export function Sidebar({ active, onSelect, mobileOpen, onCloseMobile, onExport, onLogout }: SidebarProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onCloseMobile}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw,280px)] flex-col border-r border-mindlaw-gold/25 bg-mindlaw-teal/95 px-4 py-6 shadow-2xl backdrop-blur-md transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between lg:justify-end">
          <span className="pl-1 text-xs font-semibold uppercase tracking-widest text-mindlaw-gold/90 lg:hidden">
            Menu
          </span>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg border border-white/10 p-2 text-white/80 hover:border-mindlaw-gold/40 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-6 flex justify-center">
          <img src="/mindlaw_fundo_escuro.svg" alt="MindLaw" className="h-16 w-16 object-contain" />
        </div>
        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {NAV.map((item) => {
            const on = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onCloseMobile();
                }}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors min-h-[48px] ${
                  on
                    ? "border-mindlaw-gold/50 bg-mindlaw-gold/15 text-mindlaw-gold"
                    : "border-transparent text-white/85 hover:border-white/10 hover:bg-white/5"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={onExport}
          className="mt-4 min-h-[48px] w-full rounded-xl border border-mindlaw-gold/35 bg-mindlaw-gold/10 px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] text-mindlaw-gold hover:bg-mindlaw-gold hover:text-mindlaw-dark"
        >
          Gerar planilha
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-white/80 hover:border-mindlaw-gold/30"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>
    </>
  );
}

export function MobileHeader({
  onOpenMenu,
  trailing
}: {
  onOpenMenu: () => void;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/5 bg-mindlaw-teal/90 px-4 py-3 backdrop-blur-md lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-lg border border-white/10 p-2 text-white hover:border-mindlaw-gold/40"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {trailing}
        <img src="/mindlaw_fundo_escuro.svg" alt="" className="h-10 w-10 shrink-0 object-contain" />
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-mindlaw-gold/80">MindLaw</span>
      </div>
    </header>
  );
}

export function DesktopSpacer() {
  return <div className="hidden w-[280px] shrink-0 lg:block" aria-hidden />;
}
