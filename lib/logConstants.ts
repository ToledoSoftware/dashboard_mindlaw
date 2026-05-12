import { normalizeText } from "@/lib/stringUtils";

export function isMotivoComDetalhamento(value: string) {
  const n = normalizeText(value);
  return (
    n === normalizeText("Falta de Funcionalidade") ||
    n === normalizeText("Falta de Integracao") ||
    n === normalizeText("Outros")
  );
}

export const COMERCIAL_MOTIVOS = [
  { value: "Sem Motivo", label: "Sem motivo" },
  { value: "Preco", label: "Preço" },
  { value: "Falta de Funcionalidade", label: "Falta de funcionalidade" },
  { value: "Falta de Integracao", label: "Falta de integração" },
  { value: "Outros", label: "Outros" }
];

export const CHURN_MOTIVOS = [
  { value: "Sem Motivo", label: "Sem motivo" },
  { value: "Preco", label: "Preço" },
  { value: "Falta de Funcionalidade", label: "Falta de funcionalidade" },
  { value: "Falta de Integracao", label: "Falta de integração" },
  { value: "Atendimento", label: "Atendimento" },
  { value: "Outros", label: "Outros" }
];

export function mapPlanToOption(plano: string) {
  const planNormalized = normalizeText(plano || "");
  if (!planNormalized) return "";
  if (planNormalized.includes("starter")) return "Starter";
  if (planNormalized.includes("premium")) return "Premium";
  if (planNormalized.includes("advanced")) return "Advanced";
  return "Outros";
}
