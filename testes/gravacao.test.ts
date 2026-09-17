import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ehGravador, lerIdentidade } from "../src/lib/identidades";
import { normalizarEgress, type EventoDeEgress } from "../src/lib/livekit";
import {
  avancar,
  baseRest,
  avisoDaGravacao,
  caminhoDaGravacao,
  derivarGravacao,
  ordemDaSituacao,
  pedidoDeEgress,
  situacaoDoEgress,
  VIDEO,
} from "../src/lib/gravacao";

/**
 * A gravação da call.
 *
 * O caso que quebra não é o feliz. É o `egress_started` que chega DEPOIS do
 * `egress_ended` porque a rede engasgou e o LiveKit reentregou — e a gravação
 * pronta, com arquivo no bucket, volta a dizer "gravando" na tela do closer.
 */

/** O mesmo corpo real que `testes/livekit.test.ts` usa. */
const EGRESS = {
  id: "EG_1",
  event: "egress_ended",
  createdAt: "1789480800",
  egressInfo: {
    egressId: "EG_abc",
    roomName: "reuniao-abc",
    status: "EGRESS_COMPLETE",
    startedAt: "1789480800000000000",
    endedAt: "1789484400000000000",
    fileResults: [
      { filename: "reunioes/2026/09/15/abc.mp4", size: "26214400", duration: "3600000000000" },
    ],
  },
};

const evento = (mudancas: Partial<Record<string, unknown>> = {}): EventoDeEgress => {
  const e = normalizarEgress({
    ...EGRESS,
    ...mudancas,
    egressInfo: { ...EGRESS.egressInfo, ...((mudancas.egressInfo as object) ?? {}) },
  } as never);
  assert.ok(e, "o corpo de exemplo deixou de ser legível");
  return e;
};

describe("o gravador não é uma pessoa", () => {
  it("reconhece o prefixo do LiveKit", () => {
    assert.equal(ehGravador("EG_4kPz9"), true);
    assert.equal(ehGravador("u_abc"), false);
    assert.equal(ehGravador("l_abc"), false);
    assert.equal(ehGravador("c_ff00aa"), false);
  });

  it("não é confundido com um convidado", () => {
    // Sem isto ele vira linha em `Presence` e, numa sessão de dois inscritos,
    // sozinho dobra a taxa de presença.
    assert.equal(lerIdentidade("EG_4kPz9").tipo, "gravador");
    assert.equal(lerIdentidade("c_ff00aa").tipo, "convidado");
  });
});

describe("o estado da gravação nunca anda para trás", () => {
  it("avança quando o evento é mais adiantado", () => {
    assert.equal(avancar("PENDENTE", "GRAVANDO"), "GRAVANDO");
    assert.equal(avancar("GRAVANDO", "COMPLETA"), "COMPLETA");
  });

  it("um `egress_started` atrasado NÃO desfaz a gravação pronta", () => {
    // É o caso real: o LiveKit reentrega o que não recebeu 200, e não promete
    // ordem. Sem esta regra, a tela do closer diz "gravando" sobre um arquivo
    // que já está no bucket há uma hora.
    assert.equal(avancar("COMPLETA", "GRAVANDO"), "COMPLETA");
    assert.equal(avancar("FALHOU", "PENDENTE"), "FALHOU");
  });

  it("os três finais empatam: quem chegou primeiro decide", () => {
    assert.equal(ordemDaSituacao("COMPLETA"), ordemDaSituacao("FALHOU"));
    assert.equal(avancar("COMPLETA", "FALHOU"), "COMPLETA");
    assert.equal(avancar("FALHOU", "COMPLETA"), "FALHOU");
  });

  it("apagada pela retenção vence até o final", () => {
    assert.equal(avancar("COMPLETA", "APAGADA"), "APAGADA");
    assert.equal(avancar("APAGADA", "COMPLETA"), "APAGADA");
  });
});

