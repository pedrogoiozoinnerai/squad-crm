/**
 * Os campos do contato que a importação pedia no nome errado.
 *
 * Mesmo defeito da atribuição, noutra roupa: a importação pedia `jobtitle`,
 * `company` e `phone` — os nomes nativos do HubSpot — e esta operação preenche
 * outros. Medido nos contatos DO SQUAD, não do portal inteiro, que foi o erro
 * que me custou uma conclusão invertida:
 *
 * | o que o CRM tem | o que o HubSpot tem |
 * |---|---|
 * | `jobTitle` em 3% | `cargo` em 46% ("Sócio ou Fundador") |
 * | `company` em 36% | `company_name` em 46% ("Turstar") |
 * | `phone` em 75% | `hs_whatsapp_phone_number` 90%, `whatsapp_phone__original` 98% |
 *
 * Nenhum deles SUBSTITUI o nativo: são reserva. Onde o campo do HubSpot estiver
 * preenchido, ele vence; onde não, o customizado entra. Inverter isso trocaria
 * um dado verificado por um digitado à mão em formulário.
 *
 * Puro — a ordem de preferência é a decisão inteira, e ela cabe num teste.
 */

/// As propriedades que a importação precisa PEDIR, além das nativas.
export const PROPS_CONTATO_EXTRA = [
  "cargo",
  "company_name",
  "hs_whatsapp_phone_number",
  "whatsapp_phone__original",
  "country",
  "lifecyclestage",
] as const;

export type CamposDoContato = {
  phone: string | null;
  jobTitle: string | null;
  company: string | null;
};

/// Os mesmos falsos-nulos da atribuição: exportação de CRM traz "null" como
/// texto, e sem peneira ele vira o cargo da pessoa.
const FALSOS = new Set(["null", "undefined", "nil", "n/a", "-"]);

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || FALSOS.has(s.toLowerCase())) return null;
  return s;
}

/**
 * Telefone, na ordem em que se confia nele.
 *
 * `phone` e `mobilephone` são os campos que um vendedor digita olhando para a
 * pessoa. Os de WhatsApp vêm de integração e estão muito mais preenchidos —
 * mas são o número que a automação capturou, não necessariamente o que o time
 * usa. Por isso entram DEPOIS, e só quando não há nada.
 */
export function lerContato(props: Record<string, unknown> | null | undefined): CamposDoContato {
  if (!props) return { phone: null, jobTitle: null, company: null };

  return {
    phone:
      texto(props.phone) ??
      texto(props.mobilephone) ??
      texto(props.hs_whatsapp_phone_number) ??
      texto(props.whatsapp_phone__original),
    jobTitle: texto(props.jobtitle) ?? texto(props.cargo),
    company: texto(props.company) ?? texto(props.company_name),
  };
}

/**
 * O que preencher num lead que já existe: só o que falta.
 *
 * Mesma regra da atribuição e pelo mesmo motivo — reimportar não pode apagar o
 * que alguém corrigiu à mão no CRM, e `undefined` no Prisma é "não mexa"
 * enquanto `null` é "apague".
 */
export function apenasOFaltanteDoContato(
  atual: Partial<CamposDoContato>,
  doHubspot: CamposDoContato,
): Partial<CamposDoContato> {
  const saida: Partial<CamposDoContato> = {};
  for (const chave of Object.keys(doHubspot) as (keyof CamposDoContato)[]) {
    if (!texto(atual[chave]) && doHubspot[chave]) saida[chave] = doHubspot[chave];
  }
  return saida;
}
