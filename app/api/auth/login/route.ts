import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import connectDB from "@/lib/mongodb";
import { getCjsModels } from "@/lib/cjsModels";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { User } = await getCjsModels();
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    const user = await User.findOne({ username });
    if (!user) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) return NextResponse.json({ error: "JWT_SECRET ausente." }, { status: 503 });

    const token = jwt.sign(
      { id: user._id.toString(), username: user.username, role: user.role },
      secret,
      { expiresIn: "1d" }
    );

    const res = NextResponse.json({
      token,
      user: { id: user._id, username: user.username, role: user.role }
    });
    res.cookies.set("mindlaw_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60,
      path: "/"
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Erro interno ao autenticar." }, { status: 500 });
  }
}
