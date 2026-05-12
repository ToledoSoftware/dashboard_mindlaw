import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { deleteSupport, getSupport, postSupport, putSupport } from "@/lib/server/support";

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
    const data = await getSupport(queryFromUrl(req));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao carregar suporte." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const payload = await req.json();
    const r = await postSupport(payload);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok", data: r.data }, { status: r.status });
  } catch {
    return NextResponse.json({ error: "Falha ao salvar dado de suporte." }, { status: 400 });
  }
}
