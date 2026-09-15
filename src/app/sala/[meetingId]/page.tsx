import { notFound } from "next/navigation";

import { SalaCliente } from "@/components/sala/SalaCliente";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { situacaoDaSala } from "@/lib/sala";

/**
 * A sala — a mesma para o vendedor e para o lead.
 *
 * Fora de `/admin` e `/user` de propósito: o lead não tem conta. Quem autoriza
 * é a sessão do CRM ou o token do convite, e a checagem é refeita na rota que
 * emite o token — esta aqui só evita desenhar uma sala para quem não entra.
 */
export const dynamic = "force-dynamic";

export default async function SalaPage(props: PageProps<"/sala/[meetingId]">) {
  const { meetingId } = await props.params;
  const { c } = await props.searchParams;
  const convite = (Array.isArray(c) ? c[0] : c)?.trim();

  const reuniao = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      status: true,
      ownerId: true,
      owner: { select: { name: true } },
      lead: { select: { name: true } },
    },
  });
  if (!reuniao) notFound();

  let nome: string | null = null;
  let host = false;

  if (convite) {
    const assento = await prisma.meetingAttendee.findUnique({
      where: { inviteToken: convite },
      select: { status: true, meetingId: true, lead: { select: { name: true } } },
    });
    // O convite tem que ser DESTA reunião: sem conferir, um convite válido de
    // outra sala abriria esta.
    if (assento && assento.meetingId === reuniao.id && assento.status !== "CANCELADO") {
      nome = assento.lead.name;
    }
  } else {
    const user = await getSessionUser();
    if (user && (user.role === "ADMIN" || user.id === reuniao.ownerId)) {
      nome = user.name;
      host = true;
    }
  }

  if (!nome) notFound();

  return (
    <SalaCliente
      meetingId={reuniao.id}
      convite={convite ?? null}
      nome={nome}
      host={host}
      titulo={reuniao.title}
      situacao={situacaoDaSala(reuniao, new Date())}
      voltarPara={host ? "/admin/agenda" : null}
    />
  );
}
