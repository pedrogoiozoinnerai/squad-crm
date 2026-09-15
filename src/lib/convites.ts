import "server-only";

import { novoTokenDeConvite } from "@/lib/codes";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * Garante que o lead tem convite para a reunião.
 *
 * Toda reunião com lead nasce com um. O contrário — gerar só quando alguém
 * clica em "copiar link" — significa que o link não existe até alguém lembrar
 * de criá-lo, e é o tipo de passo que se esquece na véspera da call.
 *
 * Idempotente: chamar de novo devolve o mesmo token, porque o link já pode ter
 * sido enviado ao lead e trocá-lo quebraria o que está no WhatsApp dele.
 */
export async function garantirConvite(meetingId: string, leadId: string) {
  const existente = await prisma.meetingAttendee.findUnique({
    where: { meetingId_leadId: { meetingId, leadId } },
    select: { inviteToken: true },
  });
  if (existente) return existente.inviteToken;

  const inviteToken = novoTokenDeConvite();
  try {
    await prisma.meetingAttendee.create({
      data: { meetingId, leadId, inviteToken, source: "AUTOMATICO", invitedAt: new Date() },
    });
    return inviteToken;
  } catch (erro) {
    // P2002: outro caminho criou o convite entre a leitura e a escrita. O que
    // vale é o que está no banco, não o que este processo acabou de sortear.
    if ((erro as { code?: string }).code !== "P2002") throw erro;
    const agora = await prisma.meetingAttendee.findUnique({
      where: { meetingId_leadId: { meetingId, leadId } },
      select: { inviteToken: true },
    });
    return agora?.inviteToken ?? inviteToken;
  }
}

/**
 * O endereço que vai para o lead.
 *
 * Leva ao convite, não à sala: a página do convite mostra a contagem antes da
 * hora e o botão só quando a sala abre. Mandar direto para a sala daria uma
 * tela de "ainda não abriu" para quem clicou no link dois dias antes.
 */
export function linkDoConvite(token: string) {
  const base = env("NEXT_PUBLIC_APP_URL", "http://localhost:3000")!.replace(/\/+$/, "");
  return `${base}/convite/${token}`;
}
