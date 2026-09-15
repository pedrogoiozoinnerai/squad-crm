import "server-only";

import { env } from "@/lib/env";

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
