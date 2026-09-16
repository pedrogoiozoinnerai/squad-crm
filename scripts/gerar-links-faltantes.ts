import "dotenv/config";

import { randomBytes } from "node:crypto";
import { Client } from "pg";

/**
 * Dá link às reuniões que nasceram antes de o link existir.
 *
 * `Meeting.guestToken` é anulável porque as reuniões antigas não têm um, e
 * preencher todas de uma vez criaria milhares de endereços válidos para salas
 * que ninguém vai abrir. Este script preenche só o que ainda vai acontecer.
 *
 * Roda uma vez por ambiente, depois da migração:
 *
 *   DB_SCHEMA=crm_dev npm run links:faltantes
 *   DB_SCHEMA=crm npm run links:faltantes -- --producao
 */
async function main() {
  const schema = process.env.DB_SCHEMA ?? "";
  if (!schema.endsWith("_dev") && !process.argv.includes("--producao")) {
    throw new Error(`Recusando rodar em "${schema}" sem --producao.`);
  }

  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();

  try {
    const alvos = await c.query<{ id: string }>(
      `SELECT id FROM "${schema}"."Meeting"
        WHERE "guestToken" IS NULL AND "endsAt" >= now() AND status <> 'CANCELED'`,
    );

    for (const { id } of alvos.rows) {
      await c.query(`UPDATE "${schema}"."Meeting" SET "guestToken" = $1 WHERE id = $2`, [
        randomBytes(32).toString("hex"),
        id,
      ]);
    }

    console.log(`✓ link gerado para ${alvos.rowCount} reuniões futuras em ${schema}`);
  } finally {
    await c.end();
  }
}

main().catch((erro) => {
  console.error("✗", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
