import { config } from "dotenv";

import { randomBytes } from "node:crypto";
import { Client } from "pg";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * Uma sala aberta agora, em `crm_dev`, para olhar a tela de verdade.
 *
 * A sala só abre dentro da janela da reunião, então não dá para abrir uma
 * qualquer da agenda e ver como ficou: quase todas ou ainda não começaram ou já
 * terminaram. Este script cria (ou reaproveita) uma reunião que começou há
 * cinco minutos e imprime os três endereços — os três jeitos de entrar.
 *
 *   npm run sala:teste
 */

const SCHEMA = process.env.DB_SCHEMA ?? "";
if (!SCHEMA.endsWith("_dev")) {
  console.error(`✗ DB_SCHEMA="${SCHEMA}" — este script só roda em _dev.`);
  process.exit(1);
}

const TITULO = "Sala de teste — visual";

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();

  const dono = await c.query<{ id: string }>(
    `select id from "${SCHEMA}"."User" where "claimedAt" is not null order by "createdAt" limit 1`,
  );
  if (!dono.rowCount) throw new Error(`Nenhuma conta assumida em ${SCHEMA}.`);

  // `startsAt` é `timestamp without time zone` guardando UTC — e o `pg`
  // serializa um `Date` no fuso do PROCESSO, não em UTC. Passar o objeto direto
  // grava 19:03 onde deveria estar 22:03, e a sala nasce "já terminada". Daí o
  // texto em UTC, sem fuso nenhum na string.
  const emUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  const comecou = emUtc(Date.now() - 5 * 60_000);
  const termina = emUtc(Date.now() + 55 * 60_000);

  const existente = await c.query<{ id: string; guestToken: string }>(
    `select id, "guestToken" from "${SCHEMA}"."Meeting" where title = $1 limit 1`,
    [TITULO],
  );

  let id: string;
  let guestToken: string;

  if (existente.rowCount) {
    ({ id, guestToken } = existente.rows[0]);
    await c.query(
      `update "${SCHEMA}"."Meeting"
          set "startsAt" = $1, "endsAt" = $2, status = 'SCHEDULED' where id = $3`,
      [comecou, termina, id],
    );
  } else {
    guestToken = randomBytes(24).toString("hex");
    const nova = await c.query<{ id: string }>(
      `insert into "${SCHEMA}"."Meeting"
         (id, "createdAt", "updatedAt", title, "startsAt", "endsAt", type, status, "guestToken", "ownerId")
       values (gen_random_uuid()::text, now(), now(), $1, $2, $3, 'GROUP', 'SCHEDULED', $4, $5)
       returning id`,
      [TITULO, comecou, termina, guestToken, dono.rows[0].id],
    );
    id = nova.rows[0].id;
  }

  console.log(`\nSala aberta até ${termina} (UTC)\n`);
  console.log(`  vendedor (precisa estar logado):  http://localhost:3000/sala/${id}`);
  console.log(`  convidado pelo link:              http://localhost:3000/entrar/${guestToken}\n`);

  await c.end();
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
