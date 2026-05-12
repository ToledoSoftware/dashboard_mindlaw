import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { saveNpsIntegration } from "@/lib/server/npsWebhook";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const r = await saveNpsIntegration(body, req.headers);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok", data: r.data }, { status: r.status });
  } catch (e) {
    console.error("[MindLaw] integração nps:", (e as Error).message);
    return NextResponse.json({ error: "Falha ao salvar NPS na integração." }, { status: 400 });
  }
}
