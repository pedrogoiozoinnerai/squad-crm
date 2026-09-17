import "server-only";

import { env, identificador } from "@/lib/env";
import { POR_PAGINA } from "@/lib/marca-dagua";
import { prisma } from "@/lib/prisma";

/**
 * Leitura dos leads do Funil do Type.
 *
 * Os três apps dividem a mesma instância Postgres (`master_data`), cada um no
 * seu schema. Então esta função **não abre conexão própria**: ela consulta o
 * schema do funil pela conexão que o CRM já mantém — era exatamente o que o
 * comentário anterior previa para quando os dois compartilhassem banco.
 *
 * Abrir um segundo pool para o mesmo host só multiplicaria conexões no pooler,
 * que já roda com `max: 1` por instância serverless de propósito.
 *
 * A ponte continua sendo o par `typeLeadId` / `typeSessionId`, ambos `@unique`
 * no CRM — é o que torna reimportar idempotente.
 */
export type FunnelLead = {
  id: string;
  sessionId: string;
  fullName: string | null;
  email: string | null;
  phoneE164: string | null;
  company: string | null;
  role: string | null;
  segment: string | null;
  revenueRange: string | null;
  scheduledAt: string | null;
  /// Id da reunião no CRM, gravado pelo FUNIL no instante da reserva.
  ///
  /// É a resposta autoritativa para "este lead já tem reunião?" — e não era
  /// lida. Sem ela a sincronização só sabia reencontrar reunião do Cal.com,
  /// não achava nada nas reservas feitas pela nossa agenda, e criava uma
  /// reunião nova a cada execução do cron. Ver `lib/sync-reuniao`.
  crmMeetingId: string | null;
  calBookingUid: string | null;
  meetingLocation: string | null;
  /// Preenchido quando a reserva foi cancelada no Cal.com.
  calCancelledAt: string | null;
  /// `true` quando o lead percorreu o questionário inteiro mas não agendou.
  /// É o lead mais qualificado que existe — respondeu faturamento, cargo e
  /// empresa — e antes ele não chegava aqui de jeito nenhum.
  semAgendamento: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string | null;
  /// Última alteração no funil. É por ela que a marca d'água avança.
  updatedAt: string | null;
};

/**
 * Schema do funil dentro do banco compartilhado: `type` ou `type_dev`.
 *
 * Nome de schema não pode ser bind param — entra no SQL por interpolação —,
 * então `identificador` o valida antes de qualquer consulta.
 */
function funnelSchema() {
  return identificador("TYPE_DB_SCHEMA", env("TYPE_DB_SCHEMA", "type")!);
}

export function funnelConfigured() {
  return Boolean(env("DATABASE_URL") && env("TYPE_DB_SCHEMA"));
}

/** Postgres devolve timestamp como Date; o resto do fluxo espera ISO. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Quem já respondeu o suficiente para valer um contato.
 *
 * O funil só marca `COMPLETED` quando alguém agenda — então "terminou" e
 * "agendou" são a mesma coisa do lado do Type. Quem responde os sete passos e
 * trava no agendamento fica `IN_PROGRESS` para sempre, e era invisível aqui.
 *
 * `currentStep = SCHEDULE` diz que a pessoa chegou ao último passo; os campos
 * obrigatórios confirmam que respondeu o que interessa. Os dois juntos separam
 * "quase fechou" de "desistiu no segundo campo".
 */
const RESPONDEU_TUDO = `
  status::text = 'IN_PROGRESS'
  AND "currentStep"::text = 'SCHEDULE'
  AND "fullName" IS NOT NULL
  AND company IS NOT NULL
  AND ("email" IS NOT NULL OR "phoneE164" IS NOT NULL)
`;

/**
 * Os leads que mudaram desde a marca d'água.
 *
 * Por `updatedAt` e não `createdAt`: o espelho não é só sobre lead novo —
 * precisa pegar quem já existia e remarcou, cancelou ou agendou depois. O
 * Prisma do funil sobe `updatedAt` em toda escrita, então uma coisa cobre as
 * duas.
 *
 * Ordem CRESCENTE, ao contrário do que era. Com `DESC LIMIT 500` a página era
 * "os mais recentes", e numa rajada maior que 500 os excedentes saíam da
 * janela para sempre. Crescente com marca d'água, a fila drena: o que não
 * coube nesta página vem na próxima.
 */
export async function readFunnelLeads(
  desde: Date,
  limite: number = POR_PAGINA,
): Promise<FunnelLead[]> {
  const schema = funnelSchema();

  // Identificadores vão entre aspas: sem elas o Postgres rebaixa para minúsculo
  // e `sessionId` / `fullName` — criados com maiúscula pelo Prisma — somem.
  //
  // `status` é enum de verdade (`type_dev."LeadStatus"`). Comparar com
  // `::text` evita ter de nomear o tipo, que muda junto com o schema.
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id,
            "sessionId",
            "fullName",
            email,
            "phoneE164",
            company,
            role,
            segment,
            "revenueRange",
            "scheduledAt",
            "crmMeetingId",
            "calBookingUid",
            "meetingLocation",
            "calCancelledAt",
            status::text AS status,
            "utmSource",
            "utmMedium",
            "utmCampaign",
            "createdAt",
            "updatedAt"
       FROM "${schema}"."Lead"
      WHERE "updatedAt" >= $1
        AND (("fullName" IS NOT NULL AND status::text = 'COMPLETED')
             OR (${RESPONDEU_TUDO}))
      ORDER BY "updatedAt" ASC
      LIMIT $2`,
    desde,
    limite,
  );

  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.sessionId),
    fullName: r.fullName === null ? null : String(r.fullName),
    email: r.email === null ? null : String(r.email),
    phoneE164: r.phoneE164 === null ? null : String(r.phoneE164),
    company: r.company === null ? null : String(r.company),
    role: r.role === null ? null : String(r.role),
    segment: r.segment === null ? null : String(r.segment),
    revenueRange: r.revenueRange === null ? null : String(r.revenueRange),
    scheduledAt: iso(r.scheduledAt),
    crmMeetingId: r.crmMeetingId === null ? null : String(r.crmMeetingId),
    calBookingUid: r.calBookingUid === null ? null : String(r.calBookingUid),
    calCancelledAt: iso(r.calCancelledAt),
    meetingLocation: r.meetingLocation === null ? null : String(r.meetingLocation),
    semAgendamento: String(r.status) !== "COMPLETED",
    utmSource: r.utmSource === null ? null : String(r.utmSource),
    utmMedium: r.utmMedium === null ? null : String(r.utmMedium),
    utmCampaign: r.utmCampaign === null ? null : String(r.utmCampaign),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
}
