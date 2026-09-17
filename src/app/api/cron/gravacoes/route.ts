import { type NextRequest, NextResponse } from "next/server";

import { armazenamentoConfigurado } from "@/lib/armazenamento";
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

  if (!livekitConfigurado()) {
    return NextResponse.json({ ok: true, ignorado: "LiveKit não configurado" });
  }
  if (!armazenamentoConfigurado()) {
    return NextResponse.json({ ok: true, ignorado: "armazenamento não configurado" });
  }

  try {
    const r = await conciliarGravacoes();
    // `semGravacao` é o número que denuncia o webhook mal cadastrado: calls que
    // aconteceram, com gente dentro, e das quais o LiveKit não conhece egress
    // nenhum. Ele merece log mesmo quando nada mudou.
    if (r.criadas || r.atualizadas || r.semGravacao || r.falhas) {
      console.log("[cron/gravacoes]", JSON.stringify(r));
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (erro) {
    console.error("[cron/gravacoes] falhou:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "falha desconhecida" },
      { status: 500 },
    );
  }
}
