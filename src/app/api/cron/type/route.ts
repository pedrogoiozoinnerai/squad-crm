import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { sincronizarFunil } from "@/lib/type-sync";

/**
 * Sincroniza o Funil do Type sozinho, a cada dez minutos.
 *
 * O botão da tela de importação continua existindo, mas depender dele é
 * depender de alguém lembrar — e lead de inbound esfria em horas. Aqui o CRM
 * puxa: os dois apps dividem o mesmo Postgres, então não há webhook entre eles
 * para falhar, e uma execução perdida se resolve na seguinte, porque a
 * sincronização reconcilia o estado inteiro em vez de aplicar eventos.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // A Vercel assina a chamada do cron com este cabeçalho. Sem a checagem, a
  // rota seria um gatilho público de escrita no banco.
  const segredo = env("CRON_SECRET");
  const autorizacao = request.headers.get("authorization");
  if (segredo && autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (!segredo && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }

  try {
    const r = await sincronizarFunil();
    if (r.leadsCriados || r.reunioesCanceladas || r.reunioesRemarcadas) {
      console.log("[cron/type]", JSON.stringify(r));
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (erro) {
    console.error("[cron/type] falhou:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "falha desconhecida" },
      { status: 500 },
    );
  }
}