describe("o vocabulário do LiveKit vira o nosso", () => {
  it("traduz os estados que existem", () => {
    assert.equal(situacaoDoEgress("EGRESS_STARTING"), "PENDENTE");
    assert.equal(situacaoDoEgress("EGRESS_ACTIVE"), "GRAVANDO");
    assert.equal(situacaoDoEgress("EGRESS_ENDING"), "PROCESSANDO");
    assert.equal(situacaoDoEgress("EGRESS_COMPLETE"), "COMPLETA");
    assert.equal(situacaoDoEgress("EGRESS_FAILED"), "FALHOU");
    assert.equal(situacaoDoEgress("EGRESS_ABORTED"), "ABORTADA");
  });

  it("um estado novo do lado deles não vira palpite", () => {
    assert.equal(situacaoDoEgress("EGRESS_QUALQUER_COISA"), null);
    assert.equal(situacaoDoEgress(""), null);
  });

  it("cortada no limite é COMPLETA — o arquivo abre — mas avisa", () => {
    // Dizer "Gravada ✓" com um certinho verde sobre um arquivo que para no
    // minuto 40 de uma call de 60 é mentir justamente sobre o fechamento.
    assert.equal(situacaoDoEgress("EGRESS_LIMIT_REACHED"), "COMPLETA");
    const e = evento({ egressInfo: { status: "EGRESS_LIMIT_REACHED" } });
    assert.match(avisoDaGravacao(e) ?? "", /cortada/i);
  });

  it("gravação inteira não tem aviso nenhum", () => {
    assert.equal(avisoDaGravacao(evento()), null);
  });
});

describe("o que gravar a partir do evento", () => {
  it("do corpo real sai arquivo, tamanho e duração medida", () => {
    const g = derivarGravacao(evento());
    assert.equal(g.status, "COMPLETA");
    assert.equal(g.caminho, "reunioes/2026/09/15/abc.mp4");
    assert.equal(g.bytes, 26_214_400);
    assert.equal(g.duracaoSegundos, 3600);
    assert.equal(g.iniciadaEm?.toISOString(), "2026-09-15T14:00:00.000Z");
  });

  it("um `egress_updated` magro NÃO apaga o que já sabíamos", () => {
    // Durante a call o LiveKit manda atualização sem `fileResults`. Escrever
    // por cima zeraria o caminho e o tamanho que uma reentrega do
    // `egress_ended` já tinha trazido — e aí a gravação existe no bucket e o
    // CRM não sabe onde ela está.
    const jaSabido = derivarGravacao(evento());
    const magro = evento({
      event: "egress_updated",
      egressInfo: { status: "EGRESS_ACTIVE", fileResults: [], endedAt: "0" },
    });

    const depois = derivarGravacao(magro, jaSabido);
    assert.equal(depois.caminho, "reunioes/2026/09/15/abc.mp4");
    assert.equal(depois.bytes, 26_214_400);
    assert.equal(depois.duracaoSegundos, 3600);
    assert.equal(depois.status, "COMPLETA", "e o estado também não volta");
  });

  it("arquivo com caminho vazio não conta como arquivo", () => {
    const vazio = evento({
      egressInfo: { status: "EGRESS_ACTIVE", fileResults: [{ filename: "", size: "0" }] },
    });
    assert.equal(derivarGravacao(vazio).caminho, null);
  });

  it("sem `status`, o TIPO do evento decide", () => {
    const semStatus = evento({ event: "egress_started", egressInfo: { status: "" } });
    assert.equal(derivarGravacao(semStatus).status, "GRAVANDO");
  });

  it("o erro do LiveKit é guardado", () => {
    const falhou = evento({
      egressInfo: { status: "EGRESS_FAILED", error: "could not upload to s3" },
    });
    const g = derivarGravacao(falhou);
    assert.equal(g.status, "FALHOU");
    assert.equal(g.erro, "could not upload to s3");
  });
});

