import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import { exportClientsXlsx } from "@/lib/server/clientsHandlers";

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
    const buffer = await exportClientsXlsx(queryFromUrl(req));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=MindLaw_Clientes.xlsx"
      }
    });
  } catch {
    return NextResponse.json({ error: "Erro ao exportar clientes." }, { status: 500 });
  }
}
