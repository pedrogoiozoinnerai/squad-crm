import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Checagem otimista apenas: sem cookie, nem carrega a área logada.
 * A autorização de verdade (papel, escopo, dono do registro) é feita no
 * servidor, em `requireUser()` — o proxy nunca é a única barreira.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  const isProtected = pathname.startsWith("/admin") || pathname.startsWith("/user");

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/user/:path*"],
};
