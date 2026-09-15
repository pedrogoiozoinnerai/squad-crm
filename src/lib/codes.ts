import "server-only";

import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

const ALFABETO = "0123456789abcdefghijkmnpqrstuvwxyz"; // sem l/o, que confundem com 1/0

/**
 * Código curto e único do negócio (`#k3f9x2`).
 *
 * O anterior era `Math.random().toString(16).slice(2,6)`: 65.536 valores num
 * campo `@unique` — pelo paradoxo do aniversário, colisão vira provável por
 * volta de 300 negócios, e o `create` estoura com P2002 na cara do vendedor.
 * Aqui são 34^6 ≈ 1,5 bilhão, com retry por garantia.
 */
export async function nextDealCode(tentativas = 5): Promise<string> {
  for (let i = 0; i < tentativas; i++) {
    const bytes = randomBytes(6);
    const code =
      "#" + Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");

    const existe = await prisma.deal.findUnique({ where: { code }, select: { id: true } });
    if (!existe) return code;
  }
  throw new Error("Não foi possível gerar um código único para o negócio.");
}

/**
 * Token do convite de reunião — 32 bytes aleatórios em hexadecimal.
 *
 * Aleatório, e não `cuid`: o cuid é sequencial, e quem tivesse um convite
 * conseguiria adivinhar os vizinhos — ou seja, entrar na call de outro lead.
 *
 * Guardado em claro, ao contrário do token de sessão (`auth.ts`), e é uma
 * escolha, não descuido: o vendedor precisa reabrir a tela e copiar o link de
 * novo, o que um hash impediria. O alcance também é outro — este token abre
 * uma sala, por uma janela de horas, como um lead específico; o de sessão abre
 * a carteira inteira por trinta dias.
 */
export function novoTokenDeConvite() {
  return randomBytes(32).toString("hex");
}

