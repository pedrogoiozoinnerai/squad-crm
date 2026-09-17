import { type NextRequest, NextResponse } from "next/server";

import { armazenamentoConfigurado } from "@/lib/armazenamento";
import { anthropicConfigurado, colherAnalises, pedirAnalises } from "@/lib/anthropic";
import { deepgramConfigurado, pedirTranscricoes } from "@/lib/deepgram";
import { env } from "@/lib/env";
import { conciliarGravacoes } from "@/lib/gravacoes-servidor";
import { livekitConfigurado } from "@/lib/livekit-servidor";

/**
 * A gravação, conferida contra o LiveKit.
 *
 * Mesma forma do cron de presença, e pelo mesmo motivo: o webhook é o caminho
 * rápido e ele falha. Os eventos de egress precisam ser cadastrados à mão no
 * painel do LiveKit — hoje só os quatro de sala estão lá —, e enquanto não
 * estiverem, esta rota é a ÚNICA coisa que descobre que uma call foi gravada.
 *
 * Responde `{ok: true, ignorado}` quando falta chave, em vez de erro: sem
 * bucket não há gravação, e um 500 de hora em hora num cron que não tem o que
 * fazer transforma o alarme em barulho de fundo.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const segredo = env("CRON_SECRET");
  const autorizacao = request.headers.get("authorization");
  if (segredo && autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (!segredo && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }

  // Cada etapa se guarda sozinha, e a rota DIZ o que pulou.
  //
  // A versão anterior devolvia cedo quando faltava o bucket — e isso fazia uma
  // guarda só barrar três etapas: com o bucket removido, transcrições já
  // gravadas parariam de ser analisadas, sem nada explicando por quê. Uma
  // guarda deve calar a sua etapa, não as das outras.
  const ignorado = [
    livekitConfigurado() ? null : "LiveKit",
    armazenamentoConfigurado() ? null : "armazenamento",
    deepgramConfigurado() ? null : "Deepgram",
    anthropicConfigurado() ? null : "Anthropic",
  ].filter(Boolean);

  try {
    const r = await conciliarGravacoes();

    // A transcrição vem DEPOIS da conciliação, na mesma execução: uma gravação
    // que acabou de ser descoberta pelo `ListEgress` já sai transcrevendo, em
    // vez de esperar a hora seguinte. Sem chave da Deepgram isto devolve zeros
    // e não fala com ninguém.
    const t = deepgramConfigurado() && armazenamentoConfigurado()
      ? await pedirTranscricoes()
      : { semeados: 0, pedidos: 0, falhas: 0, esquecidos: 0 };

    // Colher ANTES de pedir: um lote que ficou pronto desde a última execução
    // vira análise agora, e não daqui a uma hora. A ordem inversa gastaria a
    // mesma execução mandando trabalho novo enquanto o pronto espera.
    const colhidos = anthropicConfigurado() ? await colherAnalises() : 0;
    const a = anthropicConfigurado()
      ? await pedirAnalises()
      : { semeados: 0, enviados: 0, colhidos: 0, falhas: 0 };
    a.colhidos = colhidos;
    // `semGravacao` é o número que denuncia o webhook mal cadastrado: calls que
    // aconteceram, com gente dentro, e das quais o LiveKit não conhece egress
    // nenhum. Ele merece log mesmo quando nada mudou.
    if (
      r.criadas || r.atualizadas || r.semGravacao || r.falhas ||
      t.pedidos || t.falhas || t.esquecidos ||
      a.enviados || a.colhidos || a.falhas
    ) {
      console.log("[cron/gravacoes]", JSON.stringify({ ...r, transcricao: t, analise: a }));
    }
    return NextResponse.json({
      ok: true,
      ...r,
      transcricao: t,
      analise: a,
      ...(ignorado.length ? { ignorado } : {}),
    });
  } catch (erro) {
    console.error("[cron/gravacoes] falhou:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "falha desconhecida" },
      { status: 500 },
    );
  }
}
