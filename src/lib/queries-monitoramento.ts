import "server-only";

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
    where: { endsAt: { gte: desde, lte: agora }, status: { not: "CANCELED" } },
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
