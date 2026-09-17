import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decidirReuniao, type ReuniaoExistente } from "../src/lib/sync-reuniao";

/**
 * O defeito: uma reunião NOVA a cada execução do cron.
 *
 * A busca pela reunião existente exigia `calBookingUid` nos dois caminhos. Isso
 * funcionava com o Cal.com; depois que o funil passou a reservar pela nossa
 * agenda o uid virou nulo, a busca deixou de achar, e o `if (!reuniao)` criava
 * outra — seis por hora, para sempre.
 *
 * Em produção: 26 reuniões duplicadas para um lead em quatro horas. A 1.000
 * leads/dia seriam 144 mil reuniões-lixo por dia.
 */

const em = (iso: string) => new Date(iso);

const DO_FUNIL = {
  crmMeetingId: "reuniao-abc",
  calBookingUid: null,
  agendadoEm: em("2026-09-17T14:00:00Z"),
  cancelado: false,
};

const DO_CAL = {
  crmMeetingId: null,
  calBookingUid: "cal-123",
  agendadoEm: em("2026-09-17T14:00:00Z"),
  cancelado: false,
};

const umaReuniao = (extra: Partial<NonNullable<ReuniaoExistente>> = {}): ReuniaoExistente => ({
  startsAt: em("2026-09-17T14:00:00Z"),
  status: "SCHEDULED",
  calBookingUid: "cal-123",
  type: "ONE_ON_ONE",
  ...extra,
});

describe("o lead que agendou pela NOSSA agenda", () => {
  it("não gera reunião nenhuma — era o defeito", () => {
    // Este é o caso exato que duplicava: `calBookingUid` nulo fazia a busca
    // falhar, e o sync criava uma reunião nova a cada dez minutos.
    const d = decidirReuniao(DO_FUNIL, null);
    assert.equal(d.acao, "nada");
  });

  it("não gera nem quando o sync roda mil vezes", () => {
    for (let i = 0; i < 1000; i++) {
      assert.equal(decidirReuniao(DO_FUNIL, null).acao, "nada");
    }
  });

  it("e NÃO atualiza a sessão coletiva — ela é de todo mundo", () => {
    // O risco pior que duplicar: mover o horário de uma sessão compartilhada
    // porque um dos inscritos passou pelo sync.
    const d = decidirReuniao(
      { ...DO_FUNIL, agendadoEm: em("2026-09-17T18:00:00Z") },
      umaReuniao({ type: "GROUP" }),
    );
    assert.equal(d.acao, "nada");
  });

  it("vale mesmo com um uid do Cal pendurado", () => {
    // Lead antigo que remarcou pela agenda nova: o `crmMeetingId` manda.
    const d = decidirReuniao({ ...DO_FUNIL, calBookingUid: "cal-velho" }, null);
    assert.equal(d.acao, "nada");
  });
});

describe("o lead que agendou pelo Cal.com — o caminho antigo continua", () => {
  it("sem reunião, cria", () => {
    assert.equal(decidirReuniao(DO_CAL, null).acao, "criar");
  });

  it("com a mesma reunião, não mexe", () => {
    assert.equal(decidirReuniao(DO_CAL, umaReuniao()).acao, "nada");
  });

  it("remarcou: atualiza em vez de criar uma segunda", () => {
    const d = decidirReuniao(
      { ...DO_CAL, agendadoEm: em("2026-09-17T18:00:00Z") },
      umaReuniao(),
    );
    assert.equal(d.acao, "atualizar");
  });

  it("uid novo depois de remarcar também é atualização", () => {
    const d = decidirReuniao({ ...DO_CAL, calBookingUid: "cal-999" }, umaReuniao());
    assert.equal(d.acao, "atualizar");
  });

  it("cancelou e voltou: a reunião cancelada é reaproveitada", () => {
    const d = decidirReuniao(DO_CAL, umaReuniao({ status: "CANCELED" }));
    assert.equal(d.acao, "atualizar");
  });
});

describe("cancelamento", () => {
  it("cancela a reunião que existe", () => {
    assert.equal(decidirReuniao({ ...DO_CAL, cancelado: true }, umaReuniao()).acao, "cancelar");
  });

  it("não cancela duas vezes", () => {
    const d = decidirReuniao({ ...DO_CAL, cancelado: true }, umaReuniao({ status: "CANCELED" }));
    assert.equal(d.acao, "nada");
  });

  it("cancelamento sem reunião não quebra", () => {
    assert.equal(decidirReuniao({ ...DO_CAL, cancelado: true }, null).acao, "nada");
  });

  it("quem reservou pela nossa agenda não é tocado nem no cancelamento do Cal", () => {
    // `calCancelledAt` é do Cal.com. Cancelar a inscrição coletiva é outro
    // caminho, com outra régua — este aqui não pode adivinhar.
    const d = decidirReuniao({ ...DO_FUNIL, cancelado: true }, umaReuniao({ type: "GROUP" }));
    assert.equal(d.acao, "nada");
  });
});

describe("quem não marcou horário", () => {
  it("não vira reunião", () => {
    // É o lead mais qualificado que existe — respondeu tudo e não agendou —,
    // mas reunião sem horário não é reunião.
    const d = decidirReuniao({ ...DO_CAL, agendadoEm: null }, null);
    assert.equal(d.acao, "nada");
  });
});
