import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, CalendarClock } from "lucide-react";

import { remarcarSessao } from "@/app/convite/[token]/remarcar/acoes";
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
 * Tudo em `<form>`, sem estado no cliente: é a tela de um lead num celular
 * qualquer, e ela tem de funcionar mesmo que nenhum JavaScript carregue.
 */
export const dynamic = "force-dynamic";

const fmtDia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function RemarcarPage(props: PageProps<"/convite/[token]/remarcar">) {
  const { token } = await props.params;
  const { r } = await props.searchParams;
  const resultado = Array.isArray(r) ? r[0] : r;

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

  const marca = env("NEXT_PUBLIC_BRAND_NAME") ?? "Squad.com";
  const recusa = motivoParaNaoRemarcar(inscricao);
  const opcoes = recusa ? [] : alternativas(await sessoesComVaga(), inscricao);

  // Agrupa por dia civil de São Paulo: uma lista corrida de 150 horários é
  // ilegível, e a pessoa pensa em "quinta à tarde", não no horário 87.
  const porDia = new Map<string, typeof opcoes>();
  for (const s of opcoes) {
    const chave = chaveDoDia(s.inicioEm);
    porDia.set(chave, [...(porDia.get(chave) ?? []), s]);
  }

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-10">
      <a
        href={`/convite/${token}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </a>

      <div className="card p-6 sm:p-8">
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

        <Aviso resultado={resultado} />

        {recusa ? (
          <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-sm">{recusa}</p>
        ) : porDia.size === 0 ? (
          <p className="mt-6 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            Não há outro horário aberto no momento. Sua vaga atual continua garantida —
            volte mais tarde ou fale com quem te enviou o convite.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {[...porDia.entries()].map(([dia, sessoes]) => (
              <section key={dia}>
                <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                  {fmtDia.format(sessoes[0].inicioEm)}
                </h2>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sessoes.map((s) => (
                    // Um `<form>` por horário: cada botão é um envio completo,
                    // então a tela funciona sem nenhum JavaScript.
                    <form key={s.id} action={remarcarSessao}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="meetingId" value={s.id} />
                      <button
                        type="submit"
                        className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-center transition hover:border-foreground hover:bg-surface-2"
                      >
                        <span className="block text-base font-semibold">{hhmm(s.inicioEm)}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {s.vagas === 1 ? "última vaga" : `${s.vagas} vagas`}
                        </span>
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="mt-7 text-center text-xs text-muted">
          Horários de Brasília · {marca}
        </p>
      </div>
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
    <p
      role="alert"
      className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {texto}
    </p>
  );
}
