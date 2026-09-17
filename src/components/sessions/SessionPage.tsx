import Link from "next/link";
import {
  ArrowLeft,
  CircleSlash,
  Clock,
  DoorOpen,
  ExternalLink,
  MessageSquare,
  Mic,
  Phone,
  ShoppingCart,
  Sparkles,
  UserCheck,
  Video,
} from "lucide-react";

import {
  errosVisiveis,
  lerBlocos,
  lerErros,
  lerObjecoes,
  lerScorecard,
  lerTextos,
  lerVocabulario,
  INSIGHTS_VISIVEIS,
  type Bloco,
} from "@/lib/analise";
import { AnotarSessao } from "@/components/sessions/AnotarSessao";
import { Gravacao } from "@/components/sessions/Gravacao";
import { tempoNaSala } from "@/components/sessions/SessionsView";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { TZ, hhmm } from "@/lib/dates";
import { ehGravador } from "@/lib/identidades";
import { linkWhatsapp } from "@/lib/mensagem";
import type { Space } from "@/lib/nav";
import {
  ehQualificado,
  minutoDaCall,
  naSalaEm,
  ordemDoRoster,
  saidaDoParticipante,
  situacaoDaSessao,
  taxaDaSessao,
} from "@/lib/presenca";
import type { AbaDaSessao, SessionDetail } from "@/lib/queries";
import { carimboDoTrecho, lerSegmentos, medirFalantes, provavelCondutor } from "@/lib/transcricao";

const STATUS = {
  SCHEDULED: { text: "Agendada", tone: "bg-sky-50 text-sky-700" },
  DONE: { text: "Realizada", tone: "bg-waz-90 text-waz-20" },
  NO_SHOW: { text: "Sem presença", tone: "bg-amber-50 text-amber-800" },
  CANCELED: { text: "Cancelada", tone: "bg-red-50 text-red-700" },
} as const;

const ABAS: { chave: AbaDaSessao; rotulo: string }[] = [
  { chave: "gravacao", rotulo: "Gravação" },
  { chave: "auditoria", rotulo: "Auditoria" },
  { chave: "sala", rotulo: "Chat da sala" },
  { chave: "anotacoes", rotulo: "Anotações" },
];

