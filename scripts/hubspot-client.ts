/**
 * Cliente mínimo da API do HubSpot — só leitura.
 *
 * Não uso SDK: a v3 é REST simples, e uma dependência a menos é uma superfície
 * a menos. O que importa aqui é paginar direito e respeitar o rate limit
 * (429), porque a migração puxa milhares de registros de uma vez.
 */
import { env } from "../src/lib/env";

const BASE = "https://api.hubapi.com";

function token() {
  const t = env("HUBSPOT_ACCESS_TOKEN");
  if (!t) {
    throw new Error(
      "HUBSPOT_ACCESS_TOKEN não configurado.\n\n" +
        "  HubSpot → Desenvolvimento → Chaves → Chaves de serviço → Criar chave.\n" +
        "  Escopos de leitura: contacts, deals, companies, owners, notes e schemas.\n" +
        "  Exige ser super admin, ou ter 'Developer tools access' nas permissões.\n\n" +
        "  A chave começa com pat-na1- e vai no .env deste projeto.\n" +
        "  Aplicativo privado antigo também serve — mesma API, mesmo header.",
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

/**
 * Confere acesso antes de qualquer trabalho pesado.
 *
 * A introspecção (`/oauth/v1/access-tokens`) só existe para token de aplicativo
 * privado; chave de serviço não a tem. Então, em vez de perguntar quais escopos
 * existem, a gente TENTA ler um registro de cada objeto. Vale para os dois tipos
 * de credencial e é mais honesto: escopo concedido no painel e leitura que de
 * fato funciona nem sempre são a mesma coisa.
 */
export async function verificarAcesso() {
  const info = await req<{ user?: string; hub_id?: number; scopes?: string[] }>(
    `/oauth/v1/access-tokens/${token()}`,
  ).catch(() => null);

  const alvos: { rotulo: string; path: string; escopo: string }[] = [
    { rotulo: "contatos", path: "/crm/v3/objects/contacts?limit=1", escopo: "crm.objects.contacts.read" },
    { rotulo: "negócios", path: "/crm/v3/objects/deals?limit=1", escopo: "crm.objects.deals.read" },
    { rotulo: "empresas", path: "/crm/v3/objects/companies?limit=1", escopo: "crm.objects.companies.read" },
    { rotulo: "responsáveis", path: "/crm/v3/owners?limit=1", escopo: "crm.objects.owners.read" },
    { rotulo: "anotações", path: "/crm/v3/objects/notes?limit=1", escopo: "crm.objects.notes.read" },
    { rotulo: "propriedades", path: "/crm/v3/properties/contacts?limit=1", escopo: "crm.schemas.contacts.read" },
  ];

  const leituras = [];
  for (const alvo of alvos) {
    try {
      await req(alvo.path);
      leituras.push({ ...alvo, ok: true, erro: "" });
    } catch (e) {
      leituras.push({ ...alvo, ok: false, erro: (e as Error).message.slice(0, 70) });
    }
  }
  return { info, leituras };
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

/** Busca paginada com filtro — a API de search aceita o que a de listagem não. */
export async function* buscar(
  objeto: "contacts" | "deals",
  filtros: { propertyName: string; operator: string; value: string }[],
  propriedades: string[],
): AsyncGenerator<HsObject[]> {
  let after: string | undefined;
  do {
    const page = await req<{ results: HsObject[]; paging?: { next?: { after: string } } }>(
      `/crm/v3/objects/${objeto}/search`,
      {
        method: "POST",
        body: JSON.stringify({ limit: 100, after, filterGroups: [{ filters: filtros }], properties: propriedades }),
      },
    );
    yield page.results;
    after = page.paging?.next?.after;
  } while (after);
}

/**
 * Lê objetos por id, 100 por chamada.
 *
 * Buscar um a um seria 7.500 chamadas para os contatos do Squad — meia hora de
 * espera e um teto de rate limit. Em lote são 75.
 */
/** Objetos do CRM que esta migração lê. */
export type Objeto = "contacts" | "deals" | "companies" | "notes" | "tasks" | "meetings";

export async function lote(
  objeto: Objeto,
  ids: string[],
  propriedades: string[],
): Promise<HsObject[]> {
  const saida: HsObject[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await req<{ results: HsObject[] }>(`/crm/v3/objects/${objeto}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties: propriedades, inputs: ids.slice(i, i + 100).map((id) => ({ id })) }),
    });
    saida.push(...(r.results ?? []));
  }
  return saida;
}

/** Associações em lote: id de origem → ids de destino. */
export async function associacoes(
  de: Objeto,
  para: Objeto,
  ids: string[],
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await req<{
      results: { from: { id: string }; to: { toObjectId: string | number }[] }[];
    }>(`/crm/v4/associations/${de}/${para}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: ids.slice(i, i + 100).map((id) => ({ id })) }),
    });
    for (const res of r.results ?? []) {
      mapa.set(res.from.id, (res.to ?? []).map((t) => String(t.toObjectId)));
    }
  }
  return mapa;
}
