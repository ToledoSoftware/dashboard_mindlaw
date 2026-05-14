"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { mindlawJson } from "@/lib/mindlawFetch";
import { findClientNameDuplicate } from "@/lib/clientDuplicateHint";

export type ClientRow = { _id: string; nome: string; plano?: string; telefone?: string; statusContrato?: string };

const NEW = "__novo_cliente__";

type RegistroTipo = "comercial" | "churn" | "nps";

function formatPhoneBr(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function hasValidPhoneBr(value: string) {
  return String(value || "").replace(/\D/g, "").length === 11;
}

type LaunchCenterProps = {
  clients: ClientRow[];
  onClientsChange: Dispatch<SetStateAction<ClientRow[]>>;
  onToast: (msg: string) => void;
  prefillClientId?: string | null;
  onPrefillConsumed?: () => void;
};

function clientIdFromDoc(doc: Record<string, unknown> | null | undefined): string {
  if (!doc) return "";
  const raw = doc._id ?? doc.id;
  if (raw && typeof raw === "object" && "toString" in raw) return String((raw as { toString: () => string }).toString());
  return raw != null ? String(raw) : "";
}

export function LaunchCenter({
  clients,
  onClientsChange,
  onToast,
  prefillClientId = null,
  onPrefillConsumed
}: LaunchCenterProps) {
  const [tipo, setTipo] = useState<RegistroTipo>("comercial");
  const [clienteId, setClienteId] = useState("");
  const [showNovo, setShowNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoPlano, setNovoPlano] = useState("");
  const [saving, setSaving] = useState(false);

  const [saleData, setSaleData] = useState("");
  const [saleValor, setSaleValor] = useState("");
  const [saleStatus, setSaleStatus] = useState("Em Negociacao");
  const [saleMotivo, setSaleMotivo] = useState("Sem Motivo");
  const [saleJust, setSaleJust] = useState("");
  const [salePlano, setSalePlano] = useState("");
  const [saleComp, setSaleComp] = useState("");
  const [saleDet, setSaleDet] = useState("");

  const [churnData, setChurnData] = useState("");
  const [churnValor, setChurnValor] = useState("");
  const [churnMotivo, setChurnMotivo] = useState("Sem Motivo");
  const [churnJust, setChurnJust] = useState("");
  const [churnPlano, setChurnPlano] = useState("");

  const [npsData, setNpsData] = useState("");
  const [npsNota, setNpsNota] = useState("");
  const [npsComent, setNpsComent] = useState("");

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c._id, c.nome));
    return m;
  }, [clients]);

  useEffect(() => {
    if (!prefillClientId) return;
    setClienteId(prefillClientId);
    setShowNovo(false);
    onPrefillConsumed?.();
  }, [prefillClientId, onPrefillConsumed]);

  function resetForms() {
    setSaleData("");
    setSaleValor("");
    setSaleStatus("Em Negociacao");
    setSaleMotivo("Sem Motivo");
    setSaleJust("");
    setSalePlano("");
    setSaleComp("");
    setSaleDet("");
    setChurnData("");
    setChurnValor("");
    setChurnMotivo("Sem Motivo");
    setChurnJust("");
    setChurnPlano("");
    setNpsData("");
    setNpsNota("");
    setNpsComent("");
    setClienteId("");
    setShowNovo(false);
    setNovoNome("");
    setNovoTelefone("");
    setNovoPlano("");
  }

  async function salvarNovoCliente(): Promise<{ id: string; nome: string } | null> {
    const nomeInput = novoNome.trim();
    if (!nomeInput) {
      onToast("Informe o nome do cliente.");
      return null;
    }
    if (novoTelefone.trim() && !hasValidPhoneBr(novoTelefone)) {
      onToast("Telefone inválido. Use (xx) x xxxx-xxxx.");
      return null;
    }
    const dup = findClientNameDuplicate(clients, nomeInput);
    if (dup && !window.confirm(`Já existe cliente com o mesmo nome normalizado: "${dup}". Continuar?`)) {
      return null;
    }
    const r = await mindlawJson<{ data?: Record<string, unknown> }>("/api/clients", {
      method: "POST",
      body: JSON.stringify({ nome: nomeInput, plano: novoPlano || "", telefone: novoTelefone.trim() })
    });
    const doc = (r?.data ?? r) as Record<string, unknown> | undefined;
    const id = clientIdFromDoc(doc);
    const nomeExact = String(doc?.nome ?? nomeInput).trim();
    if (!id) {
      onToast("Resposta inválida do servidor ao criar cliente (sem ID).");
      return null;
    }
    const row: ClientRow = {
      _id: id,
      nome: nomeExact,
      plano: doc?.plano != null ? String(doc.plano) : undefined,
      telefone: doc?.telefone != null ? String(doc.telefone) : novoTelefone.trim() || undefined,
      statusContrato: doc?.statusContrato != null ? String(doc.statusContrato) : "novo_lead"
    };
    onClientsChange((prev) => {
      const without = prev.filter((c) => c._id !== id);
      return [...without, row].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    });
    setClienteId(id);
    setShowNovo(false);
    onToast("Cliente cadastrado.");
    return { id, nome: nomeExact };
  }

  async function handleSalvar() {
    setSaving(true);
    try {
      let idRef = clienteId;
      let nome = "";

      if (idRef === NEW) {
        const created = await salvarNovoCliente();
        if (!created) {
          setSaving(false);
          return;
        }
        idRef = created.id;
        nome = created.nome;
      } else {
        if (!idRef) {
          onToast("Selecione um cliente.");
          setSaving(false);
          return;
        }
        nome = nomePorId.get(idRef) || "";
      }

      if (!nome) {
        onToast("Cliente inválido.");
        setSaving(false);
        return;
      }

      const selSupport = idRef && idRef !== NEW ? clients.find((c) => c._id === idRef) : undefined;
      const telefoneLancamento = (novoTelefone.trim() || String(selSupport?.telefone || "")).trim();

      if (tipo === "comercial") {
        const precisa = ["Falta de Funcionalidade", "Falta de Integracao", "Outros"].includes(saleMotivo);
        if (precisa && !saleJust.trim()) {
          onToast("Justificativa obrigatória para este motivo de perda.");
          setSaving(false);
          return;
        }
        await mindlawJson("/api/sales", {
          method: "POST",
          body: JSON.stringify({
            cliente: nome,
            data: saleData || new Date().toISOString().slice(0, 10),
            valorContrato: Number(saleValor || 0),
            status: saleStatus,
            motivoPerda: saleMotivo,
            justificativaMotivo: saleJust,
            plano: salePlano,
            telefone: telefoneLancamento,
            competidor: saleComp,
            detalhamentoTecnico: saleDet
          })
        });
        onToast("Venda comercial salva.");
      } else if (tipo === "churn") {
        const precisa = ["Falta de Funcionalidade", "Falta de Integracao", "Outros"].includes(churnMotivo);
        if (precisa && !churnJust.trim()) {
          onToast("Justificativa obrigatória para este motivo de churn.");
          setSaving(false);
          return;
        }
        await mindlawJson("/api/support/churn", {
          method: "POST",
          body: JSON.stringify({
            cliente: nome,
            dataChurn: churnData || new Date().toISOString().slice(0, 10),
            valorPerdido: Number(churnValor || 0),
            motivoPrincipal: churnMotivo,
            justificativaMotivo: churnJust,
            plano: churnPlano,
            telefone: telefoneLancamento
          })
        });
        onToast("Churn registrado.");
      } else {
        const n = Number(npsNota);
        if (!Number.isFinite(n) || n < 0 || n > 10) {
          onToast("Nota NPS deve ser entre 0 e 10.");
          setSaving(false);
          return;
        }
        await mindlawJson("/api/support/nps", {
          method: "POST",
          body: JSON.stringify({
            cliente: nome,
            dataNPS: npsData || new Date().toISOString().slice(0, 10),
            notaNPS: n,
            comentarioNPS: npsComent,
            plano: "",
            telefone: telefoneLancamento
          })
        });
        onToast("Feedback NPS salvo.");
      }
      resetForms();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const labelSalvar =
    tipo === "comercial" ? "Salvar venda comercial" : tipo === "churn" ? "Salvar churn" : "Salvar feedback NPS";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <article className="glass-card border-t-2 border-mindlaw-gold p-6 space-y-5">
        <div>
          <h3 className="text-center text-lg font-semibold text-mindlaw-gold">Centro de lançamentos</h3>
          <p className="mt-1 text-center text-xs text-white/55">Um único fluxo — escolha o tipo e salve.</p>
        </div>

        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
          Tipo de registro
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as RegistroTipo);
              setClienteId("");
              setShowNovo(false);
            }}
            className="mt-2 min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mindlaw-gold/40"
          >
            <option value="comercial">Venda comercial</option>
            <option value="churn">Churn (cancelamento)</option>
            <option value="nps">Feedback NPS</option>
          </select>
        </label>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Cliente</label>
          <select
            value={showNovo ? NEW : clienteId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === NEW) {
                setShowNovo(true);
                setClienteId(NEW);
              } else {
                setShowNovo(false);
                setClienteId(v);
              }
            }}
            className="mt-2 min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mindlaw-gold/40"
          >
            <option value="">Selecione um cliente</option>
            <option value={NEW}>+ Novo cliente</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        {showNovo && (
          <div className="rounded-xl border border-mindlaw-gold/25 bg-mindlaw-dark/40 p-4 space-y-3">
            <p className="text-xs font-semibold text-mindlaw-gold">Novo cliente</p>
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome"
              className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-teal/40 px-3 py-2 text-sm"
            />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={novoTelefone}
              onChange={(e) => setNovoTelefone(formatPhoneBr(e.target.value))}
              placeholder="Telefone (opcional)"
              maxLength={16}
              className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-teal/40 px-3 py-2 text-sm"
            />
            <select
              value={novoPlano}
              onChange={(e) => setNovoPlano(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-teal/40 px-3 py-2 text-sm"
            >
              <option value="">Sem plano</option>
              <option value="Starter">Starter</option>
              <option value="Premium">Premium</option>
              <option value="Advanced">Advanced</option>
              <option value="Outros">Outros</option>
            </select>
          </div>
        )}

        {tipo === "comercial" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                type="date"
                value={saleData}
                onChange={(e) => setSaleData(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor do contrato (R$)"
                value={saleValor}
                onChange={(e) => setSaleValor(e.target.value)}
                className="kpi-mono min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={saleStatus}
                onChange={(e) => setSaleStatus(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              >
                <option value="Em Negociacao">Em negociação</option>
                <option value="Ganho">Ganho</option>
                <option value="Perdido">Perdido</option>
              </select>
              <select
                value={saleMotivo}
                onChange={(e) => setSaleMotivo(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              >
                <option value="Sem Motivo">Sem motivo</option>
                <option value="Preco">Preço</option>
                <option value="Falta de Funcionalidade">Falta de funcionalidade</option>
                <option value="Falta de Integracao">Falta de integração</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
            {["Falta de Funcionalidade", "Falta de Integracao", "Outros"].includes(saleMotivo) && (
              <textarea
                value={saleJust}
                onChange={(e) => setSaleJust(e.target.value)}
                rows={2}
                placeholder="Justificativa do motivo"
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
            )}
            <select
              value={salePlano}
              onChange={(e) => setSalePlano(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
            >
              <option value="">Sem plano</option>
              <option value="Starter">Starter</option>
              <option value="Premium">Premium</option>
              <option value="Advanced">Advanced</option>
              <option value="Outros">Outros</option>
            </select>
            <input
              value={saleComp}
              onChange={(e) => setSaleComp(e.target.value)}
              placeholder="Competidor"
              className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
            />
            <textarea
              value={saleDet}
              onChange={(e) => setSaleDet(e.target.value)}
              rows={3}
              placeholder="Detalhamento técnico"
              className="w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
            />
          </div>
        )}

        {tipo === "churn" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                type="date"
                value={churnData}
                onChange={(e) => setChurnData(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor perdido (MRR)"
                value={churnValor}
                onChange={(e) => setChurnValor(e.target.value)}
                className="kpi-mono min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
            </div>
            <select
              value={churnMotivo}
              onChange={(e) => setChurnMotivo(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
            >
              <option value="Sem Motivo">Sem motivo</option>
              <option value="Preco">Preço</option>
              <option value="Falta de Funcionalidade">Falta de funcionalidade</option>
              <option value="Falta de Integracao">Falta de integração</option>
              <option value="Atendimento">Atendimento</option>
              <option value="Outros">Outros</option>
            </select>
            {["Falta de Funcionalidade", "Falta de Integracao", "Outros"].includes(churnMotivo) && (
              <textarea
                value={churnJust}
                onChange={(e) => setChurnJust(e.target.value)}
                rows={2}
                placeholder="Justificativa do motivo"
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
            )}
            <select
              value={churnPlano}
              onChange={(e) => setChurnPlano(e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
            >
              <option value="">Sem plano</option>
              <option value="Starter">Starter</option>
              <option value="Premium">Premium</option>
              <option value="Advanced">Advanced</option>
              <option value="Outros">Outros</option>
            </select>
          </div>
        )}

        {tipo === "nps" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                type="date"
                value={npsData}
                onChange={(e) => setNpsData(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                max={10}
                placeholder="Nota (0 a 10)"
                value={npsNota}
                onChange={(e) => setNpsNota(e.target.value)}
                className="kpi-mono min-h-[48px] w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={npsComent}
              onChange={(e) => setNpsComent(e.target.value)}
              rows={3}
              placeholder="Comentário"
              className="w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2 text-sm"
            />
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={handleSalvar}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-mindlaw-gold px-4 py-3 text-sm font-bold text-mindlaw-dark transition hover:bg-mindlaw-gold/90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {labelSalvar}
        </button>
      </article>
    </div>
  );
}
