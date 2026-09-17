import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { fecharSalasVencidas, livekitConfigurado } from "@/lib/livekit-servidor";
import { reconciliarPresencas } from "@/lib/reconciliar";

/**
 * Camada 2 da presença: deriva quem esteve na reunião a partir dos eventos
 * crus, de hora em hora.
 *
 * O webhook é o caminho rápido, e ele falha — configuração esquecida no painel
 * do LiveKit, queda de rede, evento perdido. Esta rota é a que conserta: como
 * ela recalcula do zero a partir dos eventos, um evento que chegou atrasado é
 * incorporado na execução seguinte sem ninguém apertar nada.
 *
 * A janela de 7 dias é maior que o intervalo de propósito: reprocessar o que
 * já estava certo não custa nada e cobre o dia em que o cron não rodou.
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

  try {
    const r = await reconciliarPresencas();

    // Fechar a sala vencida anda junto com medir a presença de propósito: são
    // as duas metades da mesma regra. `consolidar` para de contar em
    // `endsAt + 30 min`; aqui, passado o mesmo prazo, a sala deixa de existir —
    // senão a próxima execução tem de novo o que descontar.
    //
    // Num `catch` à parte porque a reconciliação é o que não pode faltar: uma
    // recusa do LiveKit não pode virar 500 numa rota que já fez o trabalho.
    let salas: Awaited<ReturnType<typeof fecharSalasVencidas>> | { erro: string };
    try {
      salas = await fecharSalasVencidas();
    } catch (erro) {
      console.error("[cron/presenca] não consegui varrer as salas:", erro);
      salas = { erro: erro instanceof Error ? erro.message : "falha desconhecida" };
    }

    // Só registra quando houve o que fazer: log de "nada mudou" a cada hora
    // afoga o que importa.
    if (r.presencas || r.semDados || ("fechadas" in salas && salas.fechadas > 0)) {
      console.log("[cron/presenca]", JSON.stringify({ ...r, salas }));
    }
    return NextResponse.json({ ok: true, ...r, salas });
  } catch (erro) {
    console.error("[cron/presenca] falhou:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "falha desconhecida" },
      { status: 500 },
    );
  }
}
