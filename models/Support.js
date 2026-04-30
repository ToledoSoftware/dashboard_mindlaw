const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema(
  {
    registerType: { type: String, enum: ["churn", "nps"], default: "churn" },
    cliente: { type: String, required: true, trim: true, maxlength: 120 },
    valorPerdido: { type: Number, min: 0, default: 0 },
    dataChurn: { type: Date },
    motivoPrincipal: {
      type: String,
      enum: ["Preco", "Falta de Funcionalidade", "Falta de Integracao", "Atendimento", "Outros", "Sem Motivo"],
      default: "Sem Motivo"
    },
    funcionalidadeFaltante: { type: String, default: "", trim: true, maxlength: 500 },
    notaNPS: { type: Number, min: 0, max: 10 },
    comentarioNPS: { type: String, maxlength: 2000, default: "" },
    dataNPS: { type: Date },
    categoriaNPS: { type: String, enum: ["Promotor", "Neutro", "Detrator"] }
  },
  { timestamps: true }
);

supportSchema.pre("save", function preSave(next) {
  if (this.registerType === "nps") {
    this.dataChurn = undefined;
    this.motivoPrincipal = undefined;
    this.funcionalidadeFaltante = "";
    this.valorPerdido = 0;
    if (typeof this.notaNPS === "number") {
      if (this.notaNPS >= 9) this.categoriaNPS = "Promotor";
      else if (this.notaNPS >= 7) this.categoriaNPS = "Neutro";
      else this.categoriaNPS = "Detrator";
    }
  } else if (this.registerType === "churn") {
    this.notaNPS = undefined;
    this.dataNPS = undefined;
    this.comentarioNPS = "";
    this.categoriaNPS = undefined;
  }
  next();
});

supportSchema.index({ registerType: 1, motivoPrincipal: 1, dataChurn: -1, categoriaNPS: 1 });

module.exports = mongoose.model("Support", supportSchema);
