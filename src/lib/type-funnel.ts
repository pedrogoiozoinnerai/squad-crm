import "server-only";

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
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string | null;
};

/** Schema do funil dentro do banco compartilhado: `type` ou `type_dev`. */
function funnelSchema() {
  return process.env.TYPE_DB_SCHEMA ?? "type";
}

/**
 * Nome de schema não pode ser bind param — ele entra no SQL por interpolação.
 * Por isso é validado: só identificador Postgres simples passa.
 */
function assertIdentificadorSeguro(nome: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome)) {
    throw new Error(`TYPE_DB_SCHEMA inválido: "${nome}".`);
  }
  return nome;
}

export function funnelConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.TYPE_DB_SCHEMA);
}

/** Postgres devolve timestamp como Date; o resto do fluxo espera ISO. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export async function readFunnelLeads(): Promise<FunnelLead[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada — veja .env.example.");
  }

  const schema = assertIdentificadorSeguro(funnelSchema());

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
            "utmSource",
            "utmMedium",
            "utmCampaign",
            "createdAt"
       FROM "${schema}"."Lead"
      WHERE status::text = $1
        AND "fullName" IS NOT NULL
      ORDER BY "createdAt" DESC
      LIMIT 500`,
    "COMPLETED",
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
    utmSource: r.utmSource === null ? null : String(r.utmSource),
    utmMedium: r.utmMedium === null ? null : String(r.utmMedium),
    utmCampaign: r.utmCampaign === null ? null : String(r.utmCampaign),
    createdAt: iso(r.createdAt),
  }));
}
