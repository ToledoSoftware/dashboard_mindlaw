import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { updateClient } from "@/lib/server/clientsHandlers";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const payload = await req.json();
    const r = await updateClient(params.id, payload);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok", data: r.data });
  } catch {
    return NextResponse.json({ error: "Falha ao atualizar cliente." }, { status: 400 });
  }
}
