import Link from "next/link";
import { AlertTriangle, CalendarRange, CheckCircle2, CircleDashed, Radio } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { diaMes, hhmm, rotuloDeDias, diasEntre } from "@/lib/dates";

type Saude = {
  ultimoEvento: Date | null;
  eventos24h: number;
  semDados: number;
  salasAtivas: number;
};

type Reuniao = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  owner: { name: string };
  lead: { id: string; name: string } | null;
};

/// Sem evento por este tempo, com o sistema configurado, é sinal de que a
/// ponte caiu. Três horas: mais curto dispararia toda madrugada sem reunião.
const HORAS_ATE_SUSPEITAR = 3;

type Agenda = {
  ate: Date;
  dias: number;
  acabando: boolean;
  sessoes: number;
  series: number;
  vagas: number;
  inscritos: number;
  ocupacao: number;
  vagas24h: number;
  ocupacao24h: number;
};

/// Acima disto a agenda está enchendo e alguém precisa abrir mais sessão.
///
/// 80% e não 100% de propósito: quando chega a 100 o lead já viu "sem
/// horários", e o aviso serviu para registrar o prejuízo em vez de evitá-lo.
const OCUPACAO_DE_ALERTA = 80;

export function MonitoramentoView({
  configurado,
  saude,
  semDados,
  agenda,
  agora,
}: {
  configurado: boolean;
  saude: Saude;
  semDados: Reuniao[];
  agenda: Agenda;
  agora: Date;
}) {
  const horasSemEvento = saude.ultimoEvento
    ? (agora.getTime() - saude.ultimoEvento.getTime()) / 3_600_000
    : null;

  const estado = !configurado
    ? ("desligado" as const)
    : saude.ultimoEvento === null
      ? ("nunca" as const)
      : horasSemEvento! > HORAS_ATE_SUSPEITAR
        ? ("silencioso" as const)
        : ("saudavel" as const);

  return (
    <>
      <PageHeader
        title="Monitoramento"
        subtitle="Estado das integrações que alimentam o CRM sozinhas"
      />

      <Aviso estado={estado} horasSemEvento={horasSemEvento} semDados={semDados.length} />

      {/* A agenda é o que o lead vê no fim do funil. Dias E vagas: uma
          agenda com vinte dias e zero vaga é uma agenda vazia para quem
          está agendando agora. */}
      <AvisoDaAgenda agenda={agenda} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Salas ativas agora" valor={saude.salasAtivas} dica="abertas e sem encerramento" />
        <Cartao rotulo="Eventos em 24h" valor={saude.eventos24h} dica="entradas, saídas e salas" />
        <Cartao
          rotulo="Último evento"
          valor={saude.ultimoEvento ? `${diaMes(saude.ultimoEvento)} ${hhmm(saude.ultimoEvento)}` : "—"}
          dica={saude.ultimoEvento ? "recebido do LiveKit" : "nada recebido até agora"}
        />
        <Cartao
          rotulo="Reuniões sem dados"
          valor={saude.semDados}
          dica="últimos 7 dias"
          alerta={saude.semDados > 0}
        />
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Reuniões sem dados de presença</h2>
        <p className="mt-1 text-sm text-muted">
          Terminaram e não chegou nenhum evento da sala. Elas <strong>não</strong> foram marcadas
          como falta — sem evento não dá para afirmar que ninguém apareceu, e essa é a diferença
          entre um dado faltando e um dado errado.
        </p>

        {semDados.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Nenhuma. Toda reunião encerrada nos últimos 7 dias tem evento de sala.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                  <th className="py-2 pr-4">Reunião</th>
                  <th className="py-2 pr-4">Lead</th>
                  <th className="py-2 pr-4">Closer</th>
                  <th className="py-2 pr-4">Quando</th>
                  <th className="py-2">Há</th>
                </tr>
              </thead>
              <tbody>
                {semDados.map((reuniao) => (
                  <tr key={reuniao.id} className="border-b border-line last:border-b-0">
                    <td className="py-2.5 pr-4 font-medium">{reuniao.title}</td>
                    <td className="py-2.5 pr-4">
                      {reuniao.lead ? (
                        <Link
                          href={`/admin/leads?lead=${reuniao.lead.id}`}
                          className="text-waz-30 hover:underline"
                        >
                          {reuniao.lead.name}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-muted">{reuniao.owner.name}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {diaMes(reuniao.startsAt)} · {hhmm(reuniao.startsAt)}
                    </td>
                    <td className="py-2.5 text-muted tabular-nums">
                      {rotuloDeDias(diasEntre(reuniao.endsAt, agora))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Aviso({
  estado,
  horasSemEvento,
  semDados,
}: {
  estado: "desligado" | "nunca" | "silencioso" | "saudavel";
  horasSemEvento: number | null;
  semDados: number;
}) {
  // Cada aviso segue a mesma forma: o que está acontecendo, por que importa,
  // e o passo que resolve. Um badge vermelho mudo não ajuda ninguém.
  const avisos = {
    desligado: {
      tom: "border-line bg-surface-2",
      icone: <CircleDashed className="size-5 shrink-0 text-muted" />,
      titulo: "LiveKit ainda não configurado",
      corpo:
        "Defina LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET no ambiente. Enquanto isso o CRM funciona normalmente — só as reuniões por vídeo é que não abrem.",
    },
    nunca: {
      tom: "border-amber-300 bg-amber-50",
      icone: <AlertTriangle className="size-5 shrink-0 text-amber-700" />,
      titulo: "Nenhum evento recebido do LiveKit até agora",
      corpo:
        "As chaves estão no lugar, mas o webhook precisa ser cadastrado no painel do LiveKit Cloud apontando para /api/livekit/webhook, com os eventos room_started, room_finished, participant_joined e participant_left. Sem isso a presença não é registrada.",
    },
    silencioso: {
      tom: "border-amber-300 bg-amber-50",
      icone: <AlertTriangle className="size-5 shrink-0 text-amber-700" />,
      titulo: `Sem eventos há ${Math.floor(horasSemEvento ?? 0)} horas`,
      corpo:
        "Pode ser só um período sem reunião. Se houve call nesse intervalo, confira o webhook no painel do LiveKit Cloud — é ele que para de chegar sem avisar.",
    },
    saudavel: {
      tom: "border-waz-60 bg-waz-95",
      icone: <CheckCircle2 className="size-5 shrink-0 text-waz-30" />,
      titulo: "Eventos chegando normalmente",
      corpo:
        semDados > 0
          ? `A ponte está de pé, mas ${semDados} ${semDados === 1 ? "reunião encerrada não tem" : "reuniões encerradas não têm"} nenhum evento. Provavelmente aconteceram antes do webhook ser ligado.`
          : "A presença de cada reunião é recalculada de hora em hora a partir dos eventos.",
    },
  }[estado];

  return (
    <div className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 ${avisos.tom}`}>
      {avisos.icone}
      <div>
        <p className="text-sm font-semibold">{avisos.titulo}</p>
        <p className="mt-0.5 text-sm text-muted">{avisos.corpo}</p>
      </div>
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  dica,
  alerta,
}: {
  rotulo: string;
  valor: number | string;
  dica: string;
  alerta?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Radio className="size-3.5" />
        {rotulo}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums ${alerta ? "text-amber-700" : ""}`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted">{dica}</p>
    </div>
  );
}


/**
 * O estado da agenda que o funil oferece.
 *
 * Duas coisas acabam, e por caminhos diferentes: os DIAS, porque o horizonte
 * para no fim do mês, e as VAGAS, porque as sessões enchem. A segunda é a que
 * chega primeiro quando há tráfego, e era a que esta tela não mostrava.
 */
function AvisoDaAgenda({ agenda }: { agenda: Agenda }) {
  const semSerie = agenda.series === 0;
  const semVaga = agenda.vagas === 0;
  const enchendo = agenda.ocupacao24h >= OCUPACAO_DE_ALERTA || agenda.ocupacao >= OCUPACAO_DE_ALERTA;

  const grave = semSerie || semVaga;
  const atencao = !grave && (enchendo || agenda.acabando);

  return (
    <section
      className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
        grave
          ? "border-red-200 bg-red-50 text-red-900"
          : atencao
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-line bg-surface text-muted"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 font-medium">
          <CalendarRange className="size-4 shrink-0" />
          Agenda do funil
        </span>
        <span>
          aberta até <strong className="font-semibold">{diaMes(agenda.ate)}</strong> —{" "}
          {agenda.dias === 0 ? "acaba hoje" : `${agenda.dias} ${agenda.dias === 1 ? "dia" : "dias"}`}
        </span>
        <span className="tabular-nums">
          <strong className="font-semibold">{agenda.vagas}</strong>{" "}
          {agenda.vagas === 1 ? "vaga" : "vagas"} em {agenda.sessoes}{" "}
          {agenda.sessoes === 1 ? "sessão" : "sessões"}
        </span>
        <span className="tabular-nums">{agenda.ocupacao}% ocupada</span>
        <span className="tabular-nums">
          próximas 24h: {agenda.vagas24h} {agenda.vagas24h === 1 ? "vaga" : "vagas"} ·{" "}
          {agenda.ocupacao24h}%
        </span>
      </div>

      {semSerie && (
        <p className="mt-2 text-xs">
          <strong>Nenhuma série ativa.</strong> Nada vai preencher a agenda, e todo lead que
          chegar ao fim do funil vê &ldquo;sem horários abertos&rdquo;. Crie uma em
          Configurações → Sessões recorrentes.
        </p>
      )}

      {!semSerie && semVaga && (
        <p className="mt-2 text-xs">
          <strong>Zero vaga.</strong> O funil está recusando todo mundo agora. Aumente a
          lotação da série ou crie uma série paralela no mesmo horário.
        </p>
      )}

      {!grave && enchendo && (
        <p className="mt-2 text-xs">
          A agenda está enchendo ({Math.max(agenda.ocupacao, agenda.ocupacao24h)}%). Abra mais
          sessão antes de bater em zero — quando bater, o lead já viu a lista vazia.
        </p>
      )}

      {!grave && !enchendo && agenda.acabando && (
        <p className="mt-2 text-xs">
          A agenda vai até o fim do mês e para. O cron de sessões enche o mês seguinte na
          virada — se este número chegar a zero e ficar, é sinal de que ele não rodou.
        </p>
      )}
    </section>
  );
}
