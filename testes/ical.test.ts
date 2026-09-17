import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALARMES_PADRAO,
  calendarioDe,
  carimbo,
  dobrar,
  escapar,
} from "../src/lib/ical";

/**
 * O `.ics` é a única lembrança que funciona hoje.
 *
 * Não há e-mail nem WhatsApp ligados: depois de agendar, nada mais alcança o
 * lead. O arquivo transfere a lembrança para o aparelho dele. E o formato
 * quebra em silêncio — o arquivo baixa, o calendário recusa, ninguém fica
 * sabendo —, então cada regra chata tem um caso aqui.
 */

const AGORA = new Date("2026-09-17T03:00:00.000Z");

const EVENTO = {
  uid: "convite-abc@squad.com",
  inicio: new Date("2026-09-17T11:00:00.000Z"),
  fim: new Date("2026-09-17T12:00:00.000Z"),
  titulo: "Apresentação Squad",
  descricao: "Apresentação ao vivo.",
  url: "https://squad-crm.vercel.app/convite/abc",
};

describe("carimbo de data", () => {
  it("é sempre UTC, no formato do iCalendar", () => {
    // UTC e não fuso local: carregar `VTIMEZONE` dentro do arquivo é a parte do
    // formato que mais quebra entre clientes.
    assert.equal(carimbo(new Date("2026-09-17T11:00:00.000Z")), "20260917T110000Z");
  });

  it("preenche com zero à esquerda", () => {
    assert.equal(carimbo(new Date("2026-01-02T03:04:05.000Z")), "20260102T030405Z");
  });
});

describe("escape", () => {
  it("protege vírgula e ponto-e-vírgula", () => {
    // "Acme, Ltda" sem escape parte o campo em dois e o resto do arquivo desanda.
    assert.equal(escapar("Acme, Ltda; filial"), "Acme\\, Ltda\\; filial");
  });

  it("a contrabarra é escapada primeiro", () => {
    // Se fosse por último, escaparíamos as barras que nós mesmos acabamos de pôr.
    assert.equal(escapar("a\\b,c"), "a\\\\b\\,c");
  });

  it("quebra de linha vira \\n literal", () => {
    assert.equal(escapar("uma\nduas"), "uma\\nduas");
    assert.equal(escapar("uma\r\nduas"), "uma\\nduas");
  });
});

describe("dobra de linha", () => {
  it("linha curta passa intacta", () => {
    assert.equal(dobrar("SUMMARY:oi"), "SUMMARY:oi");
  });

  it("dobra em 75 octetos, com espaço na continuação", () => {
    const dobrada = dobrar("X:" + "a".repeat(120));
    const partes = dobrada.split("\r\n");
    assert.ok(partes.length > 1);
    assert.ok(Buffer.from(partes[0], "utf8").length <= 75);
    assert.ok(partes[1].startsWith(" "), "a continuação começa com espaço");
  });

  it("conta OCTETOS, não caracteres — é o caso de todo texto com acento", () => {
    // "Apresentação" tem 12 caracteres e 14 bytes. Cortar por caractere estoura
    // o limite em qualquer texto nosso.
    const dobrada = dobrar("SUMMARY:" + "ção ".repeat(30));
    for (const parte of dobrada.split("\r\n")) {
      assert.ok(
        Buffer.from(parte, "utf8").length <= 75,
        `linha com ${Buffer.from(parte, "utf8").length} octetos`,
      );
    }
  });

  it("nunca corta um caractere no meio", () => {
    // Um corte no meio de um caractere de dois bytes produz lixo que o
    // calendário mostra como "?" ou recusa.
    const texto = "SUMMARY:" + "ãéõçü".repeat(40);
    const remontado = dobrar(texto).split("\r\n ").join("");
    assert.equal(remontado, texto);
  });
});

describe("o arquivo inteiro", () => {
  const ics = calendarioDe({ ...EVENTO, alarmesMin: ALARMES_PADRAO }, AGORA);

  it("abre e fecha como o formato manda", () => {
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  });

  it("usa CRLF — LF sozinho é recusado por alguns clientes", () => {
    const soLf = ics.split("\r\n").join("").includes("\n");
    assert.equal(soLf, false, "sobrou um \\n sem \\r");
  });

  it("leva início, fim e identificador estável", () => {
    assert.match(ics, /DTSTART:20260917T110000Z/);
    assert.match(ics, /DTEND:20260917T120000Z/);
    assert.match(ics, /UID:convite-abc@squad\.com/);
  });

  it("o link vai em LOCATION e em URL", () => {
    // O Google lê o primeiro, o Apple Calendar mostra o segundo, e nenhum
    // cliente lê os dois.
    assert.match(ics, /LOCATION:https/);
    assert.match(ics, /URL:https/);
  });

  it("os alarmes são o motivo de o arquivo existir", () => {
    const alarmes = ics.match(/BEGIN:VALARM/g) ?? [];
    assert.equal(alarmes.length, 2);
    assert.match(ics, /TRIGGER:-PT1440M/);
    assert.match(ics, /TRIGGER:-PT15M/);
  });

  it("sem alarme pedido, nenhum alarme sai", () => {
    const sem = calendarioDe(EVENTO, AGORA);
    assert.ok(!sem.includes("VALARM"));
  });

  it("remarcar atualiza em vez de duplicar", () => {
    // Mesmo `uid` e `SEQUENCE` maior: é o que faz o compromisso MUDAR no
    // aparelho do lead em vez de virar um segundo compromisso.
    const v2 = calendarioDe({ ...EVENTO, versao: 2 }, AGORA);
    assert.match(v2, /SEQUENCE:2/);
    assert.match(v2, /UID:convite-abc@squad\.com/);
  });

  it("cancelar diz que cancelou", () => {
    const cancelado = calendarioDe({ ...EVENTO, versao: 3, cancelado: true }, AGORA);
    assert.match(cancelado, /METHOD:CANCEL/);
    assert.match(cancelado, /STATUS:CANCELLED/);
  });

  it("título com vírgula não quebra o arquivo", () => {
    const ics = calendarioDe(
      { ...EVENTO, titulo: "Apresentação Squad, ao vivo; com o time" },
      AGORA,
    );
    // Remonta as linhas dobradas antes de conferir.
    const inteiro = ics.split("\r\n ").join("");
    assert.match(inteiro, /SUMMARY:Apresentação Squad\\, ao vivo\\; com o time/);
  });

  it("nenhuma linha passa de 75 octetos", () => {
    const longo = calendarioDe(
      {
        ...EVENTO,
        titulo: "Apresentação Squad.com — sessão de demonstração ao vivo com especialista",
        descricao:
          "Uma hora com o time, ao vivo, para mostrar como a operação funciona " +
          "de ponta a ponta e responder o que você precisar.",
      },
      AGORA,
    );
    for (const linha of longo.split("\r\n")) {
      assert.ok(
        Buffer.from(linha, "utf8").length <= 75,
        `"${linha.slice(0, 30)}…" com ${Buffer.from(linha, "utf8").length} octetos`,
      );
    }
  });
});
