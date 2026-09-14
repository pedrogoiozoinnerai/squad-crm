import "server-only";

import { getSessionUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ActivityKind } from "@/generated/prisma/enums";

/** Resultado padrão de toda Server Action de formulário. */
export type FormState = { error?: string; ok?: boolean } | null;

/**
 * Toda Server Action começa por aqui. Server Actions são alcançáveis por POST
 * direto, então autenticação e autorização nunca dependem da UI.
 */
export async function currentUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Não autenticado.");
  return user;
}

/** Admin mexe em tudo; vendedor só no que é dele. */
export function assertOwns(user: SessionUser, ownerId: string | null | undefined) {
  if (user.role === "ADMIN") return;
  if (ownerId !== user.id) throw new Error("Sem permissão para alterar este registro.");
}

/**
 * Autoriza um contexto {leadId, dealId} validando **os dois**.
 *
 * A versão anterior usava `if (dealId) … else if (leadId) …`: quando o POST
 * mandava os dois, só o negócio era checado e o registro nascia com um `leadId`
 * de outro dono. Server Action é superfície pública — quem chama escolhe o
 * corpo, então todo id recebido precisa passar pela checagem.
 *
 * Devolve o dono resolvido, para a tarefa/anotação herdar o responsável certo.
 */
export async function assertOwnsContext(
  user: SessionUser,
  ctx: { leadId?: string | null; dealId?: string | null },
): Promise<{ ownerId: string; leadId: string | null; dealId: string | null }> {
  let ownerId = user.id;

  if (ctx.dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: ctx.dealId },
      select: { ownerId: true, leadId: true },
    });
    if (!deal) throw new Error("Negócio não encontrado.");
    assertOwns(user, deal.ownerId);
    ownerId = deal.ownerId;

    // O lead informado precisa ser o lead DESTE negócio.
    if (ctx.leadId && ctx.leadId !== deal.leadId) {
      throw new Error("O lead informado não pertence a este negócio.");
    }
  }

  if (ctx.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: ctx.leadId },
      select: { ownerId: true },
    });
    if (!lead) throw new Error("Lead não encontrado.");
    assertOwns(user, lead.ownerId);
    if (!ctx.dealId) ownerId = lead.ownerId ?? user.id;
  }

  return { ownerId, leadId: ctx.leadId ?? null, dealId: ctx.dealId ?? null };
}

export async function logActivity(input: {
  kind: ActivityKind;
  title: string;
  detail?: string | null;
  authorId: string;
  leadId?: string | null;
  dealId?: string | null;
}) {
  await prisma.activity.create({
    data: {
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      authorId: input.authorId,
      leadId: input.leadId ?? null,
      dealId: input.dealId ?? null,
    },
  });
}

/** As telas dos dois espaços mostram os mesmos dados — revalida as duas. */
export function revalidateBoth(revalidate: (path: string) => void, ...slugs: string[]) {
  for (const slug of slugs) {
    revalidate(`/admin/${slug}`);
    revalidate(`/user/${slug}`);
  }
}
