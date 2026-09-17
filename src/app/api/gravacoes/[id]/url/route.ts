import type { NextRequest } from "next/server";

import { urlParaAssistir, VALIDADE_DA_URL_S } from "@/lib/armazenamento";
import { getSessionUser } from "@/lib/auth";
import { quemPede } from "@/lib/limite";
import { prisma } from "@/lib/prisma";

/**
 * A URL temporária de uma gravação, e o registro de quem pediu.
 *
 * Uma rota, e não uma URL assinada no render da página, por um motivo de
 * verdade: `?aba=gravacao` é a aba padrão, então assinar no servidor gravaria
 * "assistiu a call" para quem só abriu a sessão para conferir presença. O
 * registro precisa significar alguma coisa — e isto aqui só acontece quando
 * alguém aperta play.
 *
 * Qualquer pessoa do time comercial pode assistir qualquer call: é a decisão
 * que faz o closer novo ouvir o closer bom, e é exatamente por isso que
 * `RecordingAccess` existe. Quem pergunta "quem ouviu a conversa do meu
 * cliente?" merece uma resposta, não um encolher de ombros.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ erro: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const gravacao = await prisma.recording.findUnique({
    where: { id },
    select: { id: true, status: true, caminho: true, apagadaEm: true },
  });

  if (!gravacao) return Response.json({ erro: "Gravação não encontrada." }, { status: 404 });
  if (gravacao.apagadaEm) {
    return Response.json({ erro: "O vídeo foi apagado pela retenção." }, { status: 410 });
  }
  if (gravacao.status !== "COMPLETA" || !gravacao.caminho) {
    return Response.json({ erro: "Esta gravação ainda não está pronta." }, { status: 409 });
  }

  const url = await urlParaAssistir(gravacao.caminho);
  if (!url) {
    return Response.json({ erro: "Não foi possível abrir a gravação agora." }, { status: 502 });
  }

  // Registrado DEPOIS de assinar: um erro do storage não é um acesso, e contar
  // tentativas frustradas como visualizações envenenaria o único registro que
  // responde à pergunta de quem viu o quê.
  await prisma.recordingAccess
    .create({
      data: {
        recordingId: gravacao.id,
        userId: user.id,
        ip: quemPede(request.headers.get("x-forwarded-for")),
      },
    })
    // A URL JÁ foi assinada. Falhar aqui não pode negar o vídeo a quem tem
    // direito a ele — mas some no log, porque um registro de acesso que some
    // em silêncio é pior do que não ter registro nenhum.
    .catch((erro) => console.error("[gravacoes] acesso não registrado:", erro));

  return Response.json(
    { url, expiraEmSegundos: VALIDADE_DA_URL_S },
    // Nunca em cache: é uma URL assinada, e um intermediário guardando isto
    // entregaria o vídeo de um cliente para a próxima pessoa que pedisse.
    { headers: { "cache-control": "no-store, private" } },
  );
}
