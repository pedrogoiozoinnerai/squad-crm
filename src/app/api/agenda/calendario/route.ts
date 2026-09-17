import type { NextRequest } from "next/server";

import { portaDoCorpo, quemEstaNaSala } from "@/lib/acesso-a-sala";
import { ALARMES_PADRAO, calendarioDe } from "@/lib/ical";
import { guardaDeTaxa } from "@/lib/limite-servidor";
import { env } from "@/lib/env";

/**
 * O convite de calendário da reunião.
 *
 * A única lembrança que funciona hoje. Não há serviço de e-mail nem canal de
 * WhatsApp ligado: depois de agendar, o lead sai da nossa tela e nada mais o
 * alcança. Quem fecha a aba perde o link e some. Este arquivo põe o compromisso
 * — com alarme — dentro do calendário DELE.
 *
 * Mesma autorização das outras portas da sala, pelo mesmo módulo: o arquivo
 * carrega o link de entrada, então quem não entraria na sala também não baixa.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const barrado = await guardaDeTaxa("token", request);
  if (barrado) return barrado;

  const busca = request.nextUrl.searchParams;
  const quem = await quemEstaNaSala(
    portaDoCorpo({
      meetingId: busca.get("meetingId") ?? undefined,
      convite: busca.get("convite") ?? undefined,
      convidado: busca.get("convidado") ?? undefined,
    }),
  );
  if ("erro" in quem) return Response.json({ erro: quem.erro }, { status: quem.status });

  const { reuniao } = quem;
  const base = (env("NEXT_PUBLIC_APP_URL") ?? request.nextUrl.origin).replace(/\/+$/, "");
  const marca = env("NEXT_PUBLIC_BRAND_NAME") ?? "Squad.com";

  // O endereço que vai no convite é o MESMO por onde a pessoa entrou: quem tem
  // convite volta pelo convite, quem tem o link volta pelo link. Mandar o id da
  // reunião para um lead seria mandar uma porta que ele não consegue abrir.
  const porta = busca.get("convite")
    ? `${base}/convite/${busca.get("convite")}`
    : busca.get("convidado")
      ? `${base}/entrar/${busca.get("convidado")}`
      : `${base}/sala/${reuniao.id}`;

  const ics = calendarioDe(
    {
      // O identificador é da PESSOA, não da reunião.
      //
      // Foi assim que remarcar passou a funcionar de verdade: se o `uid`
      // dependesse do `meetingId`, trocar de horário criaria um SEGUNDO
      // compromisso no calendário do lead e o antigo ficaria lá — a pessoa
      // apareceria na hora errada, que é pior do que não ter remarcado. Com o
      // identificador preso ao convite e a `versao` no `SEQUENCE`, o compromisso
      // que já está no aparelho é atualizado.
      uid: `${quem.identidade}.${busca.get("convite") ?? reuniao.id}@squad.com`,
      versao: quem.versao ?? 0,
      inicio: reuniao.startsAt,
      fim: reuniao.endsAt,
      titulo: reuniao.title,
      descricao:
        `Sua sessão com o time ${marca}.\n\n` +
        `Entre por aqui: ${porta}\n\n` +
        `A sala abre 30 minutos antes. É pelo navegador, sem instalar nada.`,
      url: porta,
      organizador: { nome: marca },
      alarmesMin: ALARMES_PADRAO,
      cancelado: reuniao.status === "CANCELED",
    },
    new Date(),
  );

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // O nome do arquivo sai daqui, não da URL — é o que o navegador usa.
      "content-disposition": 'attachment; filename="reuniao-squad.ics"',
      "cache-control": "no-store",
    },
  });
}
