import type { ReactNode } from "react";

import { chaveDoDia, TZ } from "@/lib/dates";

/**
 * O calendário de sessões do lead.
 *
 * É o MESMO formulário do funil (`Type/src/components/funnel/SessoesDisponiveis`),
 * copiado classe por classe e palavra por palavra de propósito: quem escolheu um
 * horário lá e vem trocá-lo aqui tem de encontrar exatamente a mesma tela. A
 * remarcação mostrava uma lista corrida de todos os dias, e a pessoa precisava se
 * localizar de novo bem no momento em que já estava desistindo do horário.
 *
 * Só o comportamento difere, e por baixo: ali a escolha agenda, aqui ela
 * remarca. Se um dia a tela do funil mudar, esta precisa mudar junto.
 *
 * **Sem uma linha de JavaScript**, porque a página de remarcar não tem: cada dia
 * é um link (`?dia=`), cada mês é um link (`?mes=`), cada horário é um `<form>`.
 * Ela funciona no navegador embutido do Instagram, num aparelho velho, numa rede
 * ruim — que é onde este lead costuma estar.
 */
export type SessaoNoCalendario = {
  id: string;
  inicioEm: Date;
  vagas: number;
  duracaoMin?: number;
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});
const fmtMes = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, month: "long" });
const fmtAno = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, year: "numeric" });
const fmtDiaMes = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "numeric",
  month: "long",
});
const fmtSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" });
const fmtDiaCompleto = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Iniciais dos dias da semana, do domingo ao sábado — a ordem que a grade desenha. */
const INICIAIS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Sobe só a primeira letra — em português o resto fica minúsculo. */
function inicialMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Meio-dia UTC do dia informado.
 *
 * Toda conta de calendário passa por aqui de propósito. São Paulo é UTC-3, então
 * meia-noite UTC já é o dia anterior lá; meio-dia fica longe das duas bordas e
 * sobrevive inclusive a um horário de verão que volte.
 */
function aoMeioDia(chave: string): Date {
  return new Date(`${chave}T12:00:00Z`);
}

/** "2026-09-16" -> "2026-09" */
function mesDe(chave: string): string {
  return chave.slice(0, 7);
}

function mesVizinho(mes: string, passo: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + passo, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * As células do mês: nulos para alinhar a primeira semana, depois cada dia.
 * `getUTCDay` num instante de meio-dia devolve o dia da semana civil correto.
 */
function gradeDoMes(mes: string): (string | null)[] {
  const [ano, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1, 12));
  const diasNoMes = new Date(Date.UTC(ano, m, 0, 12)).getUTCDate();
  const celulas: (string | null)[] = Array(primeiro.getUTCDay()).fill(null);
  for (let d = 1; d <= diasNoMes; d++) {
    celulas.push(`${mes}-${String(d).padStart(2, "0")}`);
  }
  return celulas;
}

/** "Setembro 2026" */
function rotuloDoMes(mes: string): string {
  const d = aoMeioDia(`${mes}-01`);
  return `${inicialMaiuscula(fmtMes.format(d))} ${fmtAno.format(d)}`;
}

/** "16 de setembro, quarta-feira" — dia primeiro, como se fala. */
function rotuloDoDia(chave: string): string {
  const d = aoMeioDia(chave);
  return `${fmtDiaMes.format(d)}, ${fmtSemana.format(d)}`;
}

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_MES = /^\d{4}-\d{2}$/;

/** O dia que o calendário abre, e se ele é o dia da pessoa. */
export function diaQueAbre(
  sessoes: readonly { inicioEm: Date }[],
  diaPreferido?: string,
): { diaAtivo: string | null; caiuNoutroDia: boolean } {
  const comVaga = [...new Set(sessoes.map((s) => chaveDoDia(s.inicioEm)))].sort();
  if (!comVaga.length) return { diaAtivo: null, caiuNoutroDia: false };
  const temOPreferido = Boolean(diaPreferido && comVaga.includes(diaPreferido));
  return {
    diaAtivo: temOPreferido ? diaPreferido! : comVaga[0],
    caiuNoutroDia: Boolean(diaPreferido) && !temOPreferido,
  };
}

