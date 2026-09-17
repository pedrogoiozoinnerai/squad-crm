import "server-only";

import { env } from "@/lib/env";
import type { DestinoS3 } from "@/lib/gravacao";

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
 */
export function chavesDoArmazenamento(): DestinoS3 | null {
  const bucket = env("STORAGE_BUCKET");
  const endpoint = env("STORAGE_ENDPOINT");
  const accessKey = env("STORAGE_ACCESS_KEY");
  const secret = env("STORAGE_SECRET_KEY");
  if (!bucket || !endpoint || !accessKey || !secret) return null;

  return {
    bucket,
    endpoint,
    accessKey,
    secret,
    regiao: env("STORAGE_REGION", "sa-east-1")!,
  };
}

export function armazenamentoConfigurado() {
  return chavesDoArmazenamento() !== null;
}
