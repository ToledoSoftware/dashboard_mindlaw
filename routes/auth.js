const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username = "", password = "" } = req.body || {};
    const user = await User.findOne({ username: username.trim() });

    if (!user) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    const token = jwt.sign(
      { id: user._id.toString(), username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("mindlaw_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      token,
      user: { id: user._id, username: user.username, role: user.role }
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno ao autenticar." });
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("mindlaw_token");
  return res.json({ status: "ok" });
});

module.exports = router;