export function SessionPage({
  space,
  sessao,
  aba,
  now,
  minutosMinimos,
  gravacaoLigada,
  podeEscrever,
}: {
  space: Space;
  sessao: SessionDetail;
  aba: AbaDaSessao;
  now: Date;
  /// A regra vem do banco (`Config.presencaMinutos`), como na lista.
  minutosMinimos: number;
  /// Se existe bucket configurado. Decide se "não há gravação" significa
  /// "esta call não foi gravada" ou "a gravação ainda não foi ligada".
  gravacaoLigada: boolean;
  podeEscrever: boolean;
}) {
  const base = `/${space}/sessoes`;
  const situacao = situacaoDaSessao(sessao, now);
  const medida = situacao === "medida";
  const emAndamento = situacao === "emAndamento";

  const inscritos = sessao.attendees.length;
  const presentes = sessao.attendees.filter((a) => a.attended).length;
  const qualificados = sessao.attendees.filter(
    (a) => a.attended && ehQualificado(a.lead.score),
  ).length;

  const gravacao = sessao.gravacoes[0] ?? null;
  const transcricao = gravacao?.transcript ?? null;
  const analise = transcricao?.analise ?? null;

  // A duração MEDIDA, não a agendada: é ela que diz que a call de 45 minutos
  // durou 71 — e esse número é notícia para quem conduziu.
  const duracaoAgendada = Math.round((sessao.endsAt.getTime() - sessao.startsAt.getTime()) / 60_000);
  const duracaoMedida = gravacao?.duracaoSegundos
    ? Math.round(gravacao.duracaoSegundos / 60)
    : null;

  const status = STATUS[sessao.status];
  const ofertas = sessao.mensagens.filter((m) => m.tipo === "OFERTA");

  return (
    <>
      <header className="mb-6">
        <Link href={base} className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Sessões
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
              {sessao.template?.name ?? sessao.title}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="text-foreground">
                {sessao.startsAt.toLocaleDateString("pt-BR", {
                  timeZone: TZ,
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </span>
              <span className="font-mono">{hhmm(sessao.startsAt)}</span>
              <span title={duracaoMedida ? `${duracaoAgendada} min agendados` : undefined}>
                {duracaoMedida ? `${duracaoMedida} min` : `${duracaoAgendada} min`}
                {duracaoMedida && duracaoMedida !== duracaoAgendada && (
                  <span className="text-[11px]"> · marcada para {duracaoAgendada}</span>
                )}
              </span>
              <span>Closer: {sessao.owner.name}</span>
            </p>
          </div>
          <span className={`chip ${status.tone}`}>
            {emAndamento ? "Em andamento" : status.text}
          </span>
        </div>
      </header>

      <Esteira gravacao={gravacao} temTranscricao={!!transcricao} temAnalise={!!analise} ligada={gravacaoLigada} />

      {/* Resumo ANTES da auditoria, de propósito: resumo é o que aconteceu,
          auditoria é como eu fui. Invertido, a página vira avaliação de
          desempenho e o closer para de abrir. */}
      {analise ? (
        <section className="card mt-5 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-muted">
            <Sparkles className="size-3.5" />
            O que aconteceu nesta call
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed">{analise.resumo}</p>
          {lerTextos(analise.insights).length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              {/* `lerTextos`, e não um `as string[]`: o cast é uma promessa sem
                  conferência, e se o jsonb trouxer objetos o React lança
                  "Objects are not valid as a React child" e derruba a PÁGINA
                  INTEIRA — presença e roster junto, que não têm nada a ver com
                  a análise. O resto desta tela já lia jsonb assim; este ponto
                  tinha escapado. */}
              {lerTextos(analise.insights).slice(0, INSIGHTS_VISIVEIS).map((insight, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-waz-40" />
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero label="Inscritos" value={String(inscritos)} hint={`${sessao.capacity ?? 0} vagas`} />
        <Numero label="Presentes" value={medida ? `${presentes}/${inscritos}` : "—"} />
        <Numero
          label="Taxa de presença"
          value={medida ? `${taxaDaSessao(inscritos, presentes)}%` : "—"}
          hint={medida ? `≥ ${minutosMinimos} min na sala` : undefined}
        />
        <Numero label="Leads A/B" value={medida ? String(qualificados) : "—"} hint="qualificados presentes" />
      </div>

      {ofertas.length > 0 && (
        <section className="card mt-5 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-muted">
            <ShoppingCart className="size-3.5" />
            Oferta
          </h2>
          <ul className="mt-2.5 flex flex-col gap-2">
            {ofertas.map((oferta) => (
              <li key={oferta.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium">{oferta.texto}</span>
                <span className="text-xs text-muted">
                  enviada aos {minutoDaCall(oferta.createdAt, sessao.startsAt)} min ·{" "}
                  {/* Fato comercial, não log de chat: o mesmo link no mesmo
                      minuto conta histórias opostas com catorze pessoas na
                      sala ou com três que sobraram. */}
                  {naSalaEm(sessao.presences, oferta.createdAt)} na sala
                </span>
                {oferta.url && (
                  <a
                    href={oferta.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-xs text-muted underline hover:text-foreground"
                  >
                    abrir link
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Roster
        sessao={sessao}
        medida={medida}
        emAndamento={emAndamento}
        minutosMinimos={minutosMinimos}
        space={space}
        doDono={sessao.doDono}
      />

      <nav className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
        {ABAS.map(({ chave, rotulo }) => (
          <Link
            key={chave}
            href={`${base}/${sessao.id}?aba=${chave}`}
            aria-current={aba === chave ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm transition ${
              aba === chave
                ? "border-foreground font-semibold"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      <div className="py-5">
        {aba === "gravacao" && <AbaGravacao gravacao={gravacao} ligada={gravacaoLigada} />}
        {aba === "auditoria" && <AbaAuditoria temTranscricao={!!transcricao} analise={analise} />}
        {aba === "sala" && <AbaSala mensagens={sessao.mensagens} inicio={sessao.startsAt} />}
        {aba === "anotacoes" && (
          <AbaAnotacoes notas={sessao.notes} meetingId={sessao.id} podeEscrever={podeEscrever} />
        )}
      </div>
    </>
  );
}

// ── A esteira ────────────────────────────────────────────────────────────────

/**
 * Gravada ✓ · Transcrita ✓ · Analisada ⏳
 *
 * A primeira pergunta de quem acabou de dar uma call não é "qual foi minha
 * taxa" — é *ficou gravado?*. Uma linha responde isso antes de qualquer número.
 * Falha aparece como falha: um passo que não aconteceu e um passo que quebrou
 * são coisas diferentes, e esconder a segunda faz o time descobrir uma semana
 * depois que nada foi gravado.
 */
function Esteira({
  gravacao,
  temTranscricao,
  temAnalise,
  ligada,
}: {
  gravacao: SessionDetail["gravacoes"][number] | null;
  temTranscricao: boolean;
  temAnalise: boolean;
  ligada: boolean;
}) {
  if (!ligada) {
    return (
      <p className="flex items-center gap-2.5 rounded-xl border border-dashed border-line px-3.5 py-3 text-xs text-muted">
        <Video className="size-4 shrink-0" />
        A gravação ainda não está ligada nesta instalação — falta o bucket. As
        sessões daqui para a frente passam a ser gravadas assim que ele existir;
        as que já aconteceram não voltam.
      </p>
    );
  }

  const passo = (
    pronto: boolean,
    andando: boolean,
    falhou: boolean,
    rotulo: string,
    icone: React.ElementType,
  ) => ({ pronto, andando, falhou, rotulo, icone });

  const gravou = gravacao?.status === "COMPLETA" || gravacao?.status === "APAGADA";
  const gravacaoFalhou = gravacao?.status === "FALHOU" || gravacao?.status === "ABORTADA";

  const passos = [
    passo(gravou, gravacao != null && !gravou && !gravacaoFalhou, gravacaoFalhou, "Gravada", Video),
    passo(temTranscricao, gravou && !temTranscricao, false, "Transcrita", Mic),
    passo(temAnalise, temTranscricao && !temAnalise, false, "Analisada", Sparkles),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
      {passos.map(({ pronto, andando, falhou, rotulo, icone: Icone }) => (
        <span
          key={rotulo}
          className={`flex items-center gap-1.5 text-xs ${
            falhou ? "text-red-700" : pronto ? "text-foreground" : "text-muted"
          }`}
        >
          <Icone className="size-3.5" />
          {rotulo}
          <span aria-hidden>{falhou ? "✗" : pronto ? "✓" : andando ? "⏳" : "—"}</span>
          <span className="sr-only">
            {falhou ? "falhou" : pronto ? "pronto" : andando ? "em andamento" : "não começou"}
          </span>
        </span>
      ))}
      {gravacao?.erro && <span className="text-xs text-amber-700">{gravacao.erro}</span>}
    </div>
  );
}

// ── Quem estava, e o que fazer com cada um ───────────────────────────────────

function Roster({
  sessao,
  medida,
  emAndamento,
  minutosMinimos,
  space,
  doDono,
}: {
  sessao: SessionDetail;
  medida: boolean;
  emAndamento: boolean;
  minutosMinimos: number;
  space: Space;
  /// Quem conduziu a sessão, ou um admin. Só para eles a linha traz os botões
  /// de contato: a call é material do time, a carteira não é.
  doDono: boolean;
}) {
  const ordenados = ordemDoRoster(sessao.attendees);
  // Quem entrou pelo link avulso não é inscrito de ninguém — e esteve na call.
  // Some-los da tela faria a sala de quinze parecer de oito.
  const inscritos = new Set(sessao.attendees.map((a) => a.leadId));
  const avulsos = sessao.presences.filter(
    (p) =>
      !p.identity.startsWith("u_") &&
      // `consolidar` já não cria presença para o gravador — mas linhas de
      // antes dessa correção continuam no banco, e sem esta peneira o `EG_…`
      // apareceria na tela como "mais 1 pessoa entrou pelo link da sala".
      !ehGravador(p.identity) &&
      !inscritos.has(p.identity.slice(2)),
  );

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
        Quem estava
        <span className="text-xs font-normal text-muted">
          {sessao.attendees.length} {sessao.attendees.length === 1 ? "inscrito" : "inscritos"} ·
          quem vale a ligação primeiro
        </span>
      </h2>

      {ordenados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-12 text-center text-xs text-muted">
          Ninguém inscrito nesta sessão. As inscrições chegam pelo funil do Type.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordenados.map((p) => {
            const saida = saidaDoParticipante(p, sessao.startsAt, sessao.endsAt);
            const whatsapp = linkWhatsapp(p.lead.phone);

            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-3.5 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.lead.name}</span>
                    <ScoreBadge score={p.lead.score} />
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {p.lead.company ?? p.lead.email ?? "Sem empresa"}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{tempoNaSala(p.totalSeconds)}</span>
                  <span className="block text-[11px] text-muted">
                    {/* O sinal que não existia: "saiu aos 12 min" e "ficou até
                        o fim" são dois leads completamente diferentes com o
                        mesmo chip de Presente. */}
                    {saida.tipo === "saiu_antes"
                      ? `saiu aos ${saida.minuto} min`
                      : saida.tipo === "ficou_ate_o_fim"
                        ? "ficou até o fim"
                        : saida.tipo === "ainda_na_sala"
                          ? "está na sala"
                          : emAndamento
                            ? "aguardando a sala"
                            : "nunca entrou"}
                    {p.joinCount > 1 && ` · ${p.joinCount} entradas`}
                  </span>
                </span>

                {/* Largura fixa só a partir de `sm`: ela alinha os chips numa
                    coluna no desktop e, no celular, é o que empurra a linha
                    para fora da tela. */}
                <span className="shrink-0 text-right sm:w-[104px]">
                  {p.attended ? (
                    <span className="chip bg-waz-90 text-waz-20">
                      <UserCheck className="size-3.5" />
                      Presente
                    </span>
                  ) : medida ? (
                    <span className="chip bg-stone-100 text-stone-600">
                      <CircleSlash className="size-3.5" />
                      Ausente
                    </span>
                  ) : (
                    <span className="chip bg-surface-2 text-muted">Aguardando</span>
                  )}
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  {doDono && whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir conversa no WhatsApp"
                      className="btn-ghost px-2 py-1.5 text-xs"
                    >
                      <MessageSquare className="size-3.5" />
                    </a>
                  )}
                  {doDono && p.lead.phone && (
                    <a href={`tel:${p.lead.phone}`} title="Ligar" className="btn-ghost px-2 py-1.5 text-xs">
                      <Phone className="size-3.5" />
                    </a>
                  )}
                  {/* `?lead=` abre o drawer DENTRO desta página — e
                      `getLeadDetail` continua no escopo do dono. A assimetria
                      certa sai de graça: a gravação é do time, o lead continua
                      sendo de quem é. */}
                  <Link
                    href={`/${space}/leads?lead=${p.lead.id}`}
                    title="Abrir lead"
                    className="btn-ghost px-2 py-1.5 text-xs"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {avulsos.length > 0 && (
        <p className="mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-xs text-muted">
          <DoorOpen className="mt-0.5 size-4 shrink-0" />
          <span>
            Mais {avulsos.length}{" "}
            {avulsos.length === 1 ? "pessoa entrou" : "pessoas entraram"} pelo link
            da sala, sem inscrição: {avulsos.map((p) => p.name ?? "sem nome").join(", ")}. Elas
            contam na sala e não contam como inscrito de ninguém.
          </span>
        </p>
      )}

      <p className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-muted">
        <Clock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          O tempo é medido pela própria call. O chip <em>Presente</em> é consequência
          dele — {minutosMinimos} minutos ou mais —, não de uma marcação manual.
        </span>
      </p>
    </section>
  );
}

// ── As abas ──────────────────────────────────────────────────────────────────

function AbaGravacao({
  gravacao,
  ligada,
}: {
  gravacao: SessionDetail["gravacoes"][number] | null;
  ligada: boolean;
}) {
  const segmentos = lerSegmentos(gravacao?.transcript?.segmentos);
  if (!gravacao) {
    return (
      <Vazio>
        {ligada
          ? "Nenhuma gravação chegou para esta sessão."
          : "A gravação ainda não foi ligada nesta instalação."}
      </Vazio>
    );
  }
  if (gravacao.apagadaEm) {
    return (
      <Vazio>
        O vídeo foi apagado pela retenção em{" "}
        {gravacao.apagadaEm.toLocaleDateString("pt-BR", { timeZone: TZ })}. A transcrição
        e a análise continuam aqui.
      </Vazio>
    );
  }
  if (gravacao.status !== "COMPLETA") {
    return (
      <Vazio>
        {gravacao.status === "FALHOU" || gravacao.status === "ABORTADA"
          ? `A gravação não ficou pronta.${gravacao.erro ? ` ${gravacao.erro}` : ""}`
          : "A gravação ainda está sendo processada pelo servidor de vídeo."}
      </Vazio>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Gravacao
        recordingId={gravacao.id}
        duracaoSegundos={gravacao.duracaoSegundos}
        segmentos={segmentos}
        condutor={provavelCondutor(medirFalantes(segmentos))}
      />
      <p className="text-[11px] text-muted">
        {gravacao.duracaoSegundos ? `${Math.round(gravacao.duracaoSegundos / 60)} min` : "duração desconhecida"}
        {gravacao.bytes ? ` · ${(gravacao.bytes / 1024 ** 3).toFixed(2)} GB` : ""}
      </p>
    </div>
  );
}

/**
 * A auditoria, sem virar paredão.
 *
 * O erro a não repetir é de renderização, não de dados: a referência produz uma
 * análise enorme e a despeja inteira na tela. Uma tela com onze erros faz o
 * closer parar de abrir a página — e uma auditoria que ninguém abre não corrige
 * ninguém.
 *
 * Então: veredito em uma linha, trilho de blocos, no máximo três erros, chips de
 * vocabulário, e o scorecard atrás de um `<details>`. O closer lê o veredito e
 * os três erros; o gestor abre o resto.
 */
function AbaAuditoria({
  temTranscricao,
  analise,
}: {
  temTranscricao: boolean;
  analise: NonNullable<SessionDetail["gravacoes"][number]["transcript"]>["analise"];
}) {
  if (!analise) {
    return (
      <Vazio>
        {temTranscricao
          ? "A transcrição existe, mas a auditoria ainda não rodou — falta a rubrica ativa ou a chave da análise."
          : "Sem transcrição, não há o que auditar."}
      </Vazio>
    );
  }

  const blocos = lerBlocos(analise.blocos);
  const erros = errosVisiveis(lerErros(analise.erros));
  const vocabulario = lerVocabulario(analise.vocabulario);
  const objecoes = lerObjecoes(analise.objecoes);
  const scorecard = lerScorecard(analise.scorecard);
  const passos = lerTextos(analise.proximosPassos);

  const proibidas = vocabulario.filter((t) => t.tipo === "PROIBIDO" && t.ocorrencias > 0);
  const recomendadas = vocabulario.filter((t) => t.tipo === "RECOMENDADO" && t.ocorrencias > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* O veredito em UMA linha. Quem abre esta aba quer saber se foi bem
          antes de ler por quê. */}
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`chip ${TOM_DO_VEREDICTO[analise.veredicto ?? ""] ?? "bg-surface-2 text-muted"}`}>
          {ROTULO_DO_VEREDICTO[analise.veredicto ?? ""] ?? "Sem veredito"}
        </span>
        {analise.aderenciaPct != null && (
          <span className="text-sm font-semibold tabular-nums">{analise.aderenciaPct}% de aderência</span>
        )}
        {analise.blocosTotal ? (
          <span className="text-xs text-muted tabular-nums">
            {analise.blocosOk ?? 0}/{analise.blocosTotal} blocos
          </span>
        ) : null}
        {analise.engajamento != null && (
          <span className="text-xs text-muted">engajamento {analise.engajamento}/10</span>
        )}
        {analise.errosCriticos > 0 && (
          <span className="text-xs text-red-700">
            {analise.errosCriticos} {analise.errosCriticos === 1 ? "erro crítico" : "erros críticos"}
          </span>
        )}
      </p>

      {blocos.length > 0 && <TrilhoDeBlocos blocos={blocos} />}

      {erros.length > 0 && (
        <section>
          <h3 className="mb-2.5 flex items-baseline gap-2 text-sm font-semibold">
            O que corrigir
            <span className="text-xs font-normal text-muted">
              {/* A regra que vale mais que o desenho: sem citação literal da
                  transcrição, o apontamento NÃO é mostrado. O que está sendo
                  dito é que uma pessoa conduziu mal uma conversa, e isso é lido
                  pelo gestor dela. */}
              cada um com a frase que o sustenta
            </span>
          </h3>
          <ul className="flex flex-col gap-2.5">
            {erros.map((erro, i) => (
              <li key={i} className="card p-4">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className={`chip ${TOM_DA_GRAVIDADE[erro.gravidade]}`}>
                    {ROTULO_DA_GRAVIDADE[erro.gravidade]}
                  </span>
                  {erro.bloco && <span className="text-xs text-muted">{erro.bloco}</span>}
                  {erro.emSegundos != null && (
                    <span className="text-[11px] text-muted tabular-nums">
                      {carimboDoTrecho(erro.emSegundos)}
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm">{erro.oQueAconteceu}</p>
                <blockquote className="mt-2.5 border-l-2 border-line pl-3 text-sm text-muted italic">
                  “{erro.citacao}”
                </blockquote>
                {erro.oQuePlaybookManda && (
                  <p className="mt-2.5 text-sm">
                    <span className="text-xs font-semibold text-muted">O playbook manda: </span>
                    {erro.oQuePlaybookManda}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(proibidas.length > 0 || recomendadas.length > 0) && (
        <section>
          <h3 className="mb-2.5 text-sm font-semibold">Vocabulário</h3>
          <p className="flex flex-wrap gap-1.5">
            {proibidas.map((t) => (
              <span key={`p-${t.termo}`} className="chip bg-red-50 text-red-700">
                {t.termo}
                <span className="tabular-nums">{t.ocorrencias}</span>
              </span>
            ))}
            {recomendadas.map((t) => (
              <span key={`r-${t.termo}`} className="chip bg-waz-90 text-waz-20">
                {t.termo}
                <span className="tabular-nums">{t.ocorrencias}</span>
              </span>
            ))}
          </p>
        </section>
      )}

      {objecoes.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-sm font-semibold">Objeções</h3>
          <ul className="flex flex-col gap-2">
            {objecoes.map((o, i) => (
              <li key={i} className="rounded-xl border border-line bg-surface px-3.5 py-3">
                <p className="flex items-baseline gap-2 text-sm font-medium">
                  {o.objecao}
                  {o.resolvida !== null && (
                    <span
                      className={`chip ${o.resolvida ? "bg-waz-90 text-waz-20" : "bg-amber-50 text-amber-800"}`}
                    >
                      {o.resolvida ? "tratada" : "ficou de pé"}
                    </span>
                  )}
                </p>
                {o.comoFoiTratada && <p className="mt-1 text-sm text-muted">{o.comoFoiTratada}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {passos.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-sm font-semibold">Próximos passos</h3>
          <ul className="flex flex-col gap-2">
            {passos.map((passo, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-waz-40" />
                {passo}
              </li>
            ))}
          </ul>
        </section>
      )}

      {scorecard.length > 0 && (
        // Atrás do `<details>` de propósito: o closer lê veredito e os três
        // erros; o gestor é quem abre o scorecard inteiro.
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Scorecard completo
            <span className="ml-2 text-xs font-normal text-muted">{scorecard.length} critérios</span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            {scorecard.map((item, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="w-10 shrink-0 font-semibold tabular-nums">{item.nota}/10</span>
                <span className="min-w-0 flex-1">
                  {item.criterio}
                  {item.justificativa && (
                    <span className="block text-xs text-muted">{item.justificativa}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[11px] text-muted">
        Gerada por {analise.modelo ?? "modelo desconhecido"} em{" "}
        {analise.createdAt.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })}
        {analise.redigidaEm && " · as citações foram removidas pela retenção"}. É uma
        leitura automática da transcrição, não um julgamento final.
      </p>
    </div>
  );
}

const TOM_DO_VEREDICTO: Record<string, string> = {
  EXCELENTE: "bg-waz-90 text-waz-20",
  BOA: "bg-waz-90 text-waz-20",
  MEDIANA: "bg-amber-50 text-amber-800",
  FRACA: "bg-red-50 text-red-700",
};
const ROTULO_DO_VEREDICTO: Record<string, string> = {
  EXCELENTE: "Excelente",
  BOA: "Boa",
  MEDIANA: "Mediana",
  FRACA: "Fraca",
};
const TOM_DA_GRAVIDADE: Record<string, string> = {
  CRITICO: "bg-red-50 text-red-700",
  MEDIO: "bg-amber-50 text-amber-800",
  LEVE: "bg-surface-2 text-muted",
};
const ROTULO_DA_GRAVIDADE: Record<string, string> = {
  CRITICO: "Crítico",
  MEDIO: "Médio",
  LEVE: "Leve",
};

/**
 * Os blocos do playbook, em barra.
 *
 * Largura proporcional aos minutos, cor pelo status — mas a cor NUNCA é o único
 * sinal: o nome e o status aparecem na legenda abaixo. Um trilho onde só a cor
 * informa não é lido por quem não distingue vermelho de verde, e este time tem
 * gente assim como qualquer outro.
 */
function TrilhoDeBlocos({ blocos }: { blocos: Bloco[] }) {
  const total = blocos.reduce((soma, b) => soma + (b.minutos ?? 1), 0) || 1;
  const cor: Record<string, string> = {
    OK: "bg-waz-40",
    PARCIAL: "bg-amber-400",
    AUSENTE: "bg-stone-300",
  };

  return (
    <section>
      <h3 className="mb-2.5 text-sm font-semibold">Como a call andou</h3>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {blocos.map((b, i) => (
          <span
            key={i}
            title={`${b.nome} · ${b.status.toLowerCase()}${b.minutos ? ` · ${b.minutos} min` : ""}`}
            className={`h-full ${cor[b.status] ?? "bg-surface-2"}`}
            style={{ width: `${((b.minutos ?? 1) / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {blocos.map((b, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`size-2 shrink-0 rounded-full ${cor[b.status] ?? "bg-surface-2"}`} />
            {b.nome}
            {b.minutos ? <span className="tabular-nums">{b.minutos} min</span> : null}
            {b.status !== "OK" && <span className="font-medium">{b.status.toLowerCase()}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AbaSala({
  mensagens,
  inicio,
}: {
  mensagens: SessionDetail["mensagens"];
  inicio: Date;
}) {
  if (mensagens.length === 0) {
    return <Vazio>Ninguém escreveu no chat desta sessão.</Vazio>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {mensagens.map((m) => (
        <li key={m.id} className="flex gap-3 text-sm">
          <span className="w-16 shrink-0 text-right text-[11px] text-muted tabular-nums">
            {minutoDaCall(m.createdAt, inicio)} min
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-xs font-semibold">{m.autor}</span>
            <span className="mt-0.5 block break-words whitespace-pre-wrap">
              {m.tipo === "OFERTA" && <ShoppingCart className="mr-1.5 inline size-3.5" />}
              {m.texto}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function AbaAnotacoes({
  notas,
  meetingId,
  podeEscrever,
}: {
  notas: SessionDetail["notes"];
  meetingId: string;
  podeEscrever: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {podeEscrever && <AnotarSessao meetingId={meetingId} />}
      {notas.length === 0 ? (
        <Vazio>
          Nada anotado sobre esta sessão ainda. Aqui cabe o que não é de nenhum lead
          em particular — a objeção que apareceu três vezes, o slide que travou.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {notas.map((n) => (
            <li key={n.id} className="card p-4">
              <p className="text-sm break-words whitespace-pre-wrap">{n.content}</p>
              <p className="mt-2 text-[11px] text-muted">
                {n.author.name} ·{" "}
                {n.createdAt.toLocaleString("pt-BR", {
                  timeZone: TZ,
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-xs text-muted">
      {children}
    </p>
  );
}

function Numero({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
      <p className="text-[11px] font-semibold text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
