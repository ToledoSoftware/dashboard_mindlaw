"use client";

import { useEffect, useState } from "react";
import { mindlawJson } from "@/lib/mindlawFetch";
import {
  CHURN_MOTIVOS,
  COMERCIAL_MOTIVOS,
  isMotivoComDetalhamento,
  mapPlanToOption
} from "@/lib/logConstants";
import { buildLegacyCombinedComentarioFromFields, resolveNpsFieldsForEdit } from "@/lib/npsEditClient";

export type AuditLogRow = {
  id: string;
  tipo: string;
  origem: string;
  cliente: string;
  plano?: string;
  data?: string;
  status?: string;
  detalhe: string;
  npsNota?: number | null;
  npsColunas?: Record<string, string> | null;
  payload?: Record<string, unknown>;
};

type Props = {
  row: AuditLogRow | null;
  relatedPlano?: string;
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string) => void;
};

const planSelectOptions = [
  { value: "", label: "Sem plano" },
  { value: "Starter", label: "Starter" },
  { value: "Premium", label: "Premium" },
  { value: "Advanced", label: "Advanced" },
  { value: "Outros", label: "Outros" }
];

export function LogEditModal({ row, relatedPlano, onClose, onSaved, onToast }: Props) {
  const [saving, setSaving] = useState(false);

  const [comCliente, setComCliente] = useState("");
  const [comData, setComData] = useState("");
  const [comValor, setComValor] = useState(0);
  const [comStatus, setComStatus] = useState("Em Negociacao");
  const [comMotivo, setComMotivo] = useState("Sem Motivo");
  const [comJust, setComJust] = useState("");
  const [comComp, setComComp] = useState("");
  const [comDetalhe, setComDetalhe] = useState("");
  const [comPlano, setComPlano] = useState("");

  const [chCliente, setChCliente] = useState("");
  const [chData, setChData] = useState("");
  const [chValor, setChValor] = useState(0);
  const [chMotivo, setChMotivo] = useState("Sem Motivo");
  const [chJust, setChJust] = useState("");
  const [chPlano, setChPlano] = useState("");

  const [npsCliente, setNpsCliente] = useState("");
  const [npsData, setNpsData] = useState("");
  const [npsNota, setNpsNota] = useState("");
  const [npsPlano, setNpsPlano] = useState("");
  const [npsFields, setNpsFields] = useState({
    npsMelhorarExperiencia: "",
    npsFaltouNota9: "",
    npsAreasMelhorar: "",
    npsExperienciaAteAqui: "",
    npsFuncionalidadeDiaadia: "",
    npsComentarioAdicional: ""
  });

  useEffect(() => {
    if (!row) return;
    const p = row.payload || {};
    if (row.origem === "comercial") {
      setComCliente(String(p.cliente || row.cliente || ""));
      setComData(p.data ? String(p.data).slice(0, 10) : "");
      setComValor(Number(p.valorContrato ?? 0));
      setComStatus(String(p.status || "Em Negociacao"));
      setComMotivo(String(p.motivoPerda || "Sem Motivo"));
      setComJust(String(p.funcionalidadeFaltante || ""));
      setComComp(String(p.competidor || ""));
      setComDetalhe(String(p.detalhamentoTecnico || ""));
      setComPlano(mapPlanToOption(String(relatedPlano || row.plano || "")));
    } else if (row.origem === "churn") {
      setChCliente(String(p.cliente || row.cliente || ""));
      setChData(p.dataChurn ? String(p.dataChurn).slice(0, 10) : "");
      setChValor(Number(p.valorPerdido ?? 0));
      setChMotivo(String(p.motivoPrincipal || "Sem Motivo"));
      setChJust(String(p.funcionalidadeFaltante || ""));
      setChPlano(mapPlanToOption(String(relatedPlano || row.plano || "")));
    } else if (row.origem === "nps") {
      setNpsCliente(String(p.cliente || row.cliente || ""));
      setNpsData(p.dataNPS ? String(p.dataNPS).slice(0, 10) : "");
      setNpsNota(String(p.notaNPS ?? ""));
      setNpsPlano(mapPlanToOption(String(relatedPlano || row.plano || "")));
      setNpsFields(resolveNpsFieldsForEdit(row));
    }
  }, [row, relatedPlano]);

  if (!row) return null;

  const showComJust = isMotivoComDetalhamento(comMotivo);
  const showChJust = isMotivoComDetalhamento(chMotivo);

  async function handleSave() {
    if (!row?.id) return;
    setSaving(true);
    try {
      if (row.origem === "comercial") {
        if (isMotivoComDetalhamento(comMotivo) && !comJust.trim()) {
          throw new Error("Descreva o detalhe do motivo selecionado.");
        }
        await mindlawJson(`/api/sales/${row.id}`, {
          method: "PUT",
          body: JSON.stringify({
            cliente: comCliente.trim(),
            data: comData || null,
            valorContrato: comValor,
            status: comStatus,
            plano: comPlano,
            motivoPerda: comMotivo,
            justificativaMotivo: comJust.trim(),
            funcionalidadeFaltante: comJust.trim(),
            competidor: comComp.trim(),
            detalhamentoTecnico: comDetalhe.trim()
          })
        });
      } else if (row.origem === "churn") {
        if (isMotivoComDetalhamento(chMotivo) && !chJust.trim()) {
          throw new Error("Descreva o detalhe do motivo selecionado.");
        }
        await mindlawJson(`/api/support/${row.id}`, {
          method: "PUT",
          body: JSON.stringify({
            registerType: "churn",
            cliente: chCliente.trim(),
            dataChurn: chData || null,
            valorPerdido: chValor,
            motivoPrincipal: chMotivo,
            justificativaMotivo: chJust.trim(),
            funcionalidadeFaltante: chJust.trim(),
            plano: chPlano
          })
        });
      } else if (row.origem === "nps") {
        const comentarioNPS = buildLegacyCombinedComentarioFromFields(npsFields);
        await mindlawJson(`/api/support/${row.id}`, {
          method: "PUT",
          body: JSON.stringify({
            registerType: "nps",
            cliente: npsCliente.trim(),
            dataNPS: npsData || null,
            notaNPS: npsNota,
            comentarioNPS,
            ...npsFields,
            plano: npsPlano
          })
        });
      } else {
        throw new Error("Origem não suportada.");
      }
      onToast("Lançamento atualizado.");
      onSaved();
      onClose();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-mindlaw-teal p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-mindlaw-gold">Editar lançamento</h3>
        <p className="mt-1 text-xs text-white/55">
          {row.tipo} · {row.origem}
        </p>

        {row.origem === "comercial" ? (
          <div className="mt-4 space-y-3 text-sm">
            <label className="block text-xs text-white/65">
              Cliente
              <input
                value={comCliente}
                onChange={(e) => setComCliente(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/65">
                Data
                <input
                  type="date"
                  value={comData}
                  onChange={(e) => setComData(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-white/65">
                Valor contrato
                <input
                  type="number"
                  value={comValor}
                  onChange={(e) => setComValor(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-xs text-white/65">
              Status
              <select
                value={comStatus}
                onChange={(e) => setComStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              >
                <option value="Em Negociacao">Em Negociação</option>
                <option value="Ganho">Ganho</option>
                <option value="Perdido">Perdido</option>
              </select>
            </label>
            <label className="block text-xs text-white/65">
              Motivo (perda)
              <select
                value={comMotivo}
                onChange={(e) => setComMotivo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              >
                {COMERCIAL_MOTIVOS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {showComJust ? (
              <label className="block text-xs text-white/65">
                Justificativa do motivo
                <textarea
                  value={comJust}
                  onChange={(e) => setComJust(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
            ) : null}
            <label className="block text-xs text-white/65">
              Competidor
              <input
                value={comComp}
                onChange={(e) => setComComp(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              />
            </label>
            <label className="block text-xs text-white/65">
              Detalhamento técnico
              <textarea
                value={comDetalhe}
                onChange={(e) => setComDetalhe(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              />
            </label>
            <label className="block text-xs text-white/65">
              Plano (cliente)
              <select
                value={comPlano}
                onChange={(e) => setComPlano(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              >
                {planSelectOptions.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {row.origem === "churn" ? (
          <div className="mt-4 space-y-3 text-sm">
            <label className="block text-xs text-white/65">
              Cliente
              <input
                value={chCliente}
                onChange={(e) => setChCliente(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/65">
                Data churn
                <input
                  type="date"
                  value={chData}
                  onChange={(e) => setChData(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-white/65">
                MRR perdido
                <input
                  type="number"
                  value={chValor}
                  onChange={(e) => setChValor(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-xs text-white/65">
              Motivo principal
              <select
                value={chMotivo}
                onChange={(e) => setChMotivo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              >
                {CHURN_MOTIVOS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {showChJust ? (
              <label className="block text-xs text-white/65">
                Justificativa do motivo
                <textarea
                  value={chJust}
                  onChange={(e) => setChJust(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
            ) : null}
            <label className="block text-xs text-white/65">
              Plano (cliente)
              <select
                value={chPlano}
                onChange={(e) => setChPlano(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              >
                {planSelectOptions.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {row.origem === "nps" ? (
          <div className="mt-4 space-y-3 text-sm">
            <label className="block text-xs text-white/65">
              Cliente
              <input
                value={npsCliente}
                onChange={(e) => setNpsCliente(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/65">
                Data NPS
                <input
                  type="date"
                  value={npsData}
                  onChange={(e) => setNpsData(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-white/65">
                Nota (0–10)
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={npsNota}
                  onChange={(e) => setNpsNota(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
            </div>
            <p className="text-xs text-white/55">Respostas por pergunta (formato Google Forms)</p>
            {(
              [
                ["npsMelhorarExperiencia", "Melhorar experiência (0–6)"],
                ["npsFaltouNota9", "Faltou para nota 9–10 (7–8)"],
                ["npsAreasMelhorar", "Áreas a melhorar"],
                ["npsExperienciaAteAqui", "Experiência até aqui (9–10)"],
                ["npsFuncionalidadeDiaadia", "Funcionalidade / diferencial (9–10)"],
                ["npsComentarioAdicional", "Comentário adicional"]
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs text-white/65">
                {label}
                <textarea
                  value={npsFields[key]}
                  onChange={(e) => setNpsFields((f) => ({ ...f, [key]: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
                />
              </label>
            ))}
            <details className="rounded-lg border border-white/10 bg-mindlaw-dark/30 p-2 text-xs">
              <summary className="cursor-pointer text-white/70">Pré-visualização combinada (comentarioNPS)</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-white/50">
                {buildLegacyCombinedComentarioFromFields(npsFields) || "(vazio)"}
              </pre>
            </details>
            <label className="block text-xs text-white/65">
              Plano (cliente)
              <select
                value={npsPlano}
                onChange={(e) => setNpsPlano(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-mindlaw-dark/50 px-3 py-2"
              >
                {planSelectOptions.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-xl bg-mindlaw-gold px-4 py-2 text-sm font-semibold text-mindlaw-dark disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