describe("onde o arquivo mora", () => {
  it("é particionado por data", () => {
    assert.equal(
      caminhoDaGravacao("abc123", new Date("2026-09-15T14:00:00Z")),
      "reunioes/2026/09/15/abc123.mp4",
    );
  });

  it("a data é UTC, não a do processo", () => {
    // `pg` serializa Date no fuso do PROCESSO, e isso já produziu uma sala
    // nascida "encerrada" e um relatório que acusou uma correção de não ter
    // pego. Aqui o mesmo engano põe a gravação das 21h numa pasta do dia
    // seguinte — e a varredura de retenção apaga o arquivo errado.
    assert.equal(
      caminhoDaGravacao("abc", new Date("2026-09-15T02:00:00Z")),
      "reunioes/2026/09/15/abc.mp4",
      "em São Paulo (UTC-3) isto seria dia 14 se a data saísse do fuso local",
    );
  });

  it("zero à esquerda no mês e no dia", () => {
    assert.equal(caminhoDaGravacao("x", new Date("2026-01-05T10:00:00Z")), "reunioes/2026/01/05/x.mp4");
  });
});

describe("o pedido de gravação que vai junto do CreateRoom", () => {
  const destino = {
    bucket: "gravacoes",
    regiao: "sa-east-1",
    endpoint: "https://projeto.supabase.co/storage/v1/s3",
    accessKey: "chave",
    secret: "segredo",
  };

  it("SEM bucket configurado, não pede gravação nenhuma", () => {
    // Esta é a guarda inteira: sem chave, a sala é criada exatamente como
    // hoje. Sem erro, sem gravação, e sem deploy no dia em que a chave chegar.
    assert.equal(pedidoDeEgress("reuniao-abc", "x.mp4", null), null);
  });

  it("escreve direto no bucket, em path style", () => {
    const p = pedidoDeEgress("reuniao-abc", "reunioes/2026/09/15/abc.mp4", destino);
    const saida = (p?.room as Record<string, unknown>).fileOutputs as Record<string, unknown>[];
    const s3 = saida[0].s3 as Record<string, unknown>;
    assert.equal(saida[0].filepath, "reunioes/2026/09/15/abc.mp4");
    assert.equal(s3.bucket, "gravacoes");
    // Sem `forcePathStyle` o upload falha só NO FIM da call, uma hora depois
    // de ter começado bem: o Supabase não atende por subdomínio de bucket.
    assert.equal(s3.forcePathStyle, true);
  });

  it("720p a 15 quadros — é rosto falando, não futebol", () => {
    const p = pedidoDeEgress("reuniao-abc", "x.mp4", destino);
    const avancado = (p?.room as Record<string, unknown>).advanced as Record<string, number>;
    assert.equal(avancado.height, 720);
    assert.equal(avancado.framerate, 15);
    // Metade do armazenamento e da banda por um parâmetro: ~6,8 GB/dia em vez
    // de ~17, com as 12,5 sessões de uma hora que a produção tem hoje.
    assert.equal(avancado.videoBitrate, 1200);
    assert.equal(VIDEO.kbps, 1200);
  });

  it("quem fala ocupa a tela", () => {
    // Uma grade de trinta miniaturas é ilegível numa gravação, e ninguém
    // reassiste uma call assim.
    const p = pedidoDeEgress("reuniao-abc", "x.mp4", destino);
    assert.equal((p?.room as Record<string, unknown>).layout, "speaker");
  });
});

describe("a base da REST sai do endpoint S3", () => {
  it("tira o /s3 do fim", () => {
    // Uma variável só para as duas portas. Duas variáveis apontando para
    // projetos diferentes é o engano mais provável aqui — e ele só apareceria
    // no dia em que alguém tentasse assistir uma call, com o arquivo lá,
    // gravado e cobrado.
    assert.equal(
      baseRest("https://abc.supabase.co/storage/v1/s3"),
      "https://abc.supabase.co/storage/v1",
    );
  });

  it("barra sobrando no fim não vira barra dupla na URL", () => {
    assert.equal(
      baseRest("https://abc.supabase.co/storage/v1/s3/"),
      "https://abc.supabase.co/storage/v1",
    );
  });

  it("endpoint já sem /s3 fica como está", () => {
    assert.equal(
      baseRest("https://abc.supabase.co/storage/v1"),
      "https://abc.supabase.co/storage/v1",
    );
  });

  it("espaço de paste não entra na URL", () => {
    assert.equal(baseRest("  https://abc.supabase.co/storage/v1/s3 "), "https://abc.supabase.co/storage/v1");
  });
});
