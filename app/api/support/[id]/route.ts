import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { deleteSupport, putSupport } from "@/lib/server/support";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const payload = await req.json();
    const r = await putSupport(params.id, payload);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok", data: r.data });
  } catch {
    return NextResponse.json({ error: "Falha ao atualizar dado de suporte." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const r = await deleteSupport(params.id);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ error: "Falha ao excluir dado de suporte." }, { status: 400 });
  }
}
