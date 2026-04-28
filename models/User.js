const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Email inválido"]
    },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ["admin", "executive", "analyst"], default: "analyst" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
