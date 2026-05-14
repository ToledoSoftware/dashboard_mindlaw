"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>('input[name="username"]');
    el?.focus();
  }, []);

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
      if (!res.ok) {
        const msg =
          res.status === 401
            ? "Usuário ou senha inválidos."
            : res.status >= 500
              ? "Serviço indisponível. Tente mais tarde."
              : (data as { error?: string }).error || "Falha no login.";
        throw new Error(msg);
      }
      window.location.href = "/";
    } catch (err) {
      if ((err as Error).name === "TypeError") {
        setError("Sem ligação à rede ou ao servidor.");
      } else {
        setError((err as Error).message);
      }
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
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block text-xs font-semibold uppercase tracking-wide text-white/55">
            Usuário
            <input
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              aria-required="true"
              className="mt-2 min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mindlaw-gold/40"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-white/55">
            Senha
            <span className="relative mt-2 flex">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                aria-required="true"
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/60 py-2 pl-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-mindlaw-gold/40"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-mindlaw-gold"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-mindlaw-gold py-3 text-sm font-bold text-mindlaw-dark hover:bg-mindlaw-gold/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
