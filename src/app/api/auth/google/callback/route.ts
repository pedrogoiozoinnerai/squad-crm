import { type NextRequest, NextResponse } from "next/server";

import {
  allowedDomain,
  createSession,
  destinoSeguro,
  homeFor,
  igualSemVazarTempo,
  isEmailAllowed,
} from "@/lib/auth";
import { ESTADO_COOKIE, googleConfigurado, trocarCodigo } from "@/lib/google";
import { prisma } from "@/lib/prisma";

/** Mensagem curta na URL; a tela de login traduz. */
function recusar(request: NextRequest, motivo: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("erro", motivo);
  const resposta = NextResponse.redirect(url);
  resposta.cookies.delete(ESTADO_COOKIE);
  return resposta;
}

export async function GET(request: NextRequest) {
  if (!googleConfigurado()) return recusar(request, "sso-indisponivel");

  const codigo = request.nextUrl.searchParams.get("code");
  const estadoRecebido = request.nextUrl.searchParams.get("state");
  if (!codigo || !estadoRecebido) return recusar(request, "sso-incompleto");

  const bruto = request.cookies.get(ESTADO_COOKIE)?.value;
  if (!bruto) return recusar(request, "sso-expirado");

  let guardado: { estado: string; proxima: string };
  try {
    guardado = JSON.parse(bruto);
  } catch {
    return recusar(request, "sso-expirado");
  }
  if (!igualSemVazarTempo(guardado.estado, estadoRecebido)) {
    return recusar(request, "sso-estado");
  }

  let identidade;
  try {
    identidade = await trocarCodigo(codigo, request.nextUrl.origin);
  } catch (erro) {
    console.error("[sso] troca de código falhou:", erro);
    return recusar(request, "sso-falhou");
  }

  // E-mail não verificado no Google é e-mail que ninguém provou possuir.
  if (!identidade.emailVerificado) return recusar(request, "sso-nao-verificado");

  // Duas checagens de domínio, e não uma: `hd` só existe em conta Workspace, e
  // o sufixo do e-mail sozinho seria contornável por quem criasse uma conta
  // Google pessoal com endereço parecido.
  const dominio = allowedDomain();
  if (identidade.dominio !== dominio || !isEmailAllowed(identidade.email)) {
    return recusar(request, "sso-dominio");
  }

  const existente = await prisma.user.findFirst({
    where: { OR: [{ googleSub: identidade.sub }, { email: identidade.email }] },
  });

  // Conta já assumida: entra.
  if (existente?.claimedAt) {
    if (!existente.active) return recusar(request, "sso-inativa");
    if (!existente.googleSub) {
      await prisma.user.update({
        where: { id: existente.id },
        data: { googleSub: identidade.sub },
      });
    }
    await createSession(existente.id);
    const destino = destinoSeguro(guardado.proxima, homeFor(existente.role));
    const resposta = NextResponse.redirect(new URL(destino, request.url));
    resposta.cookies.delete(ESTADO_COOKIE);
    return resposta;
  }

  // Primeira conta do sistema: só o ADMIN_EMAIL, pelo mesmo motivo do cadastro
  // por senha — senão o primeiro a chegar vira administrador de tudo.
  const assumidas = await prisma.user.count({ where: { claimedAt: { not: null } } });
  const primeiroAdmin = process.env.ADMIN_EMAIL?.trim().replace(/^['"]|['"]$/g, "").toLowerCase();

  if (assumidas === 0) {
    if (!primeiroAdmin) return recusar(request, "sso-sem-admin");
    if (identidade.email !== primeiroAdmin) return recusar(request, "sso-nao-liberado");
  } else {
    const convite = await prisma.invite.findUnique({ where: { email: identidade.email } });
    if (!convite || convite.usedAt) return recusar(request, "sso-nao-liberado");
  }

  const user = existente
    ? await prisma.user.update({
        where: { id: existente.id },
        data: {
          googleSub: identidade.sub,
          claimedAt: new Date(),
          active: true,
          ...(assumidas === 0 ? { role: "ADMIN" as const } : {}),
          ...(existente.name ? {} : { name: identidade.nome }),
        },
      })
    : await prisma.user.create({
        data: {
          email: identidade.email,
          name: identidade.nome,
          googleSub: identidade.sub,
          // Entrou por SSO: não existe senha, e isso não é pendência.
          passwordHash: "",
          claimedAt: new Date(),
          role: assumidas === 0 ? "ADMIN" : "USER",
        },
      });

  if (assumidas > 0) {
    await prisma.invite.update({ where: { email: identidade.email }, data: { usedAt: new Date() } });
  }

  await createSession(user.id);
  const destino = destinoSeguro(guardado.proxima, homeFor(user.role));
  const resposta = NextResponse.redirect(new URL(destino, request.url));
  resposta.cookies.delete(ESTADO_COOKIE);
  return resposta;
}
