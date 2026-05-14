const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    cliente: { type: String, required: true, trim: true, maxlength: 120 },
    valorContrato: { type: Number, required: true, min: 0 },
    data: { type: Date, required: true },
    status: {
      type: String,
      enum: ["Ganho", "Perdido", "Em Negociacao"],
      required: true
    },
    motivoPerda: {
      type: String,
      enum: ["Preco", "Falta de Funcionalidade", "Falta de Integracao", "Sem Motivo", "Outros"],
      default: "Sem Motivo"
    },
    funcionalidadeFaltante: { type: String, default: "", trim: true, maxlength: 500 },
    detalhamentoTecnico: { type: String, default: "", maxlength: 2000 },
    competidor: { type: String, default: "", trim: true, maxlength: 120 },
    /** Dados do lançamento para espelho / auditoria (não substituem o cadastro de Client). */
    telefone: { type: String, default: "", trim: true, maxlength: 50 },
    plano: { type: String, default: "", trim: true, maxlength: 40 }
  },
  { timestamps: true }
);

saleSchema.index({ status: 1, motivoPerda: 1, data: -1 });

module.exports = mongoose.model("Sale", saleSchema);
