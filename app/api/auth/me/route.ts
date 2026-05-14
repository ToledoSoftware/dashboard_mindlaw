import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { getTokenExpiryMs, getTokenFromRequest, requireUser } from "@/lib/auth-api";

export async function GET(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  await connectDB();
  const token = getTokenFromRequest(req);
  const expiresAtMs = getTokenExpiryMs(token);
  return NextResponse.json({ user: u, expiresAtMs });
}
