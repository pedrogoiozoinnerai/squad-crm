import "server-only";

import { agendaAcabando, diasDeAgenda, horizonteDaAgenda } from "@/lib/horizonte";
import { prisma } from "@/lib/prisma";

export { saudeDoLiveKit } from "@/lib/reconciliar";

/**
 * Reuniões que já terminaram e não têm um único evento de sala.
 *
 * É o número que o CRM de referência não mostra em lugar nenhum — lá ele
 * aparece só como "1028 pendentes" num botão de manutenção, sem dizer quais
 * nem desde quando. Listar as reuniões é o que transforma o número em algo
 * que dá para investigar.
 */
export async function reunioesSemDados(agora: Date, dias = 7) {
  const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);

  const candidatas = await prisma.meeting.findMany({
    where: {
      endsAt: { gte: desde, lte: agora },
      status: { not: "CANCELED" },
      // Só o que alguém deveria ter comparecido.
      //
      // Desde que a agenda do funil abre 13 horários por dia, a maioria das
      // sessões termina sem ninguém inscrito — e sem inscrito não há evento de
      // sala porque não havia sala, não porque a coleta falhou. Sem este
      // recorte, esta tela — que existe para avisar de falha — passaria a
      // listar ~78 sessões vazias por semana e viraria ruído.
      OR: [{ attendees: { some: {} } }, { leadId: { not: null } }],
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      status: true,
      owner: { select: { name: true } },
      lead: { select: { id: true, name: true } },
      _count: { select: { roomEvents: true } },
    },
    orderBy: { endsAt: "desc" },
    take: 100,
  });

  return candidatas.filter((m) => m._count.roomEvents === 0);
}

/**
 * Até quando a agenda que o funil mostra ainda tem horário.
 *
 * O horizonte é o último dia do mês corrente e para ali — foi decisão de
 * produto, e a consequência é real: no dia 30 sobra um dia. Quem precisa ver
 * isso chegando é o time, por esta tela, e não o lead ao encontrar uma lista
 * vazia no fim do funil.
 */
export async function saudeDaAgenda(agora: Date) {
  const ate = horizonteDaAgenda(agora);
  const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

  const janela = {
    type: "GROUP" as const,
    status: "SCHEDULED" as const,
    capacity: { not: null },
  };

  const [doHorizonte, series, do24h] = await Promise.all([
    prisma.meeting.findMany({
      where: { ...janela, startsAt: { gte: agora, lte: ate } },
      select: {
        capacity: true,
        _count: { select: { attendees: { where: { status: { in: ["INSCRITO", "CONFIRMADO"] } } } } },
      },
      take: 1000,
    }),
    prisma.sessionTemplate.count({ where: { active: true } }),
    // As próximas 24 horas separadas: é o número que decide se o anúncio de
    // AMANHÃ tem onde cair. O total do mês pode estar folgado e o dia
    // seguinte, lotado — e é o dia seguinte que o lead vê.
    prisma.meeting.findMany({
      where: { ...janela, startsAt: { gte: agora, lte: amanha } },
      select: {
        capacity: true,
        _count: { select: { attendees: { where: { status: { in: ["INSCRITO", "CONFIRMADO"] } } } } },
      },
      take: 200,
    }),
  ]);

  const soma = (linhas: typeof doHorizonte) =>
    linhas.reduce(
      (t, m) => {
        const lotacao = m.capacity ?? 0;
        return {
          lotacao: t.lotacao + lotacao,
          inscritos: t.inscritos + m._count.attendees,
          vagas: t.vagas + Math.max(0, lotacao - m._count.attendees),
        };
      },
      { lotacao: 0, inscritos: 0, vagas: 0 },
    );

  const total = soma(doHorizonte);
  const proximas24h = soma(do24h);

  return {
    ate,
    dias: diasDeAgenda(agora),
    acabando: agendaAcabando(agora),
    sessoes: doHorizonte.length,
    series,
    // O que realmente acaba antes dos dias: a VAGA. Uma agenda com 20 dias e
    // zero vaga é uma agenda vazia para quem está no fim do funil.
    vagas: total.vagas,
    inscritos: total.inscritos,
    ocupacao: total.lotacao > 0 ? Math.round((total.inscritos / total.lotacao) * 100) : 0,
    vagas24h: proximas24h.vagas,
    ocupacao24h:
      proximas24h.lotacao > 0
        ? Math.round((proximas24h.inscritos / proximas24h.lotacao) * 100)
        : 0,
  };
}
