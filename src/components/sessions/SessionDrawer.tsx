import { CircleSlash, Timer, UserCheck } from "lucide-react";

import {
  fimDaSessao,
  inicioDaSessao,
  MINUTOS_MINIMOS,
  tempoNaSala,
} from "@/components/sessions/SessionsView";
import { Drawer } from "@/components/ui/Drawer";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { SessionUser } from "@/lib/auth";
import { hhmm } from "@/lib/dates";
import { getSessionDetail } from "@/lib/queries";

const STATUS = {
  SCHEDULED: { text: "Agendada", tone: "bg-sky-50 text-sky-700" },
  DONE: { text: "Realizada", tone: "bg-waz-90 text-waz-20" },
  NO_SHOW: { text: "Sem presença", tone: "bg-amber-50 text-amber-800" },
  CANCELED: { text: "Cancelada", tone: "bg-red-50 text-red-700" },
} as const;

export async function SessionDrawer({
  sessionId,
  user,
  now,
  closeHref,
}: {
  sessionId: string;
  user: SessionUser;
  now: Date;
  closeHref: string;
}) {
  const session = await getSessionDetail(user, sessionId);

  if (!session) {
    return (
      <Drawer closeHref={closeHref} title="Sessão não encontrada">
        <p className="text-sm text-muted">
          Esta sessão não existe ou não está no seu escopo de acesso.
        </p>
      </Drawer>
    );
  }

  const inicio = inicioDaSessao(session);
  const cancelada = session.status === "CANCELED";
  const futura = !cancelada && inicio > now;
  // Enquanto a sala está aberta os números ainda mudam: quem entrou há 3 min
  // pode virar presente no minuto 5. Fechada a sala, aí sim viram a foto final.
  const emAndamento = !cancelada && !futura && fimDaSessao(session) > now;
  const medida = !cancelada && !futura && !emAndamento;

  const inscritos = session.participants.length;
  const presentes = session.participants.filter((p) => p.attended).length;
  const taxa = inscritos ? Math.round((presentes / inscritos) * 100) : 0;
  const qualificados = session.participants.filter(
    (p) => p.attended && (p.lead.score === "A" || p.lead.score === "B"),
  ).length;

  const status = STATUS[session.status];

  return (
    <Drawer
      closeHref={closeHref}
      title={session.template?.name ?? "Sessão coletiva"}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-base text-foreground">
            {inicio.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </span>
          <span className="font-mono">{session.time}</span>
          <span>{session.durationMin} min</span>
          <span>Closer: {session.owner.name}</span>
        </span>
      }
      actions={
        <span className={`chip ${status.tone}`}>
          {emAndamento ? "Em andamento" : status.text}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero label="Inscritos" value={String(inscritos)} hint={`${session.capacity} vagas`} />
        <Numero label="Presentes" value={medida ? `${presentes}/${inscritos}` : "—"} />
        <Numero
          label="Taxa de presença"
          value={medida ? `${taxa}%` : "—"}
          hint={medida ? `≥ ${MINUTOS_MINIMOS} min na sala` : undefined}
        />
        <Numero
          label="Leads A/B"
          value={medida ? String(qualificados) : "—"}
          hint="qualificados presentes"
        />
      </div>

      <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
        <Timer className="mt-0.5 size-4 shrink-0" />
        <span>
          Cada linha abaixo traz o <strong className="text-foreground">tempo real na sala</strong>,
          medido pela própria call. O chip <em>Presente</em> é consequência desse tempo —{" "}
          {MINUTOS_MINIMOS} minutos ou mais —, não de uma marcação manual.
        </span>
      </p>

      <h3 className="mt-6 mb-3 flex items-baseline gap-2 text-sm font-semibold">
        Participantes
        <span className="text-xs font-normal text-muted">
          {inscritos} {inscritos === 1 ? "inscrito" : "inscritos"} · ordenados por tempo na sala
        </span>
      </h3>

      {inscritos === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-12 text-center text-xs text-muted">
          Ninguém inscrito nesta sessão ainda. As inscrições chegam pelo convite rastreado
          enviado ao lead.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {session.participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">
                {iniciais(p.lead.name)}
              </span>

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
                  {p.joinedAt
                    ? `entrou ${hhmm(p.joinedAt)}${p.joinCount > 1 ? ` · ${p.joinCount} entradas` : ""}`
                    : futura || emAndamento
                      ? "aguardando a sala"
                      : "nunca entrou"}
                </span>
              </span>

              <span className="w-[104px] shrink-0 text-right">
                {p.attended ? (
                  <span className="chip bg-waz-90 text-waz-20">
                    <UserCheck className="size-3.5" />
                    Presente
                  </span>
                ) : futura || emAndamento ? (
                  <span className="chip bg-surface-2 text-muted">Aguardando</span>
                ) : (
                  <span className="chip bg-stone-100 text-stone-600">
                    <CircleSlash className="size-3.5" />
                    Ausente
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
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

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}
