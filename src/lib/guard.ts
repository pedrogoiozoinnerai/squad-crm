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
