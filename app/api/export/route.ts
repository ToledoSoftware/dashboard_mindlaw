import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireUser } from "@/lib/auth-api";
import {
  exportDashboardBundleXlsx,
  exportFilenameForSelection,
  parseExportSectionsParam,
  type ExportSectionSelection
} from "@/lib/server/clientsHandlers";

function queryFromUrl(req: NextRequest) {
  const o: Record<string, string | undefined> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k === "sections") return;
    o[k] = v;
  });
  return o;
}

function selectionFromRequest(req: NextRequest): ExportSectionSelection {
  const raw = req.nextUrl.searchParams.get("sections");
  const parsed = parseExportSectionsParam(raw);
  return parsed ?? { clients: false, commercial: true, support: true };
}

export async function GET(req: NextRequest) {
  const u = requireUser(req);
  if (u instanceof Response) return u;
  try {
    await connectDB();
    const selection = selectionFromRequest(req);
    if (!selection.clients && !selection.commercial && !selection.support) {
      return NextResponse.json(
        { error: "Indique pelo menos uma secção (sections=clients,commercial,support ou all)." },
        { status: 400 }
      );
    }
    const buffer = await exportDashboardBundleXlsx(queryFromUrl(req), selection);
    const filename = exportFilenameForSelection(selection);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch {
    return NextResponse.json({ error: "Falha ao gerar exportação." }, { status: 500 });
  }
}
