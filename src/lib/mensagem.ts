/**
 * Mensagem pronta da tarefa, com as variáveis preenchidas.
 *
 * Os modelos de tarefa já nasciam com `messageText` — "Oi {nome}, aqui é
 * {closer} da Squad…" — e nada usava. O botão de WhatsApp abria a conversa em
 * branco, e cada vendedor reescrevia a mesma frase do seu jeito. É assim que a
 * padronização do discurso se perde, e é exatamente o que o CRM de referência
 * resolve tendo a mensagem dentro da tarefa.
 *
 * Função pura, sem `server-only`: é usada no servidor e no cliente, e testada
 * sem subir o Next.
 */
export type Variaveis = {
  nome?: string | null;
  closer?: string | null;
  empresa?: string | null;
  data?: string | null;
  hora?: string | null;
};

/** Primeiro nome: "Oi Maria" soa melhor que "Oi Maria Aparecida da Silva". */
function primeiroNome(nome: string | null | undefined) {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

export function renderizarMensagem(modelo: string, vars: Variaveis): string {
  const valores: Record<string, string> = {
    nome: primeiroNome(vars.nome),
    closer: primeiroNome(vars.closer),
    empresa: (vars.empresa ?? "").trim(),
    data: (vars.data ?? "").trim(),
    hora: (vars.hora ?? "").trim(),
  };

  return modelo
    .replace(/\{(\w+)\}/g, (inteiro, chave: string) => {
      const valor = valores[chave];
      // Variável desconhecida fica como está: some-la deixaria a frase
      // truncada sem ninguém entender por quê, e o vendedor mandaria assim.
      return valor === undefined ? inteiro : valor;
    })
    // Sobrou lacuna por falta de dado (lead sem empresa, por exemplo): a frase
    // fica com espaço duplo e vírgula solta. Melhor arrumar do que mandar torto.
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

/**
 * Link de conversa no WhatsApp, com a mensagem já digitada.
 *
 * `wa.me` exige só dígitos. Número brasileiro sem código do país não abre em
 * lugar nenhum, então o 55 entra quando falta — é o engano mais comum na base
 * importada, onde muita gente foi cadastrada como (11) 99999-9999.
 */
export function linkWhatsapp(telefone: string | null | undefined, mensagem?: string | null) {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const comPais = digitos.length <= 11 ? `55${digitos}` : digitos;
  const texto = mensagem?.trim();
  return `https://wa.me/${comPais}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
