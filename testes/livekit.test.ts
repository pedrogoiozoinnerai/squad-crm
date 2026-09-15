import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  identidadeDoLead,
  identidadeDoUsuario,
  lerIdentidade,
  lerWebhook,
  normalizarEgress,
  normalizarEvento,
  reuniaoDaSala,
  salaDaReuniao,
  tokenDeAcesso,
  tokenDeServico,
  urlHttpDoLiveKit,
} from "../src/lib/livekit";

const CHAVE = "APIchave123";
const SEGREDO = "segredo-de-teste-bem-comprido-para-hmac";
const AGORA = new Date("2026-09-15T14:00:00Z");

function decodificar(token: string) {
  const [, corpo] = token.split(".");
  return JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
}

describe("token de acesso", () => {
  const token = tokenDeAcesso({
    apiKey: CHAVE,
    apiSecret: SEGREDO,
    sala: "reuniao-abc",
    identidade: "u_123",
    nome: "Pedro",
    host: true,
    agora: AGORA,
  });

  it("é um JWT assinado com o segredo da API", () => {
    const [cabecalho, corpo, assinatura] = token.split(".");
    const esperada = createHmac("sha256", SEGREDO)
      .update(`${cabecalho}.${corpo}`)
      .digest("base64url");
    assert.equal(assinatura, esperada);
  });

  it("concede a sala pedida e só ela", () => {
    const corpo = decodificar(token);
    assert.equal(corpo.video.room, "reuniao-abc");
    assert.equal(corpo.video.roomJoin, true);
    assert.equal(corpo.iss, CHAVE);
    assert.equal(corpo.sub, "u_123");
  });

  it("só o host administra a sala", () => {
    assert.equal(decodificar(token).video.roomAdmin, true);
    const doLead = tokenDeAcesso({
      apiKey: CHAVE,
      apiSecret: SEGREDO,
      sala: "reuniao-abc",
      identidade: "l_999",
      nome: "Lead",
      agora: AGORA,
    });
    // Sem isso o lead poderia remover o vendedor da própria reunião.
    assert.equal(decodificar(doLead).video.roomAdmin, false);
  });

  it("vale por tempo limitado e tolera relógio adiantado", () => {
    const corpo = decodificar(token);
    const emSegundos = Math.floor(AGORA.getTime() / 1000);
    assert.ok(corpo.nbf < emSegundos, "nbf tem folga para trás");
    assert.equal(corpo.exp, emSegundos + 4 * 60 * 60);
  });
});

describe("identidade", () => {
  it("diz de quem é sem precisar consultar o banco", () => {
    assert.deepEqual(lerIdentidade(identidadeDoUsuario("abc")), { tipo: "usuario", id: "abc" });
    assert.deepEqual(lerIdentidade(identidadeDoLead("xyz")), { tipo: "lead", id: "xyz" });
  });

  it("não confunde um id que por acaso comece com a letra do outro", () => {
    // "user-1" sem prefixo poderia ser lido como lead.
    assert.deepEqual(lerIdentidade("user-1"), { tipo: "desconhecido", id: "user-1" });
  });

  it("sala vai e volta para o id da reunião", () => {
    assert.equal(reuniaoDaSala(salaDaReuniao("m1")), "m1");
    assert.equal(reuniaoDaSala("closer-abc"), null);
  });
});

/** Monta um webhook assinado como o LiveKit assina. */
function webhookAssinado(corpo: unknown, opcoes: { segredo?: string; chave?: string } = {}) {
  const cru = JSON.stringify(corpo);
  const hash = createHash("sha256").update(cru).digest("base64");
  const cabecalho = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const reivindicacoes = Buffer.from(
    JSON.stringify({
      iss: opcoes.chave ?? CHAVE,
      exp: Math.floor(AGORA.getTime() / 1000) + 300,
      sha256: hash,
    }),
  ).toString("base64url");
  const assinatura = createHmac("sha256", opcoes.segredo ?? SEGREDO)
    .update(`${cabecalho}.${reivindicacoes}`)
    .digest("base64url");
  return { cru, autorizacao: `${cabecalho}.${reivindicacoes}.${assinatura}` };
}

