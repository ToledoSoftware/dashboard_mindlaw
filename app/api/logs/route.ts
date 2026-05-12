import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { getLogs } from "@/lib/server/logs";

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
    const data = await getLogs(queryFromUrl(req));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erro ao carregar logs." }, { status: 500 });
  }
}
