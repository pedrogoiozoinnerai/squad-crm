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
