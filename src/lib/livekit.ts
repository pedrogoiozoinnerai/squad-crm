import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * LiveKit sem SDK.
 *
 * O token de acesso e a assinatura do webhook são os dois JWT HS256 — é o
 * mesmo caminho que já tomamos no OAuth do Google: a biblioteca traria uma
 * árvore de dependências inteira para gerar e conferir duas assinaturas de
 * quarenta linhas. E aqui tudo é função pura, então dá para testar de verdade
 * em vez de confiar.
 *
 * Nenhuma função deste arquivo lê `process.env` nem toca no banco: as chaves
 * entram por parâmetro. É o que permite os testes rodarem sem ambiente.
 */

function base64url(valor: Buffer | string) {
  return Buffer.from(valor)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function assinar(conteudo: string, segredo: string) {
  return base64url(createHmac("sha256", segredo).update(conteudo).digest());
}

function igualSemVazarTempo(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * O nome da sala no LiveKit — uma por REUNIÃO, não uma por vendedor.
 *
 * O CRM de referência usa sala fixa por closer (`closer-<uuid>`). Fica um link
 * estável, mas obriga a descobrir a qual reunião cada entrada pertence
 * comparando horários, e aí presença virou palpite: são 1.028 participações
 * esperando reprocessamento manual do lado deles.
 *
 * Com uma sala por reunião a atribuição é chave estrangeira, não janela de
 * tempo. Nenhuma ambiguidade quando a call atrasa, emenda ou vira outra.
 */
export function salaDaReuniao(meetingId: string) {
  return `reuniao-${meetingId}`;
}

export function reuniaoDaSala(sala: string) {
  return sala.startsWith("reuniao-") ? sala.slice("reuniao-".length) : null;
}

/**
 * A identidade carrega de quem ela é.
 *
 * Sem prefixo, o evento de entrada traz um id solto e alguém precisa adivinhar
 * se é vendedor ou lead — e um id de lead que colide com um de usuário
 * atribuiria presença à pessoa errada.
 */
export function identidadeDoUsuario(userId: string) {
  return `u_${userId}`;
}

export function identidadeDoLead(leadId: string) {
  return `l_${leadId}`;
}

export function lerIdentidade(identidade: string) {
  if (identidade.startsWith("u_")) return { tipo: "usuario" as const, id: identidade.slice(2) };
  if (identidade.startsWith("l_")) return { tipo: "lead" as const, id: identidade.slice(2) };
  return { tipo: "desconhecido" as const, id: identidade };
}

export type Concessao = {
  apiKey: string;
  apiSecret: string;
  sala: string;
  identidade: string;
  nome: string;
  /// Host controla a sala: silenciar e remover participante. É o vendedor.
  host?: boolean;
  /// Segundos de validade. Curto de propósito — o token abre uma sala de
  /// reunião, e quem recebe o link não deveria poder voltar nela na semana
  /// seguinte.
  validadeSegundos?: number;
  agora?: Date;
};

/** Token de acesso do participante. JWT HS256, no formato que o LiveKit espera. */
export function tokenDeAcesso({
  apiKey,
  apiSecret,
  sala,
  identidade,
  nome,
  host = false,
  validadeSegundos = 60 * 60 * 4,
  agora = new Date(),
}: Concessao) {
  const emSegundos = Math.floor(agora.getTime() / 1000);

  const cabecalho = { alg: "HS256", typ: "JWT" };
  const corpo = {
    iss: apiKey,
    sub: identidade,
    // 10s de folga para trás: relógio de servidor não bate com o do LiveKit ao
    // segundo, e um `nbf` no futuro faz o token ser recusado na hora de entrar.
    nbf: emSegundos - 10,
    exp: emSegundos + validadeSegundos,
    name: nome,
    video: {
      room: sala,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Só o host administra a sala. Sem isso o lead poderia remover o vendedor.
      roomAdmin: host,
    },
  };

  const semAssinatura = `${base64url(JSON.stringify(cabecalho))}.${base64url(JSON.stringify(corpo))}`;
  return `${semAssinatura}.${assinar(semAssinatura, apiSecret)}`;
}

export type EventoDeSala = {
  id: string;
  tipo: string;
  sala: string;
  em: Date;
  identidade: string | null;
  nome: string | null;
};

/**
 * Confere a assinatura do webhook e devolve o evento.
 *
 * O LiveKit manda o corpo cru e um JWT no `Authorization`. O JWT carrega o
 * SHA-256 do corpo: é isso que amarra a assinatura ao conteúdo. Conferir só a
 * assinatura do token deixaria passar um corpo trocado com um token válido
 * capturado antes.
 *
 * Devolve `{ erro }` em vez de lançar — quem chama responde 401 e registra,
 * e exceção ali viraria 500 num endpoint que estranhos vão sondar.
 */
export function lerWebhook(
  corpoCru: string,
  autorizacao: string | null,
  apiKey: string,
  apiSecret: string,
  agora = new Date(),
): { evento: EventoDeSala } | { erro: string } {
  if (!autorizacao) return { erro: "sem cabeçalho Authorization" };

  const token = autorizacao.replace(/^Bearer\s+/i, "").trim();
  const partes = token.split(".");
  if (partes.length !== 3) return { erro: "token malformado" };

  const [cabecalho, corpo, assinatura] = partes;
  if (!igualSemVazarTempo(assinar(`${cabecalho}.${corpo}`, apiSecret), assinatura)) {
    return { erro: "assinatura inválida" };
  }

  let reivindicacoes: Record<string, unknown>;
  try {
    reivindicacoes = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
  } catch {
    return { erro: "corpo do token ilegível" };
  }

  if (reivindicacoes.iss !== apiKey) return { erro: "emissor desconhecido" };

  const emSegundos = Math.floor(agora.getTime() / 1000);
  const exp = Number(reivindicacoes.exp);
  if (Number.isFinite(exp) && exp < emSegundos) return { erro: "token expirado" };

  // O `sha256` amarra o token a ESTE corpo.
  const esperado = reivindicacoes.sha256;
  if (typeof esperado !== "string") return { erro: "token sem hash do corpo" };
  const calculado = createHash("sha256").update(corpoCru).digest("base64");
  if (!igualSemVazarTempo(calculado, esperado)) return { erro: "corpo não confere com a assinatura" };

  let bruto: Record<string, unknown>;
  try {
    bruto = JSON.parse(corpoCru);
  } catch {
    return { erro: "corpo não é JSON" };
  }

  const evento = normalizarEvento(bruto);
  return evento ? { evento } : { erro: "evento sem campos obrigatórios" };
}

/**
 * Do JSON do LiveKit para o nosso formato.
 *
 * `createdAt` vem em SEGUNDOS e como string. Tratar como milissegundos joga
 * todo evento para 1970 e a presença calculada some.
 */
export function normalizarEvento(bruto: Record<string, unknown>): EventoDeSala | null {
  const tipo = typeof bruto.event === "string" ? bruto.event : null;
  const sala = (bruto.room as { name?: string } | undefined)?.name;
  const id = typeof bruto.id === "string" ? bruto.id : null;
  if (!tipo || !sala || !id) return null;

  const segundos = Number(bruto.createdAt);
  const em = Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : new Date();

  const participante = bruto.participant as { identity?: string; name?: string } | undefined;

  return {
    id,
    tipo,
    sala,
    em,
    identidade: participante?.identity ?? null,
    nome: participante?.name ?? null,
  };
}
