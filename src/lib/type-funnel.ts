import "server-only";

import { createClient } from "@libsql/client";

/**
 * Leitura dos leads do Funil do Type.
 *
 * Hoje, em desenvolvimento, cada projeto tem seu próprio arquivo SQLite, então
 * abrimos uma conexão só-leitura no banco do funil (`TYPE_DATABASE_URL`).
 * Quando os dois projetos apontarem para o mesmo Postgres, esta função vira um
 * `prisma.$queryRaw` na conexão que já existe — o resto do fluxo não muda,
 * porque a ponte é o par de colunas `typeLeadId` / `typeSessionId`.
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

export function funnelConfigured() {
  return Boolean(process.env.TYPE_DATABASE_URL);
}

export async function readFunnelLeads(): Promise<FunnelLead[]> {
  const url = process.env.TYPE_DATABASE_URL;
  if (!url) throw new Error("TYPE_DATABASE_URL não configurada.");

  const client = createClient({ url });

  try {
    // Só leads que chegaram ao fim do funil — os abandonados não viram CRM.
    const result = await client.execute({
      sql: `SELECT id, sessionId, fullName, email, phoneE164, company, role,
                   segment, revenueRange, scheduledAt, utmSource, utmMedium,
                   utmCampaign, createdAt
            FROM Lead
            WHERE status = ? AND fullName IS NOT NULL
            ORDER BY createdAt DESC
            LIMIT 500`,
      args: ["COMPLETED"],
    });

    return result.rows as unknown as FunnelLead[];
  } finally {
    client.close();
  }
}
