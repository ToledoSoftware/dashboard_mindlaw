import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { postSupportChurn } from "@/lib/server/support";

export async function POST(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const payload = await req.json();
    const r = await postSupportChurn(payload);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok", data: r.data }, { status: r.status });
  } catch {
    return NextResponse.json({ error: "Falha ao salvar churn." }, { status: 400 });
  }
}
