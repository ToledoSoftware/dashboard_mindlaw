import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { getSales, postSale } from "@/lib/server/sales";

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
    const data = await getSales(queryFromUrl(req));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao carregar vendas." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const payload = await req.json();
    const r = await postSale(payload);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ status: "ok", data: r.data }, { status: r.status });
  } catch {
    return NextResponse.json({ error: "Falha ao salvar dado comercial." }, { status: 400 });
  }
}
