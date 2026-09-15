import { type NextRequest, NextResponse } from "next/server";

import { ESTADO_COOKIE, googleConfigurado, novoEstado, urlDeLogin } from "@/lib/google";

/** Começa o login com Google. */
export async function GET(request: NextRequest) {
  if (!googleConfigurado()) {
    return NextResponse.redirect(new URL("/?erro=sso-indisponivel", request.url));
  }

  const estado = novoEstado();
  const proxima = request.nextUrl.searchParams.get("next") ?? "";

  const resposta = NextResponse.redirect(urlDeLogin(estado, request.nextUrl.origin));

  // O `state` vive só no cookie, nunca em parâmetro que outra aba possa ler.
  // Sem ele, qualquer site poderia iniciar um fluxo e emendar a resposta aqui
  // — é a defesa contra CSRF de login. O destino viaja junto para sobreviver
  // à ida ao Google sem precisar de sessão.
  resposta.cookies.set(ESTADO_COOKIE, JSON.stringify({ estado, proxima }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return resposta;
}
