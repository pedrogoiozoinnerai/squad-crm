import type { NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getDealsParaExportar } from "@/lib/queries";

/** Aspas duplas escapadas e campo entre aspas — evita quebrar o CSV. */
function cell(value: unknown) {
  const str = value === null || value === undefined ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  // A rota é pública por natureza; a checagem de sessão é obrigatória aqui.
  const user = await getSessionUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  // Os mesmos parâmetros que as telas usam. Um CSV que ignora o filtro da tela
  // é pior que não ter botão: quem exporta confere o total e acha que o
  // sistema perdeu negócios.
  const params = request.nextUrl.searchParams;
  const texto = (nome: string) => params.get(nome) ?? undefined;

  // getDealsParaExportar já aplica o escopo: vendedor nunca exporta negócio de outro.
  const deals = await getDealsParaExportar(user, {
    q: texto("q"),
    status: texto("status"),
    closer: texto("closer"),
    prazo: texto("prazo"),
  });

  const header = [
    "Código", "Lead", "Empresa", "E-mail", "Etapa", "Status",
    "Valor", "Probabilidade", "Previsão", "Closer", "Criado em",
  ];

  const STATUS: Record<string, string> = { OPEN: "Em aberto", WON: "Ganho", LOST: "Perdido" };
  const day = (date: Date | null) => (date ? date.toLocaleDateString("pt-BR") : "");

  const rows = deals.map((deal) =>
    [
      deal.code,
      deal.lead.name,
      deal.lead.company,
      deal.lead.email,
      deal.stage.name,
      STATUS[deal.status],
      (deal.valueCents / 100).toFixed(2).replace(".", ","),
      `${deal.probability}%`,
      day(deal.expectedAt),
      deal.owner.name,
      day(deal.createdAt),
    ].map(cell).join(";"),
  );

  // BOM para o Excel abrir os acentos corretamente.
  const csv = `﻿${header.map(cell).join(";")}\n${rows.join("\n")}`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="negocios-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