const EVENTO = {
  id: "EV_1",
  event: "participant_joined",
  createdAt: "1789480800", // segundos, como string — é assim que ele manda
  room: { name: "reuniao-abc" },
  participant: { identity: "l_999", name: "Joana" },
};

describe("webhook do LiveKit", () => {
  it("aceita um evento legítimo", () => {
    const { cru, autorizacao } = webhookAssinado(EVENTO);
    const r = lerWebhook(cru, autorizacao, CHAVE, SEGREDO, AGORA);
    assert.ok("evento" in r, "erro" in r ? r.erro : "");
    assert.equal(r.evento.tipo, "participant_joined");
    assert.equal(r.evento.identidade, "l_999");
    assert.equal(r.evento.sala, "reuniao-abc");
  });

  it("recusa corpo trocado com assinatura válida", () => {
    // O ataque que só conferir a assinatura do token deixaria passar.
    const { autorizacao } = webhookAssinado(EVENTO);
    const outro = JSON.stringify({ ...EVENTO, participant: { identity: "l_INVASOR" } });
    const r = lerWebhook(outro, autorizacao, CHAVE, SEGREDO, AGORA);
    assert.ok("erro" in r);
    assert.match(r.erro, /corpo não confere/);
  });

  it("recusa assinatura de outro segredo", () => {
    const { cru, autorizacao } = webhookAssinado(EVENTO, { segredo: "outro-segredo-qualquer" });
    const r = lerWebhook(cru, autorizacao, CHAVE, SEGREDO, AGORA);
    assert.ok("erro" in r);
    assert.match(r.erro, /assinatura inválida/);
  });

  it("recusa emissor diferente da nossa chave", () => {
    const { cru, autorizacao } = webhookAssinado(EVENTO, { chave: "APIoutra" });
    const r = lerWebhook(cru, autorizacao, CHAVE, SEGREDO, AGORA);
    assert.ok("erro" in r);
    assert.match(r.erro, /emissor/);
  });

  it("recusa token expirado", () => {
    const { cru, autorizacao } = webhookAssinado(EVENTO);
    const r = lerWebhook(cru, autorizacao, CHAVE, SEGREDO, new Date("2026-09-15T15:00:00Z"));
    assert.ok("erro" in r);
    assert.match(r.erro, /expirado/);
  });

  it("não explode com lixo — devolve erro", () => {
    for (const entrada of ["", "a.b", "a.b.c"]) {
      const r = lerWebhook("{}", entrada || null, CHAVE, SEGREDO, AGORA);
      assert.ok("erro" in r, `deveria recusar ${JSON.stringify(entrada)}`);
    }
  });
});

describe("normalização do evento", () => {
  it("lê createdAt em SEGUNDOS", () => {
    // Tratar como milissegundos joga o evento para 1970 e some com a presença.
    const evento = normalizarEvento(EVENTO as never);
    assert.equal(evento?.em.getUTCFullYear(), 2026);
  });

  it("aceita evento de sala sem participante", () => {
    const evento = normalizarEvento({
      id: "EV_2",
      event: "room_finished",
      createdAt: 1789480800,
      room: { name: "reuniao-abc" },
    } as never);
    assert.equal(evento?.identidade, null);
    assert.equal(evento?.tipo, "room_finished");
  });

  it("descarta evento sem os campos que identificam", () => {
    assert.equal(normalizarEvento({ event: "x" } as never), null);
    assert.equal(normalizarEvento({ id: "1", room: { name: "r" } } as never), null);
  });
});

/** Corpo real de um `egress_ended`, na forma que o LiveKit entrega. */
const EGRESS = {
  id: "EG_1",
  event: "egress_ended",
  createdAt: "1789480800",
  egressInfo: {
    egressId: "EG_abc",
    roomName: "reuniao-abc",
    status: "EGRESS_COMPLETE",
    // Nanossegundos, como int64 em string — não segundos, não milissegundos.
    startedAt: "1789480800000000000",
    endedAt: "1789484400000000000",
    fileResults: [
      { filename: "reuniao-abc/EG_abc.ogg", size: "26214400", duration: "3600000000000" },
    ],
  },
};

