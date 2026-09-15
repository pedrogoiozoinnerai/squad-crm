"use server";

import { revalidatePath } from "next/cache";

import { currentUser, revalidateBoth, type FormState } from "@/lib/guard";
import { sincronizarFunil } from "@/lib/type-sync";

export type ImportState =
  | (FormState & { created?: number; skipped?: number; meetings?: number; deals?: number })
  | null;

/**
 * Botão "Importar do Funil".
 *
 * A sincronização de verdade vive em `type-sync.ts` e roda sozinha pelo cron;
 * este botão existe para quem não quer esperar o próximo ciclo. Os dois chamam
 * exatamente o mesmo código — duas implementações divergiriam no dia em que
 * alguém corrigisse só uma.
 */
export async function importFunnelLeads(): Promise<ImportState> {
  const user = await currentUser();
  if (user.role !== "ADMIN") return { error: "Só administradores podem importar." };

  try {
    const r = await sincronizarFunil();
    revalidateBoth(revalidatePath, "leads", "calendar", "agenda", "pipeline", "deals", "tarefas", "inicio");
    return {
      ok: true,
      created: r.leadsCriados,
      skipped: r.lidos - r.leadsCriados,
      meetings: r.reunioesCriadas,
      deals: r.negociosCriados,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Não foi possível ler o funil: ${error.message}`
          : "Não foi possível ler o funil.",
    };
  }
}
