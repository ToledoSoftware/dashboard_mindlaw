import { Suspense } from "react";
import { DashboardApp } from "@/components/DashboardApp";
import { QueryProvider } from "@/components/QueryProvider";

export default function Home() {
  return (
    <QueryProvider>
      <Suspense
        fallback={<div className="min-h-screen bg-mindlaw-dark grain-overlay" aria-busy="true" aria-label="A carregar" />}
      >
        <DashboardApp />
      </Suspense>
    </QueryProvider>
  );
}
