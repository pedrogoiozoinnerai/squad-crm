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

  // Drena a fila enquanto couber no tempo da função, em vez de processar uma
  // página e esperar dez minutos pela seguinte. Numa rajada de campanha — 2.000
  // leads numa hora — esperar dez minutos por página levaria quase duas horas
  // para o CRM enxergar o último, e a essa altura o lead esfriou.
  //
  // O teto de páginas e o de tempo existem juntos: o primeiro protege de um
  // laço que nunca termina, o segundo de estourar os 60 segundos no meio de
  // uma página e perder o trabalho dela.
  const LIMITE_MS = 45_000;
  const MAX_PAGINAS = 10;
  const comecou = Date.now();

  try {
    let r = await sincronizarFunil();
    let paginas = 1;

    while (r.temMais && paginas < MAX_PAGINAS && Date.now() - comecou < LIMITE_MS) {
      const proxima = await sincronizarFunil();
      paginas += 1;
      r = {
        ...proxima,
        lidos: r.lidos + proxima.lidos,
        leadsCriados: r.leadsCriados + proxima.leadsCriados,
        negociosCriados: r.negociosCriados + proxima.negociosCriados,
        reunioesCriadas: r.reunioesCriadas + proxima.reunioesCriadas,
        reunioesCanceladas: r.reunioesCanceladas + proxima.reunioesCanceladas,
        reunioesRemarcadas: r.reunioesRemarcadas + proxima.reunioesRemarcadas,
        tarefasCriadas: r.tarefasCriadas + proxima.tarefasCriadas,
      };
    }

    const resultado = { ...r, paginas, segundos: Math.round((Date.now() - comecou) / 1000) };

    // `temMais` verdadeiro ao sair significa que a rajada não coube nesta
    // execução: não é erro, é fila andando — mas precisa ficar no log, porque
    // se persistir por horas é sinal de que o volume passou do que o cron
    // aguenta e a frequência tem de subir.
    if (resultado.leadsCriados || resultado.reunioesCanceladas || resultado.reunioesRemarcadas || resultado.temMais) {
      console.log("[cron/type]", JSON.stringify(resultado));
    }
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    console.error("[cron/type] falhou:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "falha desconhecida" },
      { status: 500 },
    );
  }
}
