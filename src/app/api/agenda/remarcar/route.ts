import type { NextRequest } from "next/server";

import { guardaDeTaxa } from "@/lib/limite-servidor";
import { mensagemDoResultado } from "@/lib/remarcacao";
import { remarcar } from "@/lib/sessoes";

/**
 * Trocar o horário pelo token do convite.
 *
 * A tela de remarcar é um `<form>` puro que chama uma Server Action — ela
 * precisa funcionar sem JavaScript nenhum. Esta rota existe ao lado dela para
 * quem fala por HTTP: a verificação de ponta a ponta, e o funil do Type no dia
 * em que quiser oferecer a troca sem mandar o lead para cá.
 *
 * As duas portas chamam a MESMA função — `remarcar`, em `lib/sessoes`. É o que
 * impede a rota e a tela de divergirem, que é o defeito que dois caminhos para
 * a mesma mudança sempre acabam produzindo.
 *
 * Autoriza pelo token do convite e nada mais: é o que o lead tem.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const barrado = await guardaDeTaxa("token", request);
  if (barrado) return barrado;

  let corpo: { convite?: string; meetingId?: string };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const convite = corpo.convite?.trim();
  const meetingId = corpo.meetingId?.trim();
  if (!convite || !meetingId) {
    return Response.json({ erro: "Convite e sessão são obrigatórios." }, { status: 400 });
  }

  const r = await remarcar(convite, meetingId);

  if (r.tipo === "ok") {
    return Response.json(
      { ok: true, meetingId: r.meetingId, mensagem: mensagemDoResultado(r) },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // 409 para lotada e indisponível: é corrida, não erro de quem pediu — e é o
  // código que diz "tente de novo com a lista atualizada".
  const status = r.tipo === "recusado" ? 403 : 409;
  return Response.json({ erro: mensagemDoResultado(r), tipo: r.tipo }, { status });
}
