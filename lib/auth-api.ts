import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";

export type JwtUser = { id: string; username: string; role: string };

export function getTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.cookies.get("mindlaw_token")?.value || null;
}

export function verifyToken(token: string): JwtUser | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    return jwt.verify(token, secret) as JwtUser;
  } catch {
    return null;
  }
}

export function requireUser(req: NextRequest): JwtUser | Response {
  if (!process.env.JWT_SECRET) {
    return Response.json({ error: "JWT_SECRET não configurado." }, { status: 503 });
  }
  const token = getTokenFromRequest(req);
  if (!token) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  const u = verifyToken(token);
  if (!u) return Response.json({ error: "Token inválido ou expirado." }, { status: 401 });
  return u;
}
