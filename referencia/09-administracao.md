# Administração do CRM Viver de IA — varredura completa

Capturado em 15/09/2026 como `gabriel.santos@viverdeia.ai` (ADMIN).
**Somente leitura.** Nada foi salvo, ativado, reprocessado nem testado.
Webhooks e Funções está em `08-webhooks-e-funcoes.md`.

---

## `/admin/monitoramento` — hub de três telas

### Central de Monitoramento (`/admin/monitor`)
`Salas Ativas 2 de 95 closers · Participantes Online 107 · Salas Disponíveis 93`

Cada closer tem uma **sala LiveKit permanente**, não criada por reunião.

> **Não copiar:** a seção "Salas Aguardando" lista as 95 salas inativas **acima**
> de "Salas em Andamento". As 2 salas que importam ficam depois de 95 cartões
> que não importam. Se fizermos, é o inverso: ao vivo primeiro, o resto colapsado.

### Monitor - LiveKit (`/admin/monitor-livekit`)
`Salas Ativas 1 · Participantes Online 11 · Na Sala de Espera 0 · Aguardando 94`

- Sala nomeada `closer-<uuid>` — uma por closer, permanente.
- **"Na Sala de Espera — visualizando /call"** é a métrica boa: quem abriu a
  página da call e ainda não entrou. É o lead prestes a dar no-show, e dá para
  agir enquanto ele ainda está do outro lado da tela.
- Atualização ao vivo com carimbo de hora e botão Atualizar.

### WhatsApp Monitor (`/admin/whatsapp-monitor`)
`Total 89 · Conectadas 21 · Desconectadas 68 · Falhas de Envio 15`

**76% das instâncias estão offline.** Vários closers têm 2, 3, até 4 instâncias
— sinal de repareamento repetido: quando cai, cria-se outra em vez de recuperar.

> **A lição mais cara desta varredura.** O modelo "uma instância de WhatsApp por
> vendedor, pareada por QR" (Evolution API) **não se sustenta em escala**. Antes
> de construirmos o nosso, essa é a evidência de que o custo real não é integrar,
> é manter conectado. Abas: Instâncias · Logs de Erros (15).

---

## `/admin/analises` — Análises & Auditoria
*"Inteligência sobre o passado."*

- **Análises com IA** — insights de CRM + calls + transcrições, com **PDI por closer**.
- **Análise Thresholds** — recalcula participação variando o tempo mínimo de
  presença **de 1 a 30 minutos**. Ou seja: "quantos participaram" é um parâmetro,
  não um fato — e eles deixam o gestor mexer nele.
- **LiveKit Audit** — entradas e saídas de sala em 3 visões (Timeline, Lista,
  Sessões), com filtro de período e closer.

---

## `/admin/dados` — entrada e saída em lote
- **Importar CSV** — validação em **chunks de 200**, relatório de erros e
  **reversão completa por `batch_id`**. É o padrão a copiar: importação que não
  dá para desfazer é importação que ninguém tem coragem de rodar.
- **Exportações** — leads (`call_bookings`) e transcrições, com filtro de
  período, closer e status.

---

## `/admin/settings` — Configurações Gerais
Abas: **Configurações · Cadastros · WhatsApp · Importação CSV · Migração**

### Regras de Retenção — o melhor achado de produto
Dois campos configuráveis: **tempo mínimo (minutos)** e **porcentagem mínima da
duração total** para considerar que o lead "ficou até o final". Retenção é
**regra de negócio editável**, não constante no código. Nós temos `Attendance`
como enum de três estados; isso aqui é mais fino.

### Manutenção — onde o sistema confessa
- **Reprocessar Participações — `1028 pendentes`**
  *"Use quando leads aparecem como 'Não' mesmo tendo participado."*
- **Limpar Sessões Presas** — *"reseta sessões presas em active/ended,
  encerra sessões ad-hoc zumbi e desativa participantes órfãos."*

> Mil e vinte e oito participações pendentes de reconciliação, e um botão manual
> para consertar. A sincronização LiveKit → agendamento **não é confiável**, e
> eles resolveram com um botão em vez de um job. Para o nosso Meet: a presença
> precisa nascer de reconciliação automática e idempotente, com fila de retentativa.

