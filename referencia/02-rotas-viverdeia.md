# Rotas do CRM Viver de IA (extraídas do router)

A sidebar mostra 14 itens. O app tem **muito mais** — o resto é liberado por
papel/feature ou é público.

## Painel interno (/admin/…)

**Na sidebar:** calendar · my-tasks · pipeline · leads · chat · my-agenda ·
my-sessions · relatorio-calls · roleplay · convites · deals · participants ·
recordings · monitoramento

**Fora da sidebar — administração:**
users · settings · rooms · zoom · zoom-sdk · change-password · webhook ·
activity-config · configuracoes · csv-import · exportacoes

**Fora da sidebar — gestão e análise:**
- `painel-lider` — visão do líder de time (RPC `get_team_leader_overview_v2`)
- `forecast` · `metrics` · `radar` · `controle-crm` · `dados`
- `analise-leadscore-fechamento` · `threshold-analysis`
- `follow-up-final-mes` — corrida de fechamento de mês
- `analises` · `analises-ai` · `analises-ai/closer` · `transcricoes`

**Pipeline de Renovação (produto separado):**
- `pipeline-renovacao` · `my-tasks-renovacao`

**Monitoramento:** monitor · monitor-livekit · livekit · livekit-audit ·
whatsapp-monitor · webphone · lid-resolution-test

**Versões paralelas convivendo:** calendar / calendar-v2 / calendar-individuais ·
sessions / sessions-v2 · my-sessions / my-sessions-v2
> Eles sobem a versão nova ao lado da antiga em vez de substituir.

## Fluxo público — é o "Meet" (projeto 3) já existindo aqui

```
/agendar → /agendamento/:id → /obrigado/:id
                            ↘ /reagendamento/:id
/invite/:token → /join/:bookingId → /call/:bookingId → /live
/meet/:meetingId · /join-room · /my-room · /test-room
/onboarding · /termos · /termos-de-uso
```

Ou seja: **captação, agendamento, confirmação, reagendamento, entrada na sala e
a call em si já são páginas deste mesmo app.** Não existe Cal.com no meio.

## Páginas de venda/apresentação
`/apresentacao-avulsa` · `/negociacao` · `/negociacao-g4` · `/dash-vendas-lanc`
· `/projeto-calls-individuais` (+ `-rev`)
