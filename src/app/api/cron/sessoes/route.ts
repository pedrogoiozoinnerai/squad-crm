import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { materializarSessoes } from "@/lib/sessoes";

/**
 * Enche a agenda a partir das séries recorrentes, de hora em hora.
 *
 * A grade nasce vazia e ficaria assim para sempre: até aqui, `SessionTemplate`
 * era uma regra que ninguém executava — a tela de sessões mostrava nada porque
 * nada nunca criou uma sessão.
 *
 * Idempotente pelo `@@unique([templateId, startsAt])`, então rodar de novo não
 * duplica. É o que permite chamar isto também na hora em que alguém salva um
 * template, sem esperar a madrugada.
 *
 * DE HORA EM HORA, e não uma vez por dia, por causa da virada do mês: o
 * horizonte é o último dia do mês corrente, então à meia-noite do dia 1º a
 * agenda pula de quase nada para um mês inteiro. Num cron das 04:40, o funil
 * mostraria lista vazia entre 00:00 e 04:40 do primeiro dia de todo mês. Sem
 * nada a criar, esta rota é uma consulta por série e escreve zero linhas.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const segredo = env("CRON_SECRET");
  if (segredo && request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (!segredo && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }

  try {
    const r = await materializarSessoes();
    if (r.criadas) console.log("[cron/sessoes]", JSON.stringify(r));
    return NextResponse.json({ ok: true, ...r });
  } catch (erro) {
    console.error("[cron/sessoes] falhou:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "falha desconhecida" },
      { status: 500 },
    );
  }
}
