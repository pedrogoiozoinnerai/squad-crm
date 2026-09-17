/**
 * Limite de taxa das rotas públicas.
 *
 * Em banco, e não em memória, pela mesma razão que `LoginAttempt` já é em
 * banco: a aplicação roda serverless, cada requisição pode cair num processo
 * diferente, e um contador em memória protege apenas a instância que por acaso
 * atendeu — que é o mesmo que não proteger.
 *
 * Janela FIXA, não deslizante. A deslizante é mais justa na fronteira, e custa
 * guardar um registro por requisição em vez de um contador por janela. Para
 * conter abuso a diferença não paga: o pior caso da fixa é o dobro do limite
 * numa virada de janela, e o limite já é escolhido com folga.
 *
 * Este arquivo é puro — sem banco e sem relógio próprio. O lado que escreve
 * vive em `limite-servidor.ts`, e é isso que permite testar a regra sem subir
 * nada.
 */

export type Regra = {
  /// Quantas requisições a janela aceita.
  teto: number;
  /// Tamanho da janela, em segundos.
  janelaSegundos: number;
};

/**
 * As regras por rota.
 *
 * Os números saem do uso legítimo, não de um chute redondo:
 *
 * `disponibilidade` — a tela do funil consulta uma vez ao abrir o passo de
 * agendamento e de novo quando uma sessão lota. Uma pessoa real faz 2 ou 3 num
 * minuto. 30 deixa passar quem recarrega com raiva e corta um script.
 *
 * `reservar` — o funil chama uma vez por lead, do servidor dele. Mais de 10
 * por minuto do mesmo endereço é laço, não gente.
 *
 * `token` — quem entra numa sala pede um token por entrada; uma queda de
 * conexão pode pedir de novo. 20 por minuto cobre reconexão e barra quem
 * estiver varrendo convites.
 *
 * `mensagens` — o chat da sala. Balde PRÓPRIO, e não o de `token`, por dois
 * motivos que só apareceram quando o chat passou a gravar: o teto de 20 é de
 * quem ENTRA numa sala, e digitar depressa numa sessão gastaria a cota de
 * entrar — quem conversou muito não conseguiria voltar depois de uma queda de
 * conexão. E 20 por minuto é pouco para conversa: 60 cobre quem digita rápido e
 * uma sala inteira atrás do mesmo IP de escritório, e ainda corta um laço.
 */
export const REGRAS = {
  disponibilidade: { teto: 30, janelaSegundos: 60 },
  reservar: { teto: 10, janelaSegundos: 60 },
  token: { teto: 20, janelaSegundos: 60 },
  mensagens: { teto: 60, janelaSegundos: 60 },
} as const satisfies Record<string, Regra>;

export type NomeDaRegra = keyof typeof REGRAS;

/**
 * A chave do balde: rota + quem + qual janela.
 *
 * A janela entra na chave em vez de numa coluna de data porque assim a virada
 * é automática — a janela seguinte é outra linha, e não há relógio para
 * comparar nem linha para zerar.
 */
export function chaveDoBalde(
  regra: NomeDaRegra,
  quem: string,
  agora: Date,
  janelaSegundos: number = REGRAS[regra].janelaSegundos,
): string {
  const janela = Math.floor(agora.getTime() / 1000 / janelaSegundos);
  return `${regra}:${quem}:${janela}`;
}

/** Quando a janela desta chave termina — vira o `Retry-After` da resposta. */
export function fimDaJanela(agora: Date, janelaSegundos: number): Date {
  const janela = Math.floor(agora.getTime() / 1000 / janelaSegundos);
  return new Date((janela + 1) * janelaSegundos * 1000);
}

/**
 * Quem está pedindo.
 *
 * O primeiro endereço do `x-forwarded-for` é o do cliente; os seguintes são os
 * proxies pelo caminho. Sem cabeçalho, todo mundo vira "desconhecido" e divide
 * o mesmo balde — que é o comportamento certo: é melhor limitar demais um
 * ambiente sem proxy do que não limitar nada.
 *
 * Truncado em 45 caracteres, tamanho máximo de um IPv6: sem isso um cabeçalho
 * forjado de 8 KB vira chave primária.
 *
 * **Sobre confiar no cabeçalho.** Na Vercel ele é SOBRESCRITO pela borda com o
 * endereço real de quem conectou — conferi em produção mandando um IP inventado
 * em 34 requisições e vendo o contador registrar o endereço verdadeiro. Ou
 * seja: aqui ninguém escapa do limite nem envenena o balde de outro forjando o
 * cabeçalho.
 *
 * Isso vale para ESTA hospedagem. Atrás de um proxy que apenas acrescenta ao
 * cabeçalho em vez de reescrevê-lo, o primeiro valor passa a ser escolhido por
 * quem chama, e a proteção cai. Se um dia sair da Vercel, este é o ponto a
 * revisar.
 */
export function quemPede(cabecalho: string | null): string {
  const primeiro = cabecalho?.split(",")[0]?.trim();
  return primeiro ? primeiro.slice(0, 45) : "desconhecido";
}

export type Veredicto = {
  permitido: boolean;
  /// Quantas ainda cabem nesta janela. Vira `X-RateLimit-Remaining`.
  restantes: number;
  /// Segundos até a janela virar. Vira `Retry-After` quando barrado.
  esperarSegundos: number;
};

/** A decisão, dado o número de chamadas já contadas nesta janela. */
export function avaliar(
  contagem: number,
  regra: Regra,
  agora: Date,
): Veredicto {
  const fim = fimDaJanela(agora, regra.janelaSegundos);
  return {
    permitido: contagem <= regra.teto,
    restantes: Math.max(0, regra.teto - contagem),
    esperarSegundos: Math.max(1, Math.ceil((fim.getTime() - agora.getTime()) / 1000)),
  };
}
