"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha no login.");
      if (data.token) localStorage.setItem("mindlaw_token", data.token);
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mindlaw-dark px-4 grain-overlay">
      <div className="glass-card w-full max-w-md border-t-2 border-mindlaw-gold p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/mindlaw_fundo_escuro.svg" alt="MindLaw" className="h-16 w-16" />
          <h1 className="text-xl font-bold text-mindlaw-gold">MindLaw</h1>
          <p className="text-center text-sm text-white/60">Acesse o centro de controle</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-white/55">
            Usuário
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-2 min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mindlaw-gold/40"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-white/55">
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-2 min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mindlaw-gold/40"
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-mindlaw-gold py-3 text-sm font-bold text-mindlaw-dark hover:bg-mindlaw-gold/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
