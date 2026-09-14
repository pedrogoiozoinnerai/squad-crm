# O que só o Head/Admin enxerga
Capturado em 13/09/2026 com `gabriel.santos@viverdeia.ai` (role **ADMIN**).

A sidebar do vendedor tinha 14 itens. A do admin tem **22** — 8 a mais:
**Início · Meu Time · Individuais · Análises · Dados · Configurações ·
Webphone 3C · Controle do CRM**.

---

## Faixa de alerta global (aparece em TODAS as telas)

> ⚠️ **5 calls com mais de 15 agendados**
> "A call só é dividida automaticamente ao chegar em 100 agendados. Se quiser
> aliviar, abra o horário no calendário, crie uma sessão extra e redistribua os
> leads." — com a lista dos slots, o time, o closer e a lotação, e o botão
> **Abrir calendário**.

É o melhor padrão de UX do sistema inteiro: **o alerta explica a regra, mostra o
caso concreto e entrega o botão que resolve**. Não é um badge vermelho mudo.

---

## `/admin/inicio` — o dia do closer

Título editorial "INÍCIO — SEU DIA" + data por extenso, e uma **frase de estado
gerada dos dados**: *"Olá, Gabriel. Tudo em dia por aqui. Bom trabalho."*
Chip de saúde no topo: "WhatsApp não configurado".

Blocos numerados **01 · 02 · 03**:

- **01 Minhas tarefas** — EM ABERTO 85 · EM ATRASO 2 · PARA HOJE 1 · ESTA SEMANA 81
- **MENSAGENS DE HOJE** — "Caixa limpa. nenhuma mensagem hoje"
- **PRÓXIMA CALL** e **PRÓXIMA DEMO** (com nome do lead)
- **02 REMUNERAÇÃO — "Seu mês em R$"** — pipeline aberto, forecast ponderado,
  ganho no mês. *"Seu plano de remuneração ainda não foi configurado."*
- **03 FOLLOW-UPS**

> O closer vê **a própria comissão**. É o que liga o CRM ao bolso dele.

## `/admin/painel-lider` — "Meu Time"

Mesma estrutura, escopo de time. A frase de estado vira um briefing:

> *"Time Gabriel — 8 closers em campo. Hoje: 3 WhatsApps sem conexão,
> 280 conversas aguardando, 77 tarefas atrasadas."*
> com o botão **Resolver 3 WhatsApps**.

Métricas: CLOSERS 8 · WHATSAPP OFF 3 · CALLS HOJE 0 · AGUARDANDO 280 ·
**GANHO NO MÊS — TIME R$ 521k (11 deals)** · ranking dos 3 melhores closers ·
**PRÓXIMA CALL DO TIME** e **NA SEQUÊNCIA · OUTRO CLOSER**.

## `/admin/controle-crm` — funil de conversão

Filtros: time · lead score · período (com intervalo explícito).
**Funil**: participantes → marcadas → concluídas → vendas,
sempre **comparado ao período anterior** (ex.: 861 participantes, −13,0% vs 990).
Mostra **55,7% de no-show** sobre 1.953 agendados, com delta em pontos
percentuais. Alterna entre visão por **Closers** e por **Times**.

## `/admin/analises` — hub de Análises & Auditoria
"Inteligência sobre o passado."
- **Análises com IA** — insights de CRM + calls + transcrições, com **PDI por closer**
- **Análise Thresholds** — participação de leads por faixa

## `/admin/dados` — entrada e saída em lote
- **Importar CSV** — validação em **chunks de 200 registros**, relatório de erros
  e **reversão completa por `batch_id`**
- **Exportações** — leads (`call_bookings`) e transcrições

## `/admin/configuracoes` — setup da plataforma
- **Sessões Recorrentes** — CRUD de slots semanais por closer, **detecção de
  conflitos**, **sessões secundárias (overflow)**, ações em massa e **migração
  entre closers**
- **Configurar Atividades** — templates de tarefa, estágios do pipeline e
  automações (triggers, webhooks, mudança de status)
- **Usuários** — CRUD + roles + teams, sala LiveKit, instância WhatsApp por QR
- **LiveKit** — teste de conexão e lobby

## `/admin/calendar-individuais` — 1:1 agendadas pelo lead
> *"Sessões 1:1 agendadas pelo próprio lead · atribua o closer para liberar a sala"*
> *"As sessões aparecem aqui assim que um lead agenda pela página /agenda."*

Confirma o fluxo público: o lead marca sozinho em `/agenda`, cai aqui **sem
closer**, e alguém atribui para liberar a sala. Filtro "Sem closer".
Colunas: HORA · LEAD · SCORE · CLOSER · ESTADO.

## `/admin/webphone` — discador dentro do CRM ("Webphone 3C")

---

## O que trazer para o Squad — por ordem de impacto

1. **Alerta acionável no topo** — regra explicada + caso concreto + botão que resolve.
2. **Frase de estado gerada dos dados** no Dashboard, em vez de só números.
   "Tudo em dia por aqui" / "3 WhatsApps sem conexão, 280 conversas aguardando".
3. **Bloco de Remuneração** — o closer vendo o próprio mês em R$.
4. **Funil com comparação período a período** e delta em p.p. — sem comparação,
   número de funil não significa nada.
5. **Painel do líder** com ranking e "próxima call do time".
6. **Import CSV com reversão por `batch_id`** — desfazer uma importação inteira.
7. **Sessões com detecção de conflito e overflow** — nosso `SessionTemplate` já
   tem a base; falta a regra de lotação e a sessão secundária.
8. **Calendário de individuais com fila "sem closer"** — é o elo que falta entre
   o agendamento público e a operação.