describe("evento de gravação", () => {
  it("é aceito pelo webhook — antes caía em 401 e reentregava para sempre", () => {
    // `normalizarEvento` exige `room.name`, que o egress não traz. Sem o ramo
    // novo, `lerWebhook` devolvia erro e o LiveKit repetia sem parar.
    const { cru, autorizacao } = webhookAssinado(EGRESS);
    const r = lerWebhook(cru, autorizacao, CHAVE, SEGREDO, AGORA);
    assert.ok("egress" in r, "erro" in r ? r.erro : "veio como evento de sala");
    assert.equal(r.egress.egressId, "EG_abc");
    assert.equal(r.egress.sala, "reuniao-abc");
  });

  it("lê os tempos em NANOSSEGUNDOS", () => {
    const e = normalizarEgress(EGRESS as never);
    // Tratar como milissegundos jogaria para 1970 e zeraria a duração.
    assert.equal(e?.iniciadoEm?.toISOString(), "2026-09-15T14:00:00.000Z");
    assert.equal(e?.terminadoEm?.toISOString(), "2026-09-15T15:00:00.000Z");
  });

  it("traz arquivo com tamanho e duração em segundos", () => {
    const e = normalizarEgress(EGRESS as never);
    assert.equal(e?.arquivos.length, 1);
    assert.equal(e?.arquivos[0].bytes, 26_214_400);
    assert.equal(e?.arquivos[0].duracaoSegundos, 3600);
  });

  it("aceita a forma antiga `file` além de `fileResults`", () => {
    const antigo = {
      ...EGRESS,
      egressInfo: { ...EGRESS.egressInfo, fileResults: undefined, file: { filename: "x.ogg", size: 10 } },
    };
    assert.equal(normalizarEgress(antigo as never)?.arquivos[0].caminho, "x.ogg");
  });

  it("egress que ainda não terminou não inventa data de fim", () => {
    const rodando = {
      ...EGRESS,
      event: "egress_started",
      egressInfo: { ...EGRESS.egressInfo, endedAt: "0", fileResults: [] },
    };
    const e = normalizarEgress(rodando as never);
    assert.equal(e?.terminadoEm, null);
    assert.deepEqual(e?.arquivos, []);
  });

  it("descarta corpo sem egressId ou sem sala", () => {
    assert.equal(normalizarEgress({ id: "1", event: "x", egressInfo: {} } as never), null);
    assert.equal(normalizarEgress({ id: "1", event: "x" } as never), null);
  });
});

describe("token de serviço", () => {
  it("autoriza administrar, e não entrar em sala", () => {
    const token = tokenDeServico({
      apiKey: CHAVE,
      apiSecret: SEGREDO,
      concessoes: { roomCreate: true, roomRecord: true },
      agora: AGORA,
    });
    const corpo = decodificar(token);
    assert.equal(corpo.video.roomCreate, true);
    // Sem `roomJoin`: um token de serviço não entra em call nenhuma.
    assert.equal(corpo.video.roomJoin, undefined);
    assert.equal(corpo.iss, CHAVE);
  });

  it("vale por pouco tempo — assina uma chamada e morre", () => {
    const corpo = decodificar(
      tokenDeServico({ apiKey: CHAVE, apiSecret: SEGREDO, concessoes: {}, agora: AGORA }),
    );
    assert.equal(corpo.exp - Math.floor(AGORA.getTime() / 1000), 60);
  });
});

describe("url de API", () => {
  it("converte o endereço WebSocket em HTTPS", () => {
    // Uma variável de ambiente só; duas sairiam de sincronia na troca de projeto.
    assert.equal(urlHttpDoLiveKit("wss://x.livekit.cloud"), "https://x.livekit.cloud");
    assert.equal(urlHttpDoLiveKit("ws://localhost:7880/"), "http://localhost:7880");
    assert.equal(urlHttpDoLiveKit("  wss://x.livekit.cloud/  "), "https://x.livekit.cloud");
  });
});
