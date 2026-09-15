import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { livekitConfigurado } from "@/lib/livekit-servidor";
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
    // Só registra quando houve o que fazer: log de "nada mudou" a cada hora
    // afoga o que importa.
    if (r.presencas || r.semDados) console.log("[cron/presenca]", JSON.stringify(r));
    return NextResponse.json({ ok: true, ...r });
  } catch (erro) {
    console.error("[cron/presenca] falhou:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "falha desconhecida" },
      { status: 500 },
    );
  }
}