export function CalendarioDeSessoes({
  sessoes,
  base,
  marca,
  diaPreferido,
  diaPedido,
  mesPedido,
  agora,
  acao,
  camposOcultos,
  aviso,
}: {
  sessoes: readonly SessaoNoCalendario[];
  /// Endereço desta própria página: é para onde os links de dia e mês voltam.
  base: string;
  marca: string;
  /// O dia em que a pessoa JÁ está — é nele que o calendário abre.
  diaPreferido?: string;
  diaPedido?: string;
  mesPedido?: string;
  agora: Date;
  acao: (dadosDoFormulario: FormData) => Promise<void>;
  /// O que cada `<form>` de horário leva junto do `meetingId` — o token, aqui.
  camposOcultos: Record<string, string>;
  aviso?: ReactNode;
}) {
  // Sessões agrupadas pelo dia civil de São Paulo em que acontecem.
  const dias = new Map<string, SessaoNoCalendario[]>();
  for (const s of sessoes) {
    if (Number.isNaN(s.inicioEm.getTime())) continue;
    const chave = chaveDoDia(s.inicioEm);
    dias.set(chave, [...(dias.get(chave) ?? []), s]);
  }

  const comVaga = [...dias.keys()].sort();
  if (comVaga.length === 0) return null;

  // O dia pedido pela URL só vale se ainda tiver vaga — a pessoa pode ter
  // voltado para um link velho, ou a última vaga pode ter sido tomada.
  const daUrl = diaPedido && FORMATO_DIA.test(diaPedido) && dias.has(diaPedido) ? diaPedido : null;

  // Sem escolha na URL, o calendário abre NO DIA DA PESSOA. Abria no primeiro
  // dia livre da agenda, e isso errava o caso mais comum da remarcação: quem
  // não pode às 11h quase sempre quer às 14h do MESMO dia.
  const diaValido = daUrl ?? (diaPreferido && dias.has(diaPreferido) ? diaPreferido : null);

  const mesAtivo =
    mesPedido && FORMATO_MES.test(mesPedido) ? mesPedido : mesDe(diaValido ?? comVaga[0]);

  // Trocar de mês sem escolher dia cai no primeiro dia com vaga daquele mês.
  // Sem isto, a lista de horários continuaria mostrando o mês anterior, e a
  // pessoa veria a grade de outubro com os horários de setembro embaixo.
  const diaAtivo =
    diaValido && mesDe(diaValido) === mesAtivo
      ? diaValido
      : (comVaga.find((d) => mesDe(d) === mesAtivo) ?? null);

  const horarios = diaAtivo ? (dias.get(diaAtivo) ?? []) : [];
  const grade = gradeDoMes(mesAtivo);

  // Navegar para antes do primeiro mês com vaga, ou depois do último, só levaria
  // a um calendário vazio — então essa navegação simplesmente não existe.
  const temMesAnterior = comVaga.some((d) => mesDe(d) < mesAtivo);
  const temProximoMes = comVaga.some((d) => mesDe(d) > mesAtivo);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 bg-waz-40 px-4 py-3 text-white">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Agenda {marca}</p>
          <p className="truncate text-xs text-white/80">Para sua reunião gratuita</p>
        </div>
      </div>

      {aviso}

      <div className="flex justify-center px-4 pt-4">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
          Hoje é {fmtSemana.format(agora)}, {fmtHora.format(agora)}
        </span>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <SetaMes
          direcao="anterior"
          href={temMesAnterior ? `${base}?mes=${mesVizinho(mesAtivo, -1)}` : null}
        />
        <p className="text-[15px] font-semibold text-slate-900">{rotuloDoMes(mesAtivo)}</p>
        <SetaMes
          direcao="proximo"
          href={temProximoMes ? `${base}?mes=${mesVizinho(mesAtivo, 1)}` : null}
        />
      </div>

      <div className="px-4">
        <div className="rounded-2xl border border-slate-200 px-2 py-3">
          <div className="grid grid-cols-7">
            {INICIAIS.map((inicial, i) => (
              <span
                key={i}
                aria-hidden
                className="py-1 text-center text-[11px] font-medium text-slate-400"
              >
                {inicial}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grade.map((chave, i) => {
              if (!chave) return <span key={`vazio-${i}`} />;
              const numero = Number(chave.slice(-2));

              // Dia sem turma aberta continua visível, apagado: o calendário
              // precisa mostrar o mês inteiro para a pessoa se localizar.
              if (!dias.has(chave)) {
                return (
                  <span
                    key={chave}
                    className="flex h-11 items-center justify-center text-sm text-slate-300"
                  >
                    {numero}
                  </span>
                );
              }

              const ativo = chave === diaAtivo;
              return (
                <a
                  key={chave}
                  href={`${base}?dia=${chave}`}
                  aria-current={ativo ? "date" : undefined}
                  aria-label={fmtDiaCompleto.format(aoMeioDia(chave))}
                  className="flex h-11 items-center justify-center"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition ${
                      ativo ? "bg-waz-40 text-white shadow-sm" : "text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {numero}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {diaAtivo ? (
          <>
            <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm text-slate-600">Horários para {rotuloDoDia(diaAtivo)}</p>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                Horário de Brasília
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {horarios.map((s) => {
                const ultimasVagas = s.vagas <= 3;
                return (
                  // Um `<form>` por horário: cada botão é um envio completo,
                  // então a tela funciona sem nenhum JavaScript.
                  <form key={s.id} action={acao}>
                    {Object.entries(camposOcultos).map(([nome, valor]) => (
                      <input key={nome} type="hidden" name={nome} value={valor} />
                    ))}
                    <input type="hidden" name="meetingId" value={s.id} />
                    {/* O dia que estava na tela. Se a sessão encher no meio do
                        caminho, a pessoa volta para o dia que escolheu — não
                        para o primeiro da agenda, procurando onde estava. */}
                    <input type="hidden" name="dia" value={diaAtivo} />
                    <button
                      type="submit"
                      className="flex min-h-12 w-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-1 py-2 text-slate-900 shadow-sm transition hover:border-waz-50 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60"
                    >
                      <span className="text-[15px] font-semibold">{fmtHora.format(s.inicioEm)}</span>
                      {/* A escassez só aparece quando é verdade: repetir "20
                          vagas" em cada pastilha vira ruído e não informa nada. */}
                      {ultimasVagas && (
                        <span className="text-[11px] text-amber-600">
                          {s.vagas === 1 ? "última vaga" : `${s.vagas} vagas`}
                        </span>
                      )}
                    </button>
                  </form>
                );
              })}
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">
              Toque em um horário para agendar · {horarios[0]?.duracaoMin ?? 45} minutos ao vivo
            </p>
          </>
        ) : (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-500">
            Nenhum horário aberto neste mês. Use as setas para ver os outros.
          </p>
        )}
      </div>
    </div>
  );
}

/** Seta de mês: link quando há para onde ir, botão apagado quando não há. */
function SetaMes({ direcao, href }: { direcao: "anterior" | "proximo"; href: string | null }) {
  const classe =
    "flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200";
  const icone = (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direcao === "anterior" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );

  if (!href) {
    return (
      <span aria-hidden className={`${classe} opacity-30`}>
        {icone}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-label={direcao === "anterior" ? "Mês anterior" : "Próximo mês"}
      className={classe}
    >
      {icone}
    </a>
  );
}
