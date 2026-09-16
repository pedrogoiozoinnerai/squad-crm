import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { novoTokenDeConvite } from "@/lib/codes";
import { TZ } from "@/lib/dates";
import { linkDoConvite } from "@/lib/convites";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { guardaDeTaxa } from "@/lib/limite-servidor";
import { inscrever } from "@/lib/sessoes";

/**
 * Reserva uma vaga numa sessão coletiva, vinda do funil do Type.
 *
 * Substitui o agendamento do Cal.com. O funil chama daqui do SERVIDOR dele, com
 * a chave compartilhada — nunca do navegador do lead, porque a chave seria o
 * poder de inscrever qualquer um em qualquer sessão.
 *
 * O CRM de referência deixou o equivalente disto sem autenticação nenhuma, e é
 * o ponto mais exposto do sistema deles: com a URL, qualquer um cria
 * agendamento. Não repetimos.
 *
 * Idempotente por `typeSessionId`: o funil pode reenviar, e o `type-sync` roda
 * a cada dez minutos sobre os mesmos leads. Quem chegar primeiro cria; o outro
 * reencontra.
 */
export const dynamic = "force-dynamic";

function chaveConfere(recebida: string | null) {
  const esperada = env("FUNIL_API_KEY");
  if (!esperada || !recebida) return false;
  const a = Buffer.from(recebida.replace(/^Bearer\s+/i, "").trim());
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Antes da chave: quem está martelando não deve nem custar a comparação.
  const barrado = await guardaDeTaxa("reservar", request);
  if (barrado) return barrado;

  if (!env("FUNIL_API_KEY")) {
    return Response.json({ erro: "Agendamento pelo funil não configurado." }, { status: 503 });
  }
  if (!chaveConfere(request.headers.get("authorization"))) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }

  let corpo: {
    meetingId?: string;
    typeSessionId?: string;
    typeLeadId?: string;
    nome?: string;
    email?: string;
    telefone?: string;
    empresa?: string;
    segmento?: string;
    cargo?: string;
    faturamento?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const { meetingId, typeSessionId } = corpo;
  const nome = corpo.nome?.trim();
  if (!meetingId || !typeSessionId || !nome) {
    return Response.json(
      { erro: "Faltam dados: meetingId, typeSessionId e nome são obrigatórios." },
      { status: 400 },
    );
  }

  const sessao = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, type: true, status: true, startsAt: true, ownerId: true, capacity: true },
  });
  if (!sessao || sessao.type !== "GROUP") {
    return Response.json({ erro: "Sessão não encontrada." }, { status: 404 });
  }
  if (sessao.status === "CANCELED") {
    return Response.json({ erro: "Esta sessão foi cancelada." }, { status: 409 });
  }
  if (sessao.startsAt.getTime() < Date.now()) {
    return Response.json({ erro: "Esta sessão já começou." }, { status: 409 });
  }

  // O lead pela mesma ponte que o `type-sync` usa. Sem isso, o funil criaria um
  // lead e a sincronização criaria outro dez minutos depois.
  const lead = await prisma.lead.upsert({
    where: { typeSessionId },
    update: {
      name: nome,
      email: corpo.email ?? undefined,
      phone: corpo.telefone ?? undefined,
      company: corpo.empresa ?? undefined,
      segment: corpo.segmento ?? undefined,
      jobTitle: corpo.cargo ?? undefined,
      revenueRange: corpo.faturamento ?? undefined,
    },
    create: {
      typeSessionId,
      typeLeadId: corpo.typeLeadId ?? null,
      name: nome,
      email: corpo.email ?? null,
      phone: corpo.telefone ?? null,
      company: corpo.empresa ?? null,
      segment: corpo.segmento ?? null,
      jobTitle: corpo.cargo ?? null,
      revenueRange: corpo.faturamento ?? null,
      source: "funil_type",
      utmSource: corpo.utmSource ?? null,
      utmMedium: corpo.utmMedium ?? null,
      utmCampaign: corpo.utmCampaign ?? null,
      // Quem conduz a sessão fica com o lead: é ele quem vai falar com a pessoa.
      ownerId: sessao.ownerId,
      status: "COMPLETE",
    },
    select: { id: true },
  });

  const r = await inscrever(sessao.id, lead.id, novoTokenDeConvite());

  if (r.situacao === "lotada") {
    // 409 e não 500: a sessão encheu entre a consulta e o clique, e o funil
    // precisa saber que é para mostrar a lista de novo — não que deu erro.
    return Response.json({ erro: "Esta sessão lotou.", lotada: true }, { status: 409 });
  }

  // A linha do tempo do lead.
  //
  // Sem isto o vendedor abre o lead que acabou de se inscrever e não vê nada:
  // o histórico começa vazio, como se a pessoa tivesse aparecido do nada. O
  // registro é o primeiro contexto que ele tem antes da call — de onde veio e
  // para quando marcou.
  //
  // Só na inscrição NOVA: `jaEstava` significa que o funil reenviou a mesma
  // reserva, e uma linha por reenvio encheria o histórico de ruído.
  if (r.situacao === "inscrito") {
    await prisma.activity.create({
      data: {
        kind: "MEETING_SCHEDULED",
        title: `Inscreveu-se na sessão de ${sessao.startsAt.toLocaleString("pt-BR", {
          timeZone: TZ,
          dateStyle: "short",
          timeStyle: "short",
        })}`,
        detail: [corpo.utmSource && `origem: ${corpo.utmSource}`, "pelo funil do Type"]
          .filter(Boolean)
          .join(" · "),
        leadId: lead.id,
      },
    });
  }

  return Response.json({
    ok: true,
    jaEstava: r.situacao === "ja_inscrito",
    convite: linkDoConvite(r.token),
    reuniao: { id: sessao.id, comecaEm: sessao.startsAt.toISOString() },
  });
}
