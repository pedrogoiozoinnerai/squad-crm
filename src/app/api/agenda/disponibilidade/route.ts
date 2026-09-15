import { TZ } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

/**
 * As sessões com vaga, para quem está agendando de fora.
 *
 * É o que o funil do Type mostra no lugar do calendário do Cal.com. Não pede
 * chave: só devolve dia, hora e quantas vagas restam — nenhum nome, nenhum
 * e-mail, nada que já não esteja na tela de quem vai agendar.
 *
 * Reservar, isso sim, exige chave. Ler não muda nada; escrever muda.
 */
export const dynamic = "force-dynamic";

/// Quanto tempo antes do início a sessão para de aceitar inscrição.
///
/// Zero minutos deixaria alguém agendar para daqui a trinta segundos e chegar
/// depois do começo — e a sessão em grupo não espera.
const ANTECEDENCIA_MIN = 15;

/// Teto de dias à frente. Mais que isso e o lead escolhe uma data que ele
/// mesmo não lembra quando chegar.
const HORIZONTE_DIAS = 21;

export async function GET() {
  const agora = new Date();
  const de = new Date(agora.getTime() + ANTECEDENCIA_MIN * 60_000);
  const ate = new Date(agora.getTime() + HORIZONTE_DIAS * 24 * 60 * 60 * 1000);

  const sessoes = await prisma.meeting.findMany({
    where: {
      type: "GROUP",
      status: "SCHEDULED",
      startsAt: { gte: de, lte: ate },
      capacity: { not: null },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      _count: { select: { attendees: { where: { status: { in: ["INSCRITO", "CONFIRMADO"] } } } } },
    },
  });

  const comVaga = sessoes
    .map((s) => ({
      id: s.id,
      inicioEm: s.startsAt.toISOString(),
      duracaoMin: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
      lotacao: s.capacity ?? 0,
      inscritos: s._count.attendees,
      vagas: Math.max(0, (s.capacity ?? 0) - s._count.attendees),
    }))
    .filter((s) => s.vagas > 0);

  return Response.json(
    { timezone: TZ, sessoes: comVaga },
    {
      headers: {
        // Meio minuto de cache: o funil consulta a cada carregamento de tela, e
        // a lotação não muda tão rápido a ponto de justificar ir ao banco toda
        // vez. Mais que isso e alguém veria vaga numa sessão já lotada.
        "cache-control": "public, max-age=30",
      },
    },
  );
}
