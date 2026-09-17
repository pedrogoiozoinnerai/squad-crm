"use server";

import { redirect } from "next/navigation";

import { passouDoLimite } from "@/lib/limite-servidor";
import { remarcar } from "@/lib/sessoes";

/**
 * Trocar o horário, a partir do próprio convite.
 *
 * Server Action e não rota porque a página é um `<form>` puro: assim ela
 * funciona sem JavaScript nenhum, que é o que se quer numa tela aberta pelo
 * navegador embutido do Instagram, num aparelho antigo, numa rede ruim. É a
 * mesma pessoa que já teve trabalho de preencher sete passos — não pode
 * esbarrar num botão que depende de um pacote que não carregou.
 *
 * O resultado volta pela URL, e não por estado: sem JavaScript não há estado.
 */
export async function remarcarSessao(dadosDoFormulario: FormData) {
  const token = String(dadosDoFormulario.get("token") ?? "");
  const meetingId = String(dadosDoFormulario.get("meetingId") ?? "");
  // O dia que estava aberto no calendário. Volta na URL para a pessoa
  // reencontrar a tela de onde saiu quando a tentativa não dá certo.
  const dia = String(dadosDoFormulario.get("dia") ?? "");
  const volta = (motivo: string) =>
    `/convite/${token}/remarcar?r=${motivo}${/^\d{4}-\d{2}-\d{2}$/.test(dia) ? `&dia=${dia}` : ""}`;

  if (!token || !meetingId) redirect(volta("invalido"));

  // Mesmo teto das outras portas do convite: este endereço aceita um token por
  // tentativa e, sem limite, vira o oráculo de quais convites existem.
  if (await passouDoLimite("token")) redirect(volta("espere"));

  const r = await remarcar(token, meetingId);

  if (r.tipo === "ok") redirect(`/convite/${token}?r=remarcado`);
  redirect(volta(r.tipo));
}
