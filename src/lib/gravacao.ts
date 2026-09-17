import type { EventoDeEgress } from "@/lib/livekit";

/**
 * As regras da gravação, sem rede e sem banco.
 *
 * O egress do LiveKit já chegava aqui — `normalizarEgress` parseia arquivo,
 * tamanho e duração desde sempre. O que faltava era decidir o que fazer com
 * isso, e é essa decisão que mora neste arquivo: qual estado vence quando dois
 * eventos chegam fora de ordem, para onde o arquivo vai, e o que o vídeo deve
 * pesar.
 *
 * Puro de propósito. O caso que quebra não é o feliz — é o `egress_started`
 * que chega DEPOIS do `egress_ended` porque a rede engasgou, e conferir isso
 * sem subir uma sala é a única forma de ter certeza.
 */

export type SituacaoDaGravacao =
  | "PENDENTE"
  | "GRAVANDO"
  | "PROCESSANDO"
  | "COMPLETA"
  | "FALHOU"
  | "ABORTADA"
  | "APAGADA";

/**
 * Quão longe na vida a gravação chegou.
 *
 * O número existe para uma coisa só: **nunca voltar atrás**. O LiveKit não
 * garante ordem de entrega e reentrega o que não recebeu 200 — sem esta régua,
 * um `egress_started` atrasado faria uma gravação pronta, com arquivo no
 * bucket, voltar a dizer "gravando" na tela do closer.
 *
 * Os três finais empatam de propósito: quem chegar primeiro decide, e o
 * segundo é reentrega.
 */
export function ordemDaSituacao(situacao: SituacaoDaGravacao): number {
  switch (situacao) {
    case "PENDENTE":
      return 0;
    case "GRAVANDO":
      return 1;
    case "PROCESSANDO":
      return 2;
    case "COMPLETA":
    case "FALHOU":
    case "ABORTADA":
      return 3;
    case "APAGADA":
      return 4;
  }
}

/** O estado que vale, entre o que já estava gravado e o que acabou de chegar. */
export function avancar(
  atual: SituacaoDaGravacao,
  chegando: SituacaoDaGravacao,
): SituacaoDaGravacao {
  return ordemDaSituacao(chegando) > ordemDaSituacao(atual) ? chegando : atual;
}

/**
 * Do vocabulário do LiveKit para o nosso.
 *
 * `EGRESS_LIMIT_REACHED` vira COMPLETA, e não uma falha: o arquivo existe e
 * abre. Mas ele foi CORTADO, e o que falta é o fim da call — justamente onde
 * mora o fechamento. Quem quiser esse aviso usa `avisoDaGravacao`.
 */
export function situacaoDoEgress(bruta: string): SituacaoDaGravacao | null {
  switch (bruta.toUpperCase()) {
    case "EGRESS_STARTING":
      return "PENDENTE";
    case "EGRESS_ACTIVE":
      return "GRAVANDO";
    case "EGRESS_ENDING":
      return "PROCESSANDO";
    case "EGRESS_COMPLETE":
    case "EGRESS_LIMIT_REACHED":
      return "COMPLETA";
    case "EGRESS_FAILED":
      return "FALHOU";
    case "EGRESS_ABORTED":
      return "ABORTADA";
    default:
      return null;
  }
}

/** O estado, pelo tipo do evento, quando o LiveKit não mandou `status`. */
function situacaoDoTipo(tipo: string): SituacaoDaGravacao | null {
  if (tipo === "egress_started") return "GRAVANDO";
  if (tipo === "egress_updated") return "GRAVANDO";
  if (tipo === "egress_ended") return "COMPLETA";
  return null;
}

/**
 * O que a tela precisa saber de anormal.
 *
 * Um erro do LiveKit, ou o corte por limite — que não é erro, mas também não é
 * uma gravação inteira, e dizer "Gravada ✓" sobre um arquivo que para no
 * minuto 40 de uma call de 60 seria mentir com um certinho verde.
 */
export function avisoDaGravacao(evento: EventoDeEgress): string | null {
  if (evento.erro) return evento.erro;
  if (evento.situacao.toUpperCase() === "EGRESS_LIMIT_REACHED") {
    return "A gravação bateu no limite do servidor e foi cortada antes do fim da call.";
  }
  return null;
}

export type GravacaoDerivada = {
  status: SituacaoDaGravacao;
  caminho: string | null;
  bytes: number | null;
  duracaoSegundos: number | null;
  iniciadaEm: Date | null;
  terminadaEm: Date | null;
  erro: string | null;
};

/**
 * O que gravar a partir de um evento de egress, dado o que já está no banco.
 *
 * Só AVANÇA: nenhum campo volta a nulo porque um evento veio magro. O
 * `egress_updated` do LiveKit chega sem `fileResults` enquanto a call está
 * rolando, e sobrescrever com ele apagaria o caminho e o tamanho que o
 * `egress_ended` já tinha trazido numa reentrega fora de ordem.
 */
