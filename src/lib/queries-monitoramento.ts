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

  const [sessoes, series] = await Promise.all([
    prisma.meeting.count({
      where: {
        type: "GROUP",
        status: "SCHEDULED",
        capacity: { not: null },
        startsAt: { gte: agora, lte: ate },
      },
    }),
    prisma.sessionTemplate.count({ where: { active: true } }),
  ]);

  return {
    ate,
    dias: diasDeAgenda(agora),
    acabando: agendaAcabando(agora),
    sessoes,
    series,
  };
}
