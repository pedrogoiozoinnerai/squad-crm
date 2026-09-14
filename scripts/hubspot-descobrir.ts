import "dotenv/config";

import { contar, listar, owners, pipelines, propriedadesDe, verificarAcesso } from "./hubspot-client";

/**
 * Passo 1 da migração: DESCOBRIR a conta antes de tocar em qualquer dado.
 *
 * Toda conta de HubSpot é diferente — pipelines, etapas e propriedades
 * customizadas são únicos de cada operação. Mapear no escuro produz migração
 * silenciosamente errada. Este script só lê e imprime; não escreve nada,
 * nem no HubSpot nem no CRM.
 *
 *   npx tsx scripts/hubspot-descobrir.ts
 */
async function main() {
  console.log("\n═══ ACESSO ═══");
  const acesso = await verificarAcesso();
  if (acesso) {
    console.log(`  hub ${acesso.hub_id ?? "?"} · usuário ${acesso.user ?? "?"}`);
    const faltando = [
      "crm.objects.contacts.read",
      "crm.objects.deals.read",
      "crm.objects.companies.read",
      "crm.objects.owners.read",
    ].filter((s) => acesso.scopes && !acesso.scopes.includes(s));
    console.log(
      faltando.length
        ? `  ⚠ escopos faltando: ${faltando.join(", ")}`
        : "  ✓ escopos de leitura presentes",
    );
  }

  console.log("\n═══ VOLUME ═══");
  for (const o of ["contacts", "deals", "companies"] as const) {
    try {
      console.log(`  ${o.padEnd(10)} ${await contar(o)}`);
    } catch (e) {
      console.log(`  ${o.padEnd(10)} — (${(e as Error).message.slice(0, 60)})`);
    }
  }

  console.log("\n═══ PIPELINES E ETAPAS ═══");
  console.log("  (é o de-para com a tabela Stage do CRM)\n");
  for (const p of await pipelines("deals")) {
    console.log(`  ▸ ${p.label}  [${p.id}]`);
    for (const s of p.stages.sort((a, b) => a.displayOrder - b.displayOrder)) {
      const prob = s.metadata?.probability;
      const fechado = s.metadata?.isClosed === "true" ? " · FECHADA" : "";
      console.log(`      ${String(s.displayOrder).padStart(2)}. ${s.label.padEnd(28)} ${s.id}${fechado}${prob ? ` · prob ${prob}` : ""}`);
    }
    console.log();
  }

  console.log("═══ RESPONSÁVEIS ═══");
  console.log("  (viram User no CRM; e-mail é a chave)\n");
  for (const o of await owners()) {
    if (o.archived) continue;
    console.log(`  ${(`${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() || "(sem nome)").padEnd(26)} ${o.email}`);
  }

  console.log("\n═══ PROPRIEDADES CUSTOMIZADAS ═══");
  console.log("  (as padrão eu já mapeio; estas precisam da sua decisão)\n");
  for (const objeto of ["contacts", "deals"] as const) {
    const props = await propriedadesDe(objeto);
    const custom = props.filter(
      (p) => !p.name.startsWith("hs_") && !PADRAO[objeto].includes(p.name),
    );
    console.log(`  ▸ ${objeto} — ${custom.length} customizadas de ${props.length}`);
    for (const p of custom.slice(0, 40)) {
      console.log(`      ${p.name.padEnd(34)} ${p.type.padEnd(10)} ${p.label}`);
    }
    if (custom.length > 40) console.log(`      … e mais ${custom.length - 40}`);
    console.log();
  }

  await conferirFormato();

  console.log("Nada foi escrito. Me mande esta saída e eu monto o de-para.\n");
}

/** Teto de negócios varridos; acima disso a amostra já responde as perguntas. */
const TETO = 5000;

/**
 * As três perguntas que o NOSSO schema obriga a responder antes de importar.
 * Nenhuma delas se responde olhando o HubSpot isolado — só confrontando os
 * dois modelos. Por isso elas vivem aqui, e não na cabeça de alguém.
 */
async function conferirFormato() {
  console.log("═══ O QUE O NOSSO MODELO EXIGE DECIDIR ═══\n");

  const porContato = new Map<string, number>();
  let negocios = 0;
  let semDono = 0;
  let semContato = 0;
  let cortou = false;

  for await (const pagina of listar("deals", ["dealname", "hubspot_owner_id"], ["contacts"])) {
    for (const d of pagina) {
      if (negocios >= TETO) { cortou = true; break; }
      negocios++;
      if (!d.properties.hubspot_owner_id) semDono++;
      const contatos = d.associations?.contacts?.results ?? [];
      if (contatos.length === 0) semContato++;
      for (const c of contatos) porContato.set(c.id, (porContato.get(c.id) ?? 0) + 1);
    }
    if (cortou) break;
  }

  const multiplos = [...porContato.values()].filter((n) => n > 1).length;
  const maior = Math.max(0, ...porContato.values());

  console.log(`  negócios examinados      ${negocios}${cortou ? ` (parei no teto de ${TETO})` : ""}`);
  console.log(`  contatos distintos       ${porContato.size}`);
  console.log();
  console.log(`  ▸ contatos com mais de um negócio: ${multiplos}${maior > 1 ? ` (o maior tem ${maior})` : ""}`);
  console.log(`      Deal.leadId é @unique no nosso schema: hoje é UM negócio por lead.`);
  console.log(
    multiplos === 0
      ? "      ✓ nenhum caso — a restrição não atrapalha, importo direto."
      : "      ⚠ decisão sua: afrouxar para 1:N (mexe na UI) ou importar o mais\n" +
        "        recente e anexar os outros como anotação no lead.",
  );
  console.log();
  console.log(`  ▸ negócios sem responsável: ${semDono}`);
  console.log(`      Deal.ownerId é obrigatório aqui.`);
  console.log(
    semDono === 0
      ? "      ✓ nenhum caso."
      : "      ⚠ decisão sua: a quem atribuir — um usuário 'Sem dono' ou você.",
  );
  console.log();
  console.log(`  ▸ negócios sem contato associado: ${semContato}`);
  console.log(`      Deal exige Lead aqui; negócio órfão não tem onde entrar.`);
  console.log(
    semContato === 0
      ? "      ✓ nenhum caso."
      : "      ⚠ decisão sua: criar um lead a partir do nome do negócio, ou pular.",
  );
  console.log();
}

/** Propriedades nativas que já sei mapear sem perguntar. */
const PADRAO: Record<string, string[]> = {
  contacts: [
    "firstname","lastname","email","phone","mobilephone","company","jobtitle",
    "website","industry","lifecyclestage","createdate","lastmodifieddate",
    "hubspot_owner_id","city","state","country","numemployees","annualrevenue",
  ],
  deals: [
    "dealname","amount","dealstage","pipeline","closedate","createdate",
    "hubspot_owner_id","dealtype","description","hs_lastmodifieddate",
    "closed_lost_reason","closed_won_reason","amount_in_home_currency",
  ],
};

main().catch((e) => {
  console.error("\n✗", e.message, "\n");
  process.exit(1);
});
