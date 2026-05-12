"use client";

import { Inbox } from "lucide-react";

type EmptyStateProps = {
  message: string;
  className?: string;
};

/** Estado vazio alinhado ao design system teal & gold. */
export function EmptyState({ message, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-mindlaw-gold/25 bg-mindlaw-teal/50 px-6 py-12 text-center ${className}`.trim()}
    >
      <div className="rounded-full border border-mindlaw-gold/35 bg-mindlaw-gold/10 p-4 text-mindlaw-gold">
        <Inbox className="h-10 w-10 opacity-90" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="max-w-md text-sm leading-relaxed text-white/70">{message}</p>
    </div>
  );
}
