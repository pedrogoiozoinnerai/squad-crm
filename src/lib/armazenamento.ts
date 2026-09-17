import "server-only";

import { env } from "@/lib/env";
import { baseRest, type DestinoS3 } from "@/lib/gravacao";

/**
 * O bucket onde as gravações ficam.
 *
 * Mesma forma de `chavesDoLiveKit`: devolve `null` quando não está
 * configurado, em vez de lançar. Sem bucket, o CRM inteiro continua
 * funcionando — só a gravação é que não acontece, e a tela diz isso em vez de
 * quebrar.
 *
 * É Supabase Storage pelo endpoint S3-compatível, e não pela biblioteca:
 * `forcePathStyle` faz o LiveKit escrever DIRETO no bucket, sem o arquivo de
 * 550 MB passar por uma função da Vercel — que tem teto de 4,5 MB de corpo e
 * 60 segundos de execução.
 *
 * São DUAS credenciais e elas fazem coisas diferentes: o par S3 é o que o
 * LiveKit usa para ESCREVER, e a chave de serviço é a que nós usamos para
 * assinar e apagar. As cinco andam juntas na guarda porque um bucket que só
 * aceita escrita guarda gravações que ninguém consegue assistir.
 */
export type Armazenamento = DestinoS3 & {
  /// Chave `service_role` do Supabase. Nunca sai do servidor: ela abre o
  /// storage inteiro, não só este bucket.
  servico: string;
};

export function chavesDoArmazenamento(): Armazenamento | null {
  const bucket = env("STORAGE_BUCKET");
  const endpoint = env("STORAGE_ENDPOINT");
  const accessKey = env("STORAGE_ACCESS_KEY");
  const secret = env("STORAGE_SECRET_KEY");
  const servico = env("STORAGE_SERVICE_KEY");
  if (!bucket || !endpoint || !accessKey || !secret || !servico) return null;

  return { bucket, endpoint, accessKey, secret, servico, regiao: env("STORAGE_REGION", "sa-east-1")! };
}

export function armazenamentoConfigurado() {
  return chavesDoArmazenamento() !== null;
}

/// Quanto tempo a URL de uma gravação vale.
///
/// Uma hora: dá para assistir uma call inteira sem a URL vencer no meio, e é
/// curto o bastante para um link copiado do endereço e colado num grupo não
/// virar acesso permanente ao vídeo de um cliente.
export const VALIDADE_DA_URL_S = 60 * 60;

/**
 * Uma URL temporária para assistir.
 *
 * Pela REST e não por SigV4 assinado à mão. É uma exceção consciente à regra
 * que este projeto segue com o LiveKit — lá são quarenta linhas de HMAC bem
 * entendidas; presignar S3 corretamente é bem mais fiddly, e o sintoma de um
 * detalhe errado é um 403 que só aparece quando alguém tenta ver a gravação.
 *
 * Nunca guardada: uma URL assinada guardada no banco é uma chave guardada no
 * banco. Ela nasce no clique e morre em uma hora.
 */
export async function urlParaAssistir(caminho: string): Promise<string | null> {
  const chaves = chavesDoArmazenamento();
  if (!chaves) return null;

  const base = baseRest(chaves.endpoint);
  const resposta = await fetch(`${base}/object/sign/${chaves.bucket}/${caminho}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${chaves.servico}`,
    },
    body: JSON.stringify({ expiresIn: VALIDADE_DA_URL_S }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    console.error(`[armazenamento] assinar falhou: ${resposta.status} ${detalhe.slice(0, 200)}`);
    return null;
  }

  const corpo = (await resposta.json()) as { signedURL?: string };
  if (!corpo.signedURL) return null;
  // A REST devolve o caminho relativo (`/object/sign/...`), não a URL inteira.
  return `${base}${corpo.signedURL.startsWith("/") ? "" : "/"}${corpo.signedURL}`;
}

/**
 * Apaga o arquivo do bucket.
 *
 * Devolve se conseguiu, em vez de lançar: quem chama é a retenção, e uma falha
 * de rede não pode fazer a varredura parar no terceiro arquivo e deixar os
 * outros noventa para sempre. O `Recording` só é marcado como apagado quando
 * isto responde `true` — senão a linha mentiria sobre um arquivo que continua lá.
 */
export async function apagarDoBucket(caminho: string): Promise<boolean> {
  const chaves = chavesDoArmazenamento();
  if (!chaves) return false;

  const resposta = await fetch(`${baseRest(chaves.endpoint)}/object/${chaves.bucket}/${caminho}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${chaves.servico}` },
    signal: AbortSignal.timeout(10_000),
  }).catch((erro) => {
    console.error("[armazenamento] apagar não respondeu:", erro);
    return null;
  });

  // 404 conta como sucesso: o arquivo não está mais lá, que é o objetivo.
  // Tratar como falha faria a retenção tentar para sempre um arquivo que
  // alguém já removeu do painel.
  return !!resposta && (resposta.ok || resposta.status === 404);
}
