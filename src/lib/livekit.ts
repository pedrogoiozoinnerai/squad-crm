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

// As identidades e o nome da sala moram em `lib/identidades`, que não
// depende de `node:crypto` e por isso pode ser lido também pelo navegador.
// Reexportados aqui para que quem já importava de `@/lib/livekit` continue
// funcionando — o servidor quase sempre quer os dois de qualquer forma.
export {
  salaDaReuniao,
  reuniaoDaSala,
  identidadeDoUsuario,
  identidadeDoLead,
  lerIdentidade,
  ehGravador,
  identidadeDeConvidado,
} from "@/lib/identidades";

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
      // Sem isto, `setAttributes` é RECUSADO pelo servidor — e levantar a mão
      // falhava em silêncio: o botão acendia no aparelho de quem clicou e mais
      // ninguém via nada. `attributes` é o canal que replica a mão para a sala
      // inteira, e ele exige esta concessão.
      canUpdateOwnMetadata: true,
      // Só o host administra a sala. Sem isso o lead poderia remover o vendedor.
      roomAdmin: host,
    },
  };

  const semAssinatura = `${base64url(JSON.stringify(cabecalho))}.${base64url(JSON.stringify(corpo))}`;
  return `${semAssinatura}.${assinar(semAssinatura, apiSecret)}`;
}

/**
 * Token de SERVIÇO: não entra em sala nenhuma, autoriza a ADMINISTRAR.
 *
 * É o que assina as chamadas de criar sala e iniciar gravação. Separado do
 * token do participante de propósito: aquele vai para o navegador de um lead,
 * e um token com `roomCreate` no cliente seria a chave do cofre num link.
 *
 * Validade curtíssima — ele nasce, assina uma chamada e morre.
 */
export function tokenDeServico({
  apiKey,
  apiSecret,
  concessoes,
  validadeSegundos = 60,
  agora = new Date(),
}: {
  apiKey: string;
  apiSecret: string;
  concessoes: {
    roomCreate?: boolean;
    roomList?: boolean;
    roomRecord?: boolean;
    roomAdmin?: boolean;
    room?: string;
  };
  validadeSegundos?: number;
  agora?: Date;
}) {
  const emSegundos = Math.floor(agora.getTime() / 1000);
  const cabecalho = { alg: "HS256", typ: "JWT" };
  const corpo = {
    iss: apiKey,
    sub: apiKey,
    nbf: emSegundos - 10,
    exp: emSegundos + validadeSegundos,
    video: concessoes,
  };
  const semAssinatura = `${base64url(JSON.stringify(cabecalho))}.${base64url(JSON.stringify(corpo))}`;
  return `${semAssinatura}.${assinar(semAssinatura, apiSecret)}`;
}

/**
 * A URL de API a partir da de sinalização.
 *
 * `LIVEKIT_URL` é o endereço WebSocket que o navegador usa (`wss://`); as
 * chamadas de servidor vão para o mesmo host em HTTPS. Manter só uma variável
 * de ambiente evita as duas saírem de sincronia — que é o tipo de erro que só
 * aparece quando alguém troca de projeto.
 */
export function urlHttpDoLiveKit(url: string) {
  return url.trim().replace(/^ws(s?):\/\//i, "http$1://").replace(/\/+$/, "");
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
): { evento: EventoDeSala } | { egress: EventoDeEgress } | { erro: string } {
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
  if (evento) return { evento };

  // Os eventos de gravação não trazem `room` — trazem `egressInfo`. Sem este
  // ramo eles caíam em "evento sem campos obrigatórios", a rota respondia 401
  // e o LiveKit reentregava para sempre.
  const egress = normalizarEgress(bruto);
  if (egress) return { egress };

  return { erro: "evento sem campos obrigatórios" };
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

export type EventoDeEgress = {
  id: string;
  tipo: string;
  egressId: string;
  sala: string;
  /// starting | active | ending | complete | failed | aborted
  situacao: string;
  em: Date;
  iniciadoEm: Date | null;
  terminadoEm: Date | null;
  erro: string | null;
  arquivos: { caminho: string; bytes: number; duracaoSegundos: number }[];
};

/**
 * Nanossegundos para Date.
 *
 * O `createdAt` do evento de sala vem em SEGUNDOS; o `startedAt` do egress vem
 * em NANOSSEGUNDOS, como int64 em string. É a mesma armadilha uma casa de
 * grandeza adiante: tratar como milissegundos joga a gravação para 1970 e zera
 * a duração.
 */
function deNanos(valor: unknown): Date | null {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Math.round(n / 1_000_000));
}

/** O JSON de um evento de gravação, no nosso formato. */
export function normalizarEgress(bruto: Record<string, unknown>): EventoDeEgress | null {
  const tipo = typeof bruto.event === "string" ? bruto.event : null;
  const id = typeof bruto.id === "string" ? bruto.id : null;
  const info = bruto.egressInfo as Record<string, unknown> | undefined;
  if (!tipo || !id || !info) return null;

  const egressId = typeof info.egressId === "string" ? info.egressId : null;
  const sala = typeof info.roomName === "string" ? info.roomName : null;
  if (!egressId || !sala) return null;

  // `fileResults` é a forma atual; `file` é a antiga, e gravações começadas
  // antes de uma atualização do LiveKit chegam com ela.
  const brutos = Array.isArray(info.fileResults)
    ? info.fileResults
    : info.file
      ? [info.file]
      : [];

  const arquivos = (brutos as Record<string, unknown>[]).map((f) => ({
    caminho: typeof f.filename === "string" ? f.filename : "",
    bytes: Number(f.size ?? 0) || 0,
    duracaoSegundos: Math.max(0, Math.round((Number(f.duration ?? 0) || 0) / 1_000_000_000)),
  }));

  const segundos = Number(bruto.createdAt);
  return {
    id,
    tipo,
    egressId,
    sala,
    situacao: typeof info.status === "string" ? info.status : "",
    em: Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : new Date(),
    iniciadoEm: deNanos(info.startedAt),
    terminadoEm: deNanos(info.endedAt),
    erro: typeof info.error === "string" && info.error ? info.error : null,
    arquivos,
  };
}
