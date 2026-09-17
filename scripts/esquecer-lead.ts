import { config } from "dotenv";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * Apaga os dados de uma pessoa a pedido dela.
 *
 * Script, e não botão na tela, de propósito: é irreversível, é raro, e o caso
 * que ele NÃO resolve sozinho precisa de uma pessoa lendo a resposta.
 *
 * O que faz: apaga as anotações sobre o lead, as mensagens que ele escreveu no
 * chat das salas, a presença dele, e a gravação das reuniões 1:1 em que ele era
 * a única pessoa de fora.
 *
 * O que NÃO faz, e diz: a gravação de uma sessão COLETIVA. O arquivo contém
 * trinta pessoas, e apagá-lo a pedido de uma destrói o material das outras
 * vinte e nove — inclusive de quem comprou. Não existe resposta técnica para
 * isso; o script conta quantas são para a decisão ser tomada com o tamanho do
 * problema à vista.
 *
 *   npx tsx scripts/esquecer-lead.ts <leadId>
 *   npx tsx scripts/esquecer-lead.ts <leadId> --confirmar
 */

const leadId = process.argv[2];
const confirmado = process.argv.includes("--confirmar");

if (!leadId) {
  console.error("Uso: npx tsx scripts/esquecer-lead.ts <leadId> [--confirmar]");
  process.exit(1);
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { esquecerLead } = await import("../src/lib/retencao");

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { name: true, email: true, phone: true },
  });
  if (!lead) {
    console.error(`✗ Lead ${leadId} não existe.`);
    process.exit(1);
  }

  console.log(`Lead: ${lead.name} · ${lead.email ?? "sem e-mail"} · ${lead.phone ?? "sem telefone"}`);
  console.log(`Schema: ${process.env.DB_SCHEMA}`);

  if (!confirmado) {
    // Uma chamada sem `--confirmar` não apaga nada. O engano de digitar o id
    // errado só é reversível antes de apertar.
    console.log("\nNada foi apagado. Rode de novo com --confirmar para executar.");
    process.exit(0);
  }

  const r = await esquecerLead(leadId);

  console.log("\n— apagado —");
  console.log(`  anotações:           ${r.anotacoes}`);
  console.log(`  mensagens no chat:   ${r.mensagens}`);
  console.log(`  presenças:           ${r.presencas}`);
  console.log(`  gravações 1:1:       ${r.gravacoesApagadas}`);

  if (r.coletivasPendentes > 0) {
    console.log(
      `\n⚠ ${r.coletivasPendentes} ${r.coletivasPendentes === 1 ? "gravação de sessão COLETIVA" : "gravações de sessões COLETIVAS"} NÃO ${r.coletivasPendentes === 1 ? "foi apagada" : "foram apagadas"}.\n` +
        "  Cada arquivo tem outras pessoas dentro. Apagar a pedido de uma destrói o\n" +
        "  material das outras — inclusive de quem comprou. Não é decisão do script.",
    );
  }

  console.log(
    "\nO registro do Lead em si NÃO foi removido: ele é a chave do negócio, da\n" +
      "reunião e do histórico comercial. Se a exclusão precisa alcançá-lo, isso é\n" +
      "outra decisão — e outra conversa com quem responde por privacidade.",
  );
}

main()
  .catch((erro) => {
    console.error("\n✗", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  })
  .then(() => process.exit(0));
