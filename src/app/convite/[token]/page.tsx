import { notFound } from "next/navigation";

import { EntradaDoConvite } from "@/components/sala/EntradaDoConvite";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { janelaDaSala, situacaoDaSala } from "@/lib/sala";
import { TZ } from "@/lib/dates";

/**
 * A porta do lead — pública, sem conta.
 *
 * Fora de `/admin` e `/user`, então o proxy não a alcança: quem autoriza é o
 * token do convite, e só ele. `force-dynamic` porque a tela depende do relógio;
 * uma versão em cache mostraria a contagem congelada do primeiro visitante.
 */
export const dynamic = "force-dynamic";

const dia = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TZ,
});
const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

export default async function ConvitePage(props: PageProps<"/convite/[token]">) {
  const { token } = await props.params;
  const { r } = await props.searchParams;

  const convite = await prisma.meetingAttendee.findUnique({
    where: { inviteToken: token },
    select: {
      status: true,
      lead: { select: { name: true } },
      meeting: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          owner: { select: { name: true } },
        },
      },
    },
  });

  // Convite inexistente e convite cancelado dão a mesma resposta: quem estiver
  // testando tokens não descobre quais existem.
  if (!convite || convite.status === "CANCELADO") notFound();

  const agora = new Date();
  const { meeting } = convite;
  const quando = dia.format(meeting.startsAt);

  return (
    <EntradaDoConvite
      // Vem da remarcação, que redireciona para cá: sem isso a pessoa troca o
      // horário e volta para uma tela idêntica à anterior, sem nada dizendo que
      // deu certo — e remarca de novo, achando que não funcionou.
      acabouDeRemarcar={(Array.isArray(r) ? r[0] : r) === "remarcado"}
      agoraServidor={agora.toISOString()}
      marca={env("NEXT_PUBLIC_BRAND_NAME", "Squad.com")!}
      convite={{
        token,
        meetingId: meeting.id,
        leadNome: convite.lead.name,
        donoNome: meeting.owner.name,
        // "terça-feira, 15 de setembro" → "Terça, 15 de setembro"
        quando: quando.charAt(0).toUpperCase() + quando.slice(1).replace("-feira", ""),
        horario: hora.format(meeting.startsAt),
        abreEm: janelaDaSala(meeting).abreEm.toISOString(),
        situacao: situacaoDaSala(meeting, agora),
      }}
    />
  );
}
