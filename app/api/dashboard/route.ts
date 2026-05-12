import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { getLegacyDashboard } from "@/lib/server/dashboard";

export async function GET(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const data = await getLegacyDashboard();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao montar dashboard." }, { status: 500 });
  }
}
