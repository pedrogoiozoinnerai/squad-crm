/**
 * De-para entre os 8 pipelines do Squad no HubSpot e a nossa única esteira.
 *
 * Explícito de propósito: cada etapa de origem aparece aqui pelo id. Um id
 * desconhecido FALHA a importação em vez de cair num padrão — etapa nova criada
 * no HubSpot depois desta leitura entraria como "novo" e ninguém perceberia.
 *
 * Nosso CRM tem uma esteira só (novo → contatado → demo_agendada → proposta →
 * fechamento). Os pipelines de venda mapeiam direto. Os de pós-venda não
 * mapeiam de jeito nenhum: um negócio em "Calibrando Waz" não é uma venda em
 * andamento, é um cliente que já comprou. Esses entram como GANHO, e a etapa
 * original fica registrada como anotação para não se perder.
 */
export type Etapa = "novo" | "contatado" | "demo_agendada" | "proposta" | "fechamento";
export type Destino = { tipo: "etapa"; etapa: Etapa } | { tipo: "ganho" } | { tipo: "perdido" };

const etapa = (e: Etapa): Destino => ({ tipo: "etapa", etapa: e });
const ganho: Destino = { tipo: "ganho" };
const perdido: Destino = { tipo: "perdido" };

export const PIPELINES: Record<string, { nome: string; natureza: "venda" | "pos-venda" }> = {
  "930609554": { nome: "Squad - Aquisição", natureza: "venda" },
  "915000839": { nome: "B2B Squad Sales", natureza: "venda" },
  "901116980": { nome: "Squad Prospects", natureza: "venda" },
  "900392785": { nome: "Squad Sales", natureza: "venda" },
  "923695777": { nome: "Squad Payment", natureza: "pos-venda" },
  "900960826": { nome: "Squad CS", natureza: "pos-venda" },
  "917642543": { nome: "CS Squad.com", natureza: "pos-venda" },
  "904542026": { nome: "Squad-Meta Integration", natureza: "pos-venda" },
};

/** stageId do HubSpot → [rótulo original, destino aqui]. */
export const ETAPAS: Record<string, [string, Destino]> = {
  // ─── Squad - Aquisição ───
  "1427866936": ["Novo lead", etapa("novo")],
  "1427866937": ["Reunião Agendada", etapa("demo_agendada")],
  "1427866938": ["Reunião Realizada", etapa("demo_agendada")],
  "1427866939": ["Negociação", etapa("proposta")],
  "1427866940": ["Pagamento", etapa("fechamento")],
  "1427866941": ["Ganho", ganho],
  "1427866942": ["Perdido", perdido],

  // ─── B2B Squad Sales ───
  "1392267692": ["Leads", etapa("novo")],
  "1392267693": ["Em Contato", etapa("contatado")],
  "1392267694": ["Reunião Agendada", etapa("demo_agendada")],
  "1422044187": ["Reunião Realizada", etapa("demo_agendada")],
  "1392267695": ["Proposta", etapa("proposta")],
  "1400079695": ["Reunião de Fechamento", etapa("proposta")],
  "1392267698": ["Em Assinatura de Contrato", etapa("fechamento")],
  "1392267699": ["Ganho", ganho],
  "1392267700": ["Negócio Perdido", perdido],
  // No Show é reunião que não aconteceu: volta a ser alguém contatado.
  "1396876369": ["No Show", etapa("contatado")],

  // ─── Squad Prospects ───
  "1363467867": ["Prospects", etapa("novo")],
  "1363467868": ["Tentativa de Contato", etapa("contatado")],
  "1363467869": ["Localizar Responsável", etapa("contatado")],
  "1379606668": ["Respondido / Conversando", etapa("contatado")],
  "1379606669": ["Reunião Proposta", etapa("demo_agendada")],
  "1379617163": ["Reunião Agendada", etapa("demo_agendada")],
  "1363467872": ["Closed Won", ganho],
  "1363467873": ["Closed Lost", perdido],

  // ─── Squad Sales ───
  "1360974662": ["Leads", etapa("novo")],
  "1360974665": ["Em Contato", etapa("contatado")],
  "1360974666": ["Reunião Agendada", etapa("demo_agendada")],
  "1360974668": ["Proposta", etapa("proposta")],
  "1365055631": ["Reunião de Implementação", etapa("fechamento")],
  "1368002107": ["Bloqueado em Integração", etapa("fechamento")],
  "1375914282": ["Aguardando Pagamento", etapa("fechamento")],
  // Marcada como fechada com probabilidade 1.0 neste pipeline: virou cliente.
  "1361068818": ["Trial", ganho],
  "1360976545": ["Negócio Perdido", perdido],

  // ─── Squad Payment (cobrança: ainda não é ganho até o pagamento entrar) ───
  "1413155992": ["Trial", etapa("fechamento")],
  "1413155993": ["Aguardando Data de Pagamento", etapa("fechamento")],
  "1413155997": ["Pagamento Realizado", ganho],
  "1413155998": ["Pagamento Cancelado", perdido],

  // ─── Squad CS (já é cliente) ───
  "1361944695": ["Trial", ganho],
  "1361944698": ["Integração", ganho],
  "1361944696": ["Catálogo", ganho],
  "1361944697": ["Tom de Voz", ganho],
  "1361944699": ["Piloto Automático", ganho],
  "1361944700": ["Closed Won", ganho],
  "1361944701": ["Closed Lost", perdido],

  // ─── CS Squad.com (onboarding de cliente) ───
  "1400063749": ["Trial", ganho],
  "1435774740": ["Fluxo Novo Onboard", ganho],
  "1404731673": ["Boas Vindas", ganho],
  "1400063756": ["Validação BM", ganho],
  "1400063750": ["Reunião Verificação BM Realizada", ganho],
  "1404731676": ["BM Verificada", ganho],
  "1400063752": ["Conexão Whatsapp", ganho],
  "1416815665": ["Reuniao WhatsApp Realizada", ganho],
  "1404731675": ["WhatsApp Conectado", ganho],
  "1400063753": ["Calibrando Waz", ganho],
  "1400063751": ["Treinamento/Implantação", ganho],
  "1404731677": ["Acompanhamento", ganho],
  "1400063757": ["Bloqueio Squad", ganho],
  "1416815122": ["Bloqueio Cliente", ganho],
  "1400063758": ["Churn", perdido],

  // ─── Squad-Meta Integration (operação sobre cliente existente) ───
  "1368714637": ["Casos", ganho],
  "1368718977": ["Coleta de Dados", ganho],
  "1371558677": ["Dúvida na 360", ganho],
  "1368718972": ["Informações Coletadas", ganho],
  "1368718973": ["Solicitação Enviada", ganho],
  "1373067866": ["BM Reprovada", ganho],
  "1368718974": ["BM Aprovada", ganho],
  "1368718975": ["Reunião de Integração", ganho],
  "1368718976": ["Integrado", ganho],
};

export function destinoDe(stageId: string, pipelineId: string) {
  const achado = ETAPAS[stageId];
  if (!achado) {
    const p = PIPELINES[pipelineId]?.nome ?? pipelineId;
    throw new Error(
      `Etapa desconhecida ${stageId} no pipeline "${p}".\n` +
        `  Provavelmente foi criada no HubSpot depois do levantamento.\n` +
        `  Rode 'npm run hubspot:descobrir', veja o rótulo dela e acrescente\n` +
        `  a scripts/hubspot-mapa.ts. Importar com palpite silencioso é pior.`,
    );
  }
  return achado;
}
