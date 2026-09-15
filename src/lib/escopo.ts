import type { Role } from "@/generated/prisma/enums";

/**
 * Regras de acesso que são função pura.
 *
 * Separadas de `auth.ts` porque aquele módulo é `server-only`: ele fala com
 * cookie e banco. Estas aqui só olham para os argumentos — e é justamente por
 * isso que precisam ser testáveis sem subir o Next inteiro. São as regras cuja
 * falha ninguém vê numa revisão: um escopo que passa a devolver vazio abre a
 * carteira do time inteiro sem mudar uma linha de tela.
 */
export type Ator = { id: string; role: Role };

/** O filtro que prende cada consulta ao dono. Admin enxerga tudo. */
export function ownerScope(user: Ator) {
  return user.role === "ADMIN" ? {} : { ownerId: user.id };
}

export function assertOwns(user: Ator, ownerId: string | null | undefined) {
  if (user.role === "ADMIN") return;
  if (ownerId !== user.id) throw new Error("Sem permissão para alterar este registro.");
}

/**
 * Destino interno, ou o padrão.
 *
 * `startsWith("/")` sozinho não basta: `//evil.com` começa com barra e o
 * navegador o lê como URL absoluta protocolo-relativa — um redirecionador
 * aberto pendurado no login, que vira phishing com o nosso domínio na barra de
 * endereço. A contrabarra entra na recusa porque vários navegadores normalizam
 * `/\` para `//` antes de resolver a URL.
 */
export function destinoSeguro(proxima: string | null | undefined, padrao: string) {
  return proxima && /^\/(?![/\\])/.test(proxima) ? proxima : padrao;
}
