import "server-only";

import { urlParaAssistir } from "@/lib/armazenamento";
import { env } from "@/lib/env";
import {
  aguardando,
  alvoDaChave,
  arrendar,
  desistirDeVez,
  falhar,
  semearTranscricoes,
  soltarEsquecidos,
} from "@/lib/trabalhos";
import { parametrosDaDeepgram } from "@/lib/transcricao";
import { prisma } from "@/lib/prisma";
import { tokenDoRetorno } from "@/lib/retorno";

/**
 * A transcrição, pedida sem esperar.
 *
 * Uma função da Vercel tem 60 segundos e transcrever uma call de uma hora não
 * cabe nisso. A Deepgram resolve isso com `callback`: ela responde em ~1 s com
 * um `request_id` e devolve o texto pronto depois, numa requisição nossa
 * própria. O que este arquivo faz é só o pedido; quem recebe é a rota de
 * retorno.
 *
 * Guarda de chave igual à do LiveKit: sem `DEEPGRAM_API_KEY` nada acontece, e
 * quem chama diz "ignorado" em vez de falhar.
 */

export function chaveDaDeepgram() {
  return env("DEEPGRAM_API_KEY") ?? null;
}

export function deepgramConfigurado() {
  return chaveDaDeepgram() !== null;
}

/// Quantas transcrições pedir por execução.
///
/// Oito. São 12,5 calls por dia e o cron roda de hora em hora — o teto não
/// existe para dar conta do volume, existe para uma migração ou um bug não
/// virarem trezentos pedidos pagos numa execução só.
const POR_EXECUCAO = 8;

export type RelatorioDeTranscricao = {
  semeados: number;
  pedidos: number;
  falhas: number;
  esquecidos: number;
};

export async function pedirTranscricoes(): Promise<RelatorioDeTranscricao> {
  const relatorio: RelatorioDeTranscricao = { semeados: 0, pedidos: 0, falhas: 0, esquecidos: 0 };

  const chave = chaveDaDeepgram();
  const segredo = env("CRON_SECRET");
  const base = env("NEXT_PUBLIC_APP_URL");
  if (!chave || !segredo || !base) return relatorio;

  relatorio.esquecidos = await soltarEsquecidos();
  relatorio.semeados = await semearTranscricoes();

  const trabalhos = await arrendar("TRANSCREVER", POR_EXECUCAO);

  for (const trabalho of trabalhos) {
    const gravacao = await prisma.recording.findUnique({
      where: { id: alvoDaChave(trabalho.chave) },
      select: { caminho: true, apagadaEm: true },
    });

    if (!gravacao?.caminho || gravacao.apagadaEm) {
      // O arquivo sumiu entre semear e executar — retenção, ou alguém apagou
      // no painel. Não é falha de rede: tentar de novo seis vezes não traz o
      // vídeo de volta.
      await desistirDeVez(trabalho.id, "a gravação não está mais no bucket");
      relatorio.falhas += 1;
      continue;
    }

    // A URL assinada é o que a Deepgram vai BAIXAR. Vale uma hora — tempo de
    // sobra para ela puxar 550 MB, e curto o bastante para não virar um link
    // permanente para o vídeo de um cliente se vazar do log deles.
    const url = await urlParaAssistir(gravacao.caminho);
    if (!url) {
      await falhar(trabalho.id, trabalho.tentativas, "não foi possível assinar a URL da gravação");
      relatorio.falhas += 1;
      continue;
    }

    const retorno = `${base.replace(/\/+$/, "")}/api/deepgram/${trabalho.id}/${tokenDoRetorno(trabalho.id, segredo)}`;

    try {
      const resposta = await fetch(
        `https://api.deepgram.com/v1/listen?${parametrosDaDeepgram({ callback: retorno })}`,
        {
          method: "POST",
          headers: { authorization: `Token ${chave}`, "content-type": "application/json" },
          body: JSON.stringify({ url }),
          // Com `callback`, a resposta é imediata: ela só confirma o pedido.
          // Se demorar mais que isto, alguma coisa está errada do lado deles.
          signal: AbortSignal.timeout(20_000),
        },
      );

      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => "");
        await falhar(trabalho.id, trabalho.tentativas, `deepgram ${resposta.status}: ${detalhe.slice(0, 200)}`);
        relatorio.falhas += 1;
        continue;
      }

      const corpo = (await resposta.json()) as { request_id?: string };
      if (!corpo.request_id) {
        await falhar(trabalho.id, trabalho.tentativas, "deepgram aceitou sem devolver request_id");
        relatorio.falhas += 1;
        continue;
      }

      // Guardado ANTES de qualquer outra coisa: é por ele que o retorno prova
      // que está respondendo a ESTE pedido, e um retorno que chegue antes de
      // gravarmos isto não teria contra o que ser conferido.
      await aguardando(trabalho.id, corpo.request_id);
      relatorio.pedidos += 1;
    } catch (erro) {
      await falhar(trabalho.id, trabalho.tentativas, erro instanceof Error ? erro.message : "falha desconhecida");
      relatorio.falhas += 1;
    }
  }

  return relatorio;
}
