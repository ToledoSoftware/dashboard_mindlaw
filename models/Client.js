const mongoose = require("mongoose");

const STATUS_CONTRATO = ["cliente", "pagamento_pendente", "pagamento_recusado", "cancelado", "novo_lead"];

const clientSchema = new mongoose.Schema(
  {
    chaveUnica: { type: String, required: true, unique: true, index: true },
    nome: { type: String, required: true, trim: true, maxlength: 200 },
    telefone: { type: String, default: "", trim: true, maxlength: 50 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 120 },
    normalizedName: { type: String, required: true, index: true },
    statusContrato: {
      type: String,
      enum: STATUS_CONTRATO,
      default: "novo_lead"
    },
    plano: { type: String, default: "", trim: true, maxlength: 40 },
    dataReferencia: { type: Date },
    /** Preenchido ao excluir; oculto nas listagens e ignorado no sync automático a partir de vendas/suporte. */
    deletedAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Client", clientSchema);
module.exports.STATUS_CONTRATO = STATUS_CONTRATO;
