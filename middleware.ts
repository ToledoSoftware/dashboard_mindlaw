import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/api/integrations")) return NextResponse.next();
  if (pathname.startsWith("/api/auth/login")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (pathname.startsWith("/api")) return NextResponse.next();

  const token = request.cookies.get("mindlaw_token");
  if (!token?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

/** Exclui todo `/_next/*` (chunks, HMR, flight, imagens otimizadas) e ficheiros estáticos comuns. */
export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
