import { notFound } from "next/navigation";

import { SalaCliente } from "@/components/sala/SalaCliente";
import { prisma } from "@/lib/prisma";
import { situacaoDaSala } from "@/lib/sala";
import { armazenamentoConfigurado } from "@/lib/armazenamento";

/**
 * A sala pelo LINK da reunião.
 *
 * A terceira porta, ao lado de `/sala/[meetingId]` (sessão do CRM) e
 * `/convite/[token]` (lead inscrito). Existe porque "me manda o link" não
 * tinha resposta quando a reunião não tinha lead — e a maioria das reuniões
 * marcadas na hora não tem.
 *
 * O token é da SALA, não da pessoa: quem chega por aqui diz o próprio nome e
 * entra como convidado. A autorização de verdade é refeita na rota que emite o
 * token; esta página só evita desenhar uma sala para um link que não existe.
 */
export const dynamic = "force-dynamic";

export default async function EntrarPage(props: PageProps<"/entrar/[token]">) {
  const { token } = await props.params;

  const reuniao = await prisma.meeting.findUnique({
    where: { guestToken: token },
    select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
  });
  if (!reuniao) notFound();

  return (
    <SalaCliente
      meetingId={reuniao.id}
      convite={null}
      convidado={token}
      nome=""
      host={false}
      titulo={reuniao.title}
      situacao={situacaoDaSala(reuniao, new Date())}
      gravada={armazenamentoConfigurado()}
      voltarPara={null}
    />
  );
}
