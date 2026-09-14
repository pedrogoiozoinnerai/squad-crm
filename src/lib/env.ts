/**
 * Leitura de variável de ambiente, tolerante ao que painéis de deploy guardam.
 *
 * No `.env` os valores ficam entre aspas e o dotenv as remove ao ler. A Vercel
 * (e o Supabase, e o Railway) guardam **exatamente** o que você colar — quem
 * copia `"postgres://…"` do arquivo leva as aspas junto. O sintoma é péssimo:
 * `DATABASE_URL` com aspas vira `Invalid URL` no build, e `DB_SCHEMA` com
 * aspas faz TODA consulta falhar em runtime, sem dizer por quê.
 *
 * Um lugar só, usado por runtime e CLI, para isso não voltar a acontecer.
 */
export function env(nome: string, padrao?: string): string | undefined {
  const bruto = process.env[nome];
  const limpo = bruto?.trim().replace(/^['"]|['"]$/g, "").trim();
  return limpo || padrao;
}

/** Igual a `env`, mas falha cedo e com contexto quando falta. */
export function envObrigatorio(nome: string, dica?: string): string {
  const valor = env(nome);
  if (!valor) {
    throw new Error(`${nome} não configurada.${dica ? ` ${dica}` : " Veja .env.example."}`);
  }
  return valor;
}

/**
 * Nome de schema/tabela não pode ser parâmetro de bind — entra no SQL por
 * interpolação. Então é validado antes de qualquer uso.
 */
export function identificador(nome: string, valor: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(valor)) {
    throw new Error(
      `${nome} inválido: "${valor}". Use só letras, números e _ — sem aspas.`,
    );
  }
  return valor;
}

/**
 * Descreve o que há de errado com um valor que deveria ser URL de Postgres.
 *
 * Devolve a FORMA do defeito, nunca o conteúdo: este texto vai parar numa
 * resposta HTTP pública, e o valor pode ser uma senha colada no campo errado.
 * Retorna `null` quando o valor está bom.
 */
export function diagnosticarUrlPostgres(valor: string): string | null {
  // Espaço vem antes do protocolo: `postgresql://…  ` passa no teste de
  // protocolo e quebra depois, na conexão, longe daqui.
  if (/\s/.test(valor)) return "há espaço ou quebra de linha no meio do valor";
  if (/^postgres(ql)?:\/\//.test(valor)) return null;
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(valor)) {
    return "o nome da variável foi colado junto com o valor — o campo recebe só o que vem depois do =";
  }
  if (/^https?:\/\//.test(valor)) {
    return "isso é uma URL de site, não a string de conexão do Postgres — pegue a de Connect → ORMs no Supabase";
  }
  if (/^[a-z]+:\/\//.test(valor)) return "o protocolo não é postgresql://";
  return "não começa com postgresql://";
}

/**
 * Lê uma string de conexão e remove espaços e quebras de linha de dentro dela.
 *
 * Um espaço literal nunca é válido numa URL — o que for legítimo aparece
 * percent-encoded (`%20`). Então, quando ele existe, é resto de paste: o campo
 * do painel quebrou a linha, ou veio um `\n` junto do clipboard. Emendar é
 * seguro e evita que o deploy fique parado por um caractere invisível.
 *
 * `reparado` volta junto de propósito: consertar calado esconde uma
 * configuração errada que ainda vai machucar em outro lugar.
 */
export function urlDeConexao(nome: string): { url?: string; reparado: boolean } {
  const bruto = env(nome);
  if (!bruto) return { reparado: false };
  const url = bruto.replace(/\s+/g, "");
  return { url, reparado: url !== bruto };
}
