/**
 * Cliente mínimo da API do HubSpot — só leitura.
 *
 * Não uso SDK: a v3 é REST simples, e uma dependência a menos é uma superfície
 * a menos. O que importa aqui é paginar direito e respeitar o rate limit
 * (429), porque a migração puxa milhares de registros de uma vez.
 */
const BASE = "https://api.hubapi.com";

function token() {
  const t = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      "HUBSPOT_ACCESS_TOKEN não configurado.\n" +
        "  HubSpot → Settings → Integrations → Private Apps → Create,\n" +
        "  com escopos de leitura de contacts, deals, companies, owners e schemas.",
    );
  }
  return t;
}

async function req<T>(path: string, init?: RequestInit, tentativa = 0): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  // 429 = rate limit. O HubSpot devolve quando esperar; respeitar é mais rápido
  // que apanhar de novo.
  if (res.status === 429 && tentativa < 5) {
    const espera = Number(res.headers.get("Retry-After") ?? 1) * 1000 || 2 ** tentativa * 500;
    await new Promise((r) => setTimeout(r, espera));
    return req<T>(path, init, tentativa + 1);
  }

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(`HubSpot ${res.status} em ${path}: ${corpo.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export type HsObject = {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<string, { results: { id: string; type: string }[] }>;
};

/** Percorre todas as páginas de um objeto CRM, 100 por vez. */
export async function* listar(
  objeto: "contacts" | "deals" | "companies",
  propriedades: string[],
  associacoes: string[] = [],
): AsyncGenerator<HsObject[]> {
  let after: string | undefined;

  do {
    const qs = new URLSearchParams({ limit: "100" });
    qs.set("properties", propriedades.join(","));
    if (associacoes.length) qs.set("associations", associacoes.join(","));
    if (after) qs.set("after", after);

    const page = await req<{ results: HsObject[]; paging?: { next?: { after: string } } }>(
      `/crm/v3/objects/${objeto}?${qs}`,
    );
    yield page.results;
    after = page.paging?.next?.after;
  } while (after);
}

export async function propriedadesDe(objeto: string) {
  const r = await req<{ results: { name: string; label: string; type: string; fieldType: string }[] }>(
    `/crm/v3/properties/${objeto}`,
  );
  return r.results;
}

export async function pipelines(objeto: "deals" | "tickets" = "deals") {
  const r = await req<{
    results: {
      id: string; label: string;
      stages: { id: string; label: string; displayOrder: number; metadata?: Record<string, string> }[];
    }[];
  }>(`/crm/v3/pipelines/${objeto}`);
  return r.results;
}

export async function owners() {
  const r = await req<{
    results: { id: string; email: string; firstName?: string; lastName?: string; archived: boolean }[];
  }>(`/crm/v3/owners?limit=100`);
  return r.results;
}

/** Confere token e escopos antes de qualquer trabalho pesado. */
export async function verificarAcesso() {
  const info = await req<{ user?: string; hub_id?: number; scopes?: string[] }>(
    `/oauth/v1/access-tokens/${token()}`,
  ).catch(() => null);
  return info;
}

export async function contar(objeto: "contacts" | "deals" | "companies") {
  const r = await req<{ total: number }>(`/crm/v3/objects/${objeto}?limit=1`).then(
    () => req<{ total: number }>(`/crm/v3/objects/${objeto}/search`, {
      method: "POST",
      body: JSON.stringify({ limit: 1, filterGroups: [] }),
    }),
  );
  return r.total;
}
