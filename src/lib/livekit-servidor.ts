import "server-only";

import { chavesDoArmazenamento } from "@/lib/armazenamento";
import { env } from "@/lib/env";
import { caminhoDaGravacao, pedidoDeEgress } from "@/lib/gravacao";
import { reuniaoDaSala, salaDaReuniao, tokenDeServico, urlHttpDoLiveKit } from "@/lib/livekit";
import { salasVencidas } from "@/lib/presenca";
import { prisma } from "@/lib/prisma";

/**
 * As chaves do LiveKit, lidas num lugar só.
 *
 * Devolve `null` quando não estão configuradas, em vez de lançar: sem elas o
 * CRM inteiro continua funcionando — só as reuniões por vídeo é que não. Uma
 * exceção aqui derrubaria telas que não têm nada a ver com isso.
 */
export function chavesDoLiveKit() {
  const url = env("LIVEKIT_URL");
  const apiKey = env("LIVEKIT_API_KEY");
  const apiSecret = env("LIVEKIT_API_SECRET");
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function livekitConfigurado() {
  return chavesDoLiveKit() !== null;
}

/**
 * Chamada de administração ao LiveKit.
 *
 * A API deles é twirp — JSON sobre HTTP POST, um endereço por método. Sem SDK
 * de servidor pela mesma razão do resto deste módulo: são duas chamadas, e a
 * dependência traria uma árvore inteira para assinar o que já sabemos assinar.
 */
export async function chamarLiveKit(
  metodo: string,
  corpo: Record<string, unknown>,
  concessoes: {
    roomCreate?: boolean;
    roomList?: boolean;
    roomRecord?: boolean;
    roomAdmin?: boolean;
    room?: string;
  },
) {
  const chaves = chavesDoLiveKit();
  if (!chaves) throw new Error("LiveKit não configurado.");

  const resposta = await fetch(`${urlHttpDoLiveKit(chaves.url)}/twirp/${metodo}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenDeServico({
        apiKey: chaves.apiKey,
        apiSecret: chaves.apiSecret,
        concessoes,
      })}`,
    },
    body: JSON.stringify(corpo),
    // Uma chamada de controle não pode segurar a rota: se o LiveKit não
    // responde em 10s, a sala não vai abrir de qualquer jeito.
    signal: AbortSignal.timeout(10_000),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`LiveKit ${metodo} respondeu ${resposta.status}: ${detalhe.slice(0, 200)}`);
  }
  return resposta.json() as Promise<Record<string, unknown>>;
}

/**
 * Garante que a sala existe antes de alguém entrar.
 *
 * O LiveKit criaria a sala sozinho no primeiro `join`, e então não haveria onde
 * pendurar a configuração — nem `maxParticipants`, nem o egress automático que
 * a gravação vai precisar. Criar explicitamente também dá um ponto único onde
 * consentimento e lotação são verificados.
 *
 * Chamar de novo para uma sala existente é inofensivo: o LiveKit devolve a que
 * já está lá.
 */
export async function criarSala(
  meetingId: string,
  opcoes: { duracaoMin: number; inicio: Date; maxParticipantes?: number },
) {
  const nome = salaDaReuniao(meetingId);

  // A gravação é DECLARADA na criação da sala, não pedida numa chamada
  // separada de "começar a gravar". `criarSala` roda em toda requisição de
  // token: com trinta pessoas entrando ao mesmo tempo, um start explícito
  // seriam trinta gravações e trinta faturas. `CreateRoom` numa sala que já
  // existe devolve a que está lá, sem abrir um segundo egress.
  //
  // Sem chaves de bucket, `pedidoDeEgress` devolve `null` e o corpo sai sem o
  // campo — a sala é criada exatamente como antes. É a guarda inteira.
  const egress = pedidoDeEgress(
    nome,
    caminhoDaGravacao(meetingId, opcoes.inicio),
    chavesDoArmazenamento(),
  );

  await chamarLiveKit(
    "livekit.RoomService/CreateRoom",
    {
      name: nome,
      // Fecha a sala 5 min depois de esvaziar — é o que dispara o
      // `room_finished` de que a presença depende para fechar quem não saiu.
      emptyTimeout: 5 * 60,
      // Quanto a sala espera DEPOIS que o último participante sai. Não é teto
      // de duração — o `CreateRoom` do LiveKit não tem campo para isso, e o
      // comentário que antes prometia aqui "teto duro: a duração marcada mais
      // uma hora" descrevia uma proteção que nunca existiu. Quem fecha a sala
      // vencida é `fecharSalasVencidas`, abaixo.
      departureTimeout: 60,
      maxParticipants: opcoes.maxParticipantes ?? 0,
      metadata: JSON.stringify({ meetingId, duracaoMin: opcoes.duracaoMin }),
      ...(egress ? { egress } : {}),
    },
    // `roomRecord` entra junto de `roomCreate`: sem ela o LiveKit recusa a
    // sala inteira quando o corpo traz egress — e a recusa vira "não foi
    // possível abrir a sala agora" na cara de quem ia entrar.
    { roomCreate: true, roomRecord: !!egress },
  );

  return { sala: nome, gravando: !!egress };
}