export function derivarGravacao(
  evento: EventoDeEgress,
  atual: Partial<GravacaoDerivada> & { status?: SituacaoDaGravacao } = {},
): GravacaoDerivada {
  const anterior = atual.status ?? "PENDENTE";
  const chegando = situacaoDoEgress(evento.situacao) ?? situacaoDoTipo(evento.tipo) ?? anterior;

  // O arquivo com conteúdo de verdade. Um `fileResults` com caminho vazio
  // aparece em evento intermediário, e ele não pode apagar o que já sabemos.
  const arquivo = evento.arquivos.find((a) => a.caminho) ?? null;

  return {
    status: avancar(anterior, chegando),
    caminho: arquivo?.caminho ?? atual.caminho ?? null,
    bytes: arquivo && arquivo.bytes > 0 ? arquivo.bytes : (atual.bytes ?? null),
    duracaoSegundos:
      arquivo && arquivo.duracaoSegundos > 0
        ? arquivo.duracaoSegundos
        : (atual.duracaoSegundos ?? null),
    iniciadaEm: evento.iniciadoEm ?? atual.iniciadaEm ?? null,
    terminadaEm: evento.terminadoEm ?? atual.terminadaEm ?? null,
    erro: avisoDaGravacao(evento) ?? atual.erro ?? null,
  };
}

// ── O pedido de gravação ─────────────────────────────────────────────────────

export type DestinoS3 = {
  bucket: string;
  regiao: string;
  /// O endereço S3-compatível do Supabase Storage.
  endpoint: string;
  accessKey: string;
  secret: string;
};

/// 720p a 15 quadros e 1200 kbps — não o preset de 3000.
///
/// É rosto falando e slide parado, não futebol. Metade do armazenamento e da
/// banda por um parâmetro: com 12,5 sessões de 60 minutos por dia, são ~6,8 GB
/// por dia em vez de ~17. A conta é mensal e não some sozinha.
export const VIDEO = { largura: 1280, altura: 720, quadros: 15, kbps: 1200, audioKbps: 128 };

/**
 * Onde o arquivo mora dentro do bucket.
 *
 * Particionado por data em UTC, e a data sai de `getUTC*` explicitamente: `pg`
 * serializa `Date` no fuso do PROCESSO, e foi assim que uma sala nasceu "já
 * encerrada" e um relatório acusou uma correção de não ter pego. Aqui o mesmo
 * engano colocaria a gravação das 21h numa pasta do dia seguinte — e a varredura
 * de retenção apagaria o arquivo errado.
 */
export function caminhoDaGravacao(meetingId: string, inicio: Date): string {
  const ano = inicio.getUTCFullYear();
  const mes = String(inicio.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(inicio.getUTCDate()).padStart(2, "0");
  return `reunioes/${ano}/${mes}/${dia}/${meetingId}.mp4`;
}

/**
 * O bloco de gravação que vai junto do `CreateRoom`.
 *
 * Declarado na criação da sala, e NÃO numa chamada explícita de "começar a
 * gravar": `criarSala` é chamada em toda requisição de token, e com trinta
 * pessoas pedindo token ao mesmo tempo um start explícito viraria trinta
 * gravações e trinta faturas. `CreateRoom` de sala existente devolve a que já
 * está lá, sem novo egress.
 *
 * Devolve `null` quando não há bucket — e é essa a guarda: sem chave, a sala é
 * criada exatamente como hoje, sem gravar, sem erro e sem deploy novo no dia em
 * que a chave aparecer.
 */
export function pedidoDeEgress(
  sala: string,
  caminho: string,
  destino: DestinoS3 | null,
): Record<string, unknown> | null {
  if (!destino) return null;

  return {
    room: {
      roomName: sala,
      // Quem está falando ocupa a tela. A grade de trinta miniaturas é
      // ilegível numa gravação e ninguém reassiste uma call assim.
      layout: "speaker",
      fileOutputs: [
        {
          fileType: "MP4",
          filepath: caminho,
          // Sem manifesto: é um JSON ao lado de cada arquivo que ninguém lê e
          // que a varredura de retenção teria que aprender a apagar também.
          disableManifest: true,
          s3: {
            accessKey: destino.accessKey,
            secret: destino.secret,
            region: destino.regiao,
            endpoint: destino.endpoint,
            bucket: destino.bucket,
            // Sem isto o upload falha só NO FIM da call, quando o arquivo vai
            // subir: o Supabase não atende por subdomínio de bucket, e o erro
            // aparece uma hora depois de a gravação ter começado bem.
            forcePathStyle: true,
          },
        },
      ],
      advanced: {
        width: VIDEO.largura,
        height: VIDEO.altura,
        framerate: VIDEO.quadros,
        videoBitrate: VIDEO.kbps,
        audioBitrate: VIDEO.audioKbps,
      },
    },
  };
}

/**
 * A base da API REST do storage, derivada do endpoint S3.
 *
 * O endpoint S3 do Supabase é `https://<ref>.supabase.co/storage/v1/s3`, e a
 * REST mora um nível acima. Derivar em vez de pedir uma sexta variável de
 * ambiente evita o engano mais provável de todos: as duas apontando para
 * projetos diferentes, o que só apareceria no dia em que alguém tentasse
 * assistir uma call — com o arquivo lá, gravado e cobrado.
 */
export function baseRest(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "").replace(/\/s3$/, "");
}
