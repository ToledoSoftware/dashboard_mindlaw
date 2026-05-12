import type { ReactNode } from "react";
import type { Metadata } from "next";
import { DM_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap"
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "MindLaw | Centro de Controle",
  description: "Painel MindLaw — Comercial, Suporte e Lançamentos"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plusJakarta.variable} ${dmMono.variable}`}>
      <body className="grain-overlay font-sans">{children}</body>
    </html>
  );
}