### Integrações e testes
`Zoom API — Pendente` · `Webhook — Não configurado`, mais três botões de teste
de envio para funções externas (`receive-call-booking`, `generate-lead-portal`,
`ingest-leads`) por Booking ID. Não acionei nenhum.

### Embed do calendário
Iframe pronto para copiar apontando para `/agendar`, mais link direto. É como
o agendamento entra em landing page de terceiro.

### Notificações e retenção
Resumo diário por e-mail · alerta de sessão ao vivo · relatório semanal.

---

## `/admin/webphone` — Webphone 3C
Discador WebRTC embutido — *"a ligação toca no seu navegador. **Piloto admin-only**."*

- Conecta a um PABX externo (3C), com seleção de microfone e alto-falante.
- **QUALIFICAÇÃO** logo abaixo do discador: ao desligar, classifica o resultado
  ("Sem contato / Ligação caiu"). A ligação e o desfecho no mesmo lugar.
- Estado "Pronto" e badge de piloto — assumem que é experimento.

*(A permissão de microfone foi solicitada e bloqueada no painel. Nenhuma ligação
foi feita.)*

---

## `/admin/controle-crm` — **a melhor página do sistema inteiro**

Filtros: time · lead score · período com intervalo explícito no rótulo.

### Funil com comparação obrigatória
`participantes → marcadas → concluídas → vendas · vs. 01/08 – 15/08`

| Etapa | Valor | vs. período anterior | Conversão p/ a próxima |
|---|---|---|---|
| Participantes (calls em grupo) | 1.081 | −5,4% (vs 1.143) | 39,8% (−2,9 p.p.) |
| Calls ind. marcadas | 430 | −11,9% (vs 488) | 66,3% (−1,7 p.p.) |
| Calls ind. concluídas | 285 | −14,2% (vs 332) | 11,6% (−1,4 p.p.) |
| Vendas | 33 | −23,3% (vs 43) | — |

`Conversão geral grupo → venda: 3,6% (−0,7 p.p. vs 4,3%)`
`54,5% no-show sobre 2.543 agendados (+1,1 p.p.)`

**Três coisas que fazem esta tela funcionar, e que valem mais que o layout:**

1. **Cada métrica carrega a própria definição embaixo do número** — "task criada
   (exceto excluída)", "task concluída", "via call individual". Ninguém discute
   o que está sendo contado.
2. **Volume varia em %, taxa varia em p.p.** Eles acertam a estatística: dizer
   que uma conversão "caiu 7%" quando foi de 4,3% para 3,6% é outra coisa
   completamente diferente de "caiu 0,7 ponto percentual".
3. **Nada aparece sem comparação.** Número de funil sozinho não significa nada.

### Tabela por closer
Funil inteiro por pessoa, com **cada conversão em % da etapa anterior** (não do
total), mais **TEMPO MÉDIO DE FECHAMENTO** em dias. Alterna Closers · Times ·
Lead score. 32 closers com atividade no período.

> Um valor de 187,7d numa linha mostra que a média sem mediana nem corte de
> outlier engana. Se copiarmos a coluna, é mediana.

### Setores — Top 10
Por nº de vendas, com **% de no-show por setor**: Imobiliário 51,4% · Serviço
55,4% · Tecnologia 47,9% · Saúde 48,8% · Consultoria 55,8%. É o que diz onde
vale comprar mídia.

---

## Ordem de valor para o Squad

1. **Controle do CRM inteiro** — funil comparado, definição embaixo do número,
   p.p. para taxa. Nosso Início já tem os números; falta a comparação.
2. **Log de webhook com IP e status** (ver `08-`).
3. **Retenção como regra editável**, não enum fixo.
4. **Import com reversão por `batch_id`** — já temos import do HubSpot sem desfazer.
5. **"Na sala de espera"** para o Meet — agir antes do no-show.
6. **Qualificação colada no discador** — o desfecho registrado onde a ação acontece.

## O que explicitamente NÃO copiar
- Segredo opcional em webhook de entrada.
- POST público sem autenticação criando agendamento.
- 95 salas inativas antes das ativas.
- Reconciliação de presença por botão manual.
- Média simples em tempo de fechamento.