/**
 * Fecha as salas cuja janela já passou.
 *
 * Existe porque o teto que o `CreateRoom` parecia ter não existe: `emptyTimeout`
 * é o quanto a sala espera alguém entrar, `departureTimeout` o quanto ela espera
 * depois que o último sai, e nenhum dos dois fecha uma sala que continua tendo
 * gente dentro — ou um cliente reconectando em laço, que é o caso real.
 *
 * O preço está medido no banco. A "All Hands" de 45 minutos ficou aberta dez
 * horas: 998 eventos, `room_started` e `room_finished` 56 vezes cada, 300 ciclos
 * de entrar/sair — um convidado sozinho fez 163. Isso virou 322 e 366 minutos em
 * `Presence.seconds`, que alimenta `attended`, a taxa de presença e o
 * `Deal.attendance`. Com gravação ligada, seriam dez horas faturadas.
 *
 * `consolidar` já para de CONTAR em `endsAt + 30 min`. Isto é a outra metade:
 * depois do mesmo prazo, a sala deixa de EXISTIR — e o laço não tem mais onde
 * acontecer.
 *
 * Varre o que o LiveKit diz estar no ar, e não o que o banco diz que devia
 * estar: sala é recurso do LiveKit, e uma sala órfã (reunião apagada, id que não
 * decodifica) é exatamente a que ninguém vai fechar por outro caminho.
 */
export async function fecharSalasVencidas(agora = new Date()) {
  const resposta = (await chamarLiveKit("livekit.RoomService/ListRooms", {}, { roomList: true })) as {
    rooms?: { name?: string }[];
  };
  const nomes = (resposta.rooms ?? []).map((r) => r.name).filter((n): n is string => !!n);
  if (nomes.length === 0) return { salasNoAr: 0, fechadas: 0, falhas: 0 };

  const comId = nomes.map((nome) => ({ nome, meetingId: reuniaoDaSala(nome) }));
  const ids = comId.map((s) => s.meetingId).filter((id): id is string => !!id);

  const reunioes = await prisma.meeting.findMany({
    where: { id: { in: ids } },
    select: { id: true, endsAt: true },
  });
  const aFechar = salasVencidas(
    comId,
    new Map(reunioes.map((r) => [r.id, r.endsAt])),
    agora,
  );

  let fechadas = 0;
  let falhas = 0;
  for (const nome of aFechar) {
    try {
      // `roomCreate`, e não `roomAdmin`: destruir a sala é do mesmo grupo que
      // criá-la. Com `roomAdmin` o LiveKit responde 401.
      await chamarLiveKit("livekit.RoomService/DeleteRoom", { room: nome }, { roomCreate: true });
      fechadas++;
    } catch (erro) {
      // Uma sala que recusa fechar não pode impedir as outras — e some do log
      // se ninguém contar, que foi como a All Hands passou dez horas despercebida.
      falhas++;
      console.error(`[livekit] não consegui fechar a sala ${nome}:`, erro);
    }
  }

  return { salasNoAr: nomes.length, fechadas, falhas };
}
