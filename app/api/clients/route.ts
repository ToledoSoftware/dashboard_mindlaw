import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { createClient, listClients } from "@/lib/server/clientsHandlers";

function queryFromUrl(req: NextRequest) {
  const o: Record<string, string | undefined> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}

export async function GET(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const forForms = req.nextUrl.searchParams.get("forForms") === "1";
    const data = await listClients(queryFromUrl(req), forForms);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao carregar clientes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const payload = await req.json();
    const r = await createClient(payload);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok", data: r.data }, { status: r.status });
  } catch {
    return NextResponse.json({ error: "Falha ao salvar cliente." }, { status: 400 });
  }
}
