import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";

import { remarcarSessao } from "@/app/convite/[token]/remarcar/acoes";
import { CalendarioDeSessoes, diaQueAbre } from "@/components/sala/CalendarioDeSessoes";
import { chaveDoDia, hhmm, TZ } from "@/lib/dates";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { alternativas, motivoParaNaoRemarcar } from "@/lib/remarcacao";
import { sessoesComVaga } from "@/lib/sessoes";

/**
 * Trocar de horário, pelo próprio convite.
 *
 * Esta página faltava — e o link para ela já estava na tela do convite desde o
 * começo, dando 404. Quem não podia vir clicava em "Remarque aqui", batia no
 * erro e sumia: não aparecia E deixava a vaga presa até a hora da sessão,
 * bloqueando alguém que apareceria.
 *
 * A escolha é feita no MESMO calendário do funil (`CalendarioDeSessoes`), e não
 * mais numa lista corrida de todos os dias: quem acabou de marcar num calendário
 * de mês volta para trocar e encontra a tela que já conhece.
 *
 * Tudo em `<form>` e em links, sem estado no cliente: é a tela de um lead num
 * celular qualquer, e ela tem de funcionar mesmo que nenhum JavaScript carregue.
 * O dia e o mês escolhidos viajam pela URL (`?dia=`, `?mes=`) pelo mesmo motivo.
 */
export const dynamic = "force-dynamic";

const fmtDia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const umSo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RemarcarPage(props: PageProps<"/convite/[token]/remarcar">) {
  const { token } = await props.params;
  const { r, dia, mes } = await props.searchParams;

  const inscricao = await prisma.meetingAttendee.findUnique({
    where: { inviteToken: token },
    select: {
      status: true,
      meetingId: true,
      lead: { select: { name: true } },
      meeting: { select: { startsAt: true, title: true } },
    },
  });
  if (!inscricao) notFound();

  const agora = new Date();
  const marca = env("NEXT_PUBLIC_BRAND_NAME") ?? "Squad.com";
  const recusa = motivoParaNaoRemarcar(inscricao);
  const opcoes = recusa ? [] : alternativas(await sessoesComVaga(agora), inscricao);

  // O dia em que a pessoa já está — é nele que o calendário abre.
  const diaDaSessao = inscricao.meeting ? chaveDoDia(inscricao.meeting.startsAt) : undefined;

  // Quando o dia dela não tem outro horário, o calendário cai noutro dia. Isso
  // é dito aqui em cima, junto do horário atual, e não dentro do calendário: o
  // formulário é o mesmo do funil, e nada pode ser acrescentado lá dentro.
  const { caiuNoutroDia } = diaQueAbre(opcoes, diaDaSessao);

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-10">
      <a
        href={`/convite/${token}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </a>

      <div className="card mb-4 p-6 sm:p-8">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
          <CalendarClock className="size-3.5" />
          Trocar de horário
        </p>

        <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-tight text-balance">
          {inscricao.lead.name.split(" ")[0]}, escolha o melhor dia
        </h1>

        {inscricao.meeting && (
          <p className="mt-2 text-sm text-muted">
            Hoje você está em{" "}
            <strong className="font-semibold text-foreground">
              {fmtDia.format(inscricao.meeting.startsAt)} às {hhmm(inscricao.meeting.startsAt)}
            </strong>
            . Escolher um horário abaixo troca o seu — o link continua o mesmo.
          </p>
        )}

        {caiuNoutroDia && !recusa && opcoes.length > 0 && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            Não há outro horário nesse dia — o calendário abre no mais próximo.
          </p>
        )}

        {recusa && <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-sm">{recusa}</p>}

        {!recusa && opcoes.length === 0 && (
          <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            Não há outro horário aberto no momento. Sua vaga atual continua garantida —
            volte mais tarde ou fale com quem te enviou o convite.
          </p>
        )}
      </div>

      {opcoes.length > 0 && (
        <CalendarioDeSessoes
          sessoes={opcoes}
          base={`/convite/${token}/remarcar`}
          marca={marca}
          diaPreferido={diaDaSessao}
          diaPedido={umSo(dia)}
          mesPedido={umSo(mes)}
          agora={agora}
          acao={remarcarSessao}
          camposOcultos={{ token }}
          aviso={<Aviso resultado={umSo(r)} />}
        />
      )}

      <p className="mt-6 text-center text-xs text-muted">Horários de Brasília · {marca}</p>
    </main>
  );
}

/**
 * O que deu errado na tentativa anterior.
 *
 * Vem pela URL porque a página não tem estado no cliente — e isso é de
 * propósito: sem JavaScript, não há estado onde guardar.
 */
function Aviso({ resultado }: { resultado?: string }) {
  const texto = {
    lotada: "Esta sessão encheu enquanto você escolhia. Os horários abaixo já estão atualizados.",
    indisponivel: "Aquele horário não está mais disponível. Escolha outro.",
    recusado: "Não foi possível trocar o horário deste convite.",
    invalido: "Faltou escolher um horário.",
    espere: "Muitas tentativas seguidas. Espere alguns instantes e tente de novo.",
  }[resultado ?? ""];

  if (!texto) return null;

  return (
    <p role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      {texto}
    </p>
  );
}
