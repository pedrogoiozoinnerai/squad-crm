"use server";

import { assertOwns, currentUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * Marca (ou desmarca) um bloco do roteiro durante a call.
 *
 * O `segundo` é o que dá valor ao registro: sem ele fica uma lista de caixas
 * clicadas, e não há como conferir nada. Com ele, a análise depois compara o
 * que o vendedor DIZ que fez com o que a transcrição mostra naquele instante.
 */
export async function marcarBloco(entrada: {
  meetingId: string;
  blocoId: string;
  segundo: number;
  marcar: boolean;
}) {
  const user = await currentUser();

  const reuniao = await prisma.meeting.findUnique({
    where: { id: entrada.meetingId },
    select: { ownerId: true },
  });
  if (!reuniao) throw new Error("Reunião não encontrada.");
  // Só quem conduz a call marca o próprio roteiro.
  assertOwns(user, reuniao.ownerId);

  if (!entrada.marcar) {
    await prisma.meetingBloco.deleteMany({
      where: { meetingId: entrada.meetingId, blocoId: entrada.blocoId },
    });
    return { ok: true };
  }

  await prisma.meetingBloco.upsert({
    where: {
      meetingId_blocoId: { meetingId: entrada.meetingId, blocoId: entrada.blocoId },
    },
    // Não sobrescreve o segundo: vale a primeira vez que o bloco foi feito.
    // Desmarcar e marcar de novo por engano não pode reescrever a linha do
    // tempo da call.
    update: {},
    create: {
      meetingId: entrada.meetingId,
      blocoId: entrada.blocoId,
      segundo: Math.max(0, Math.round(entrada.segundo)),
    },
  });

  return { ok: true };
}
