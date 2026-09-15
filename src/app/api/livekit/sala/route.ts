import type { NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { salaDaReuniao } from "@/lib/livekit";
import { chamarLiveKit } from "@/lib/livekit-servidor";
import { prisma } from "@/lib/prisma";

/**
 * As ações de host da sala.
 *
 * Vivem no servidor porque são chamadas de administração da API do LiveKit — e
 * um token com poder de remover participante não pode sair daqui. O navegador
 * pede; quem manda é este arquivo, depois de conferir que quem pediu é o dono
 * da reunião.
 */
export const dynamic = "force-dynamic";

type Acao = "silenciar_todos" | "travar" | "destravar" | "remover" | "encerrar";

type Trilha = { sid: string; type: string; muted: boolean };
type Participante = { identity: string; tracks?: Trilha[] };

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return Response.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: { meetingId?: string; acao?: Acao; identidade?: string };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const { meetingId, acao } = corpo;
  if (!meetingId || !acao) return Response.json({ erro: "Faltam dados." }, { status: 400 });

  const reuniao = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { ownerId: true },
  });
  if (!reuniao) return Response.json({ erro: "Reunião não encontrada." }, { status: 404 });

  // Poder de host é do dono da reunião — admin pela mesma régua do resto do
  // CRM. O lead nunca chega aqui: ele entra por convite e não tem sessão.
  if (user.role !== "ADMIN" && reuniao.ownerId !== user.id) {
    return Response.json({ erro: "Esta reunião não é sua." }, { status: 403 });
  }

  const sala = salaDaReuniao(meetingId);
  const euMesmo = `u_${reuniao.ownerId}`;
  const comoAdmin = { roomAdmin: true, room: sala };

  try {
    switch (acao) {
      case "encerrar":
        await chamarLiveKit("livekit.RoomService/DeleteRoom", { room: sala }, comoAdmin);
        break;

      case "remover": {
        if (!corpo.identidade) return Response.json({ erro: "Sem participante." }, { status: 400 });
        // Remover a si mesmo derrubaria o host da própria call sem querer.
        if (corpo.identidade === euMesmo) {
          return Response.json({ erro: "Use Sair para deixar a reunião." }, { status: 400 });
        }
        await chamarLiveKit(
          "livekit.RoomService/RemoveParticipant",
          { room: sala, identity: corpo.identidade },
          comoAdmin,
        );
        break;
      }

      case "silenciar_todos":
      case "travar":
      case "destravar": {
        const resposta = (await chamarLiveKit(
          "livekit.RoomService/ListParticipants",
          { room: sala },
          comoAdmin,
        )) as { participants?: Participante[] };

        for (const p of (resposta.participants ?? []).filter((p) => p.identity !== euMesmo)) {
          if (acao !== "destravar") {
            for (const trilha of p.tracks ?? []) {
              if (trilha.type === "AUDIO" && !trilha.muted) {
                await chamarLiveKit(
                  "livekit.RoomService/MutePublishedTrack",
                  { room: sala, identity: p.identity, track_sid: trilha.sid, muted: true },
                  comoAdmin,
                );
              }
            }
          }

          // Travar de verdade é tirar a permissão de publicar. Só silenciar
          // deixaria qualquer um religar o microfone no segundo seguinte —
          // seria um pedido, não uma trava.
          if (acao !== "silenciar_todos") {
            await chamarLiveKit(
              "livekit.RoomService/UpdateParticipant",
              {
                room: sala,
                identity: p.identity,
                permission: {
                  can_subscribe: true,
                  can_publish: acao === "destravar",
                  can_publish_data: true,
                },
              },
              comoAdmin,
            );
          }
        }

        if (acao !== "silenciar_todos") {
          // A sala guarda o estado: quem entrar DEPOIS já chega travado, e a
          // tela sabe o que mostrar sem perguntar.
          await chamarLiveKit(
            "livekit.RoomService/UpdateRoomMetadata",
            { room: sala, metadata: JSON.stringify({ microfonesTravados: acao === "travar" }) },
            comoAdmin,
          );
        }
        break;
      }

      default:
        return Response.json({ erro: "Ação desconhecida." }, { status: 400 });
    }
  } catch (erro) {
    console.error("[livekit/sala]", acao, erro);
    return Response.json({ erro: "O LiveKit recusou a ação." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
