# O que trazer do Viver de IA para o CRM do Squad

Comparação entre o que o CRM original faz e o que o nosso já tem.

## 1. Decisões de modelagem que devo corrigir agora (barato, dói depois)

| Eles | Nós hoje | Por que mudar |
|---|---|---|
| `converted_value_cents` **inteiro** | `Deal.value Float` | Float em dinheiro acumula erro de arredondamento. Migrar para centavos inteiros. |
| `pipeline_stages.order_index` + `color` + **`target_role`** | `Stage.order` + `color` | `target_role` faz a etapa saber de que papel ela é — habilita funil por função (SDR × closer × CS). |
| `role_permissions (role, features[])` | `enum Role { ADMIN, USER }` | Permissão por **feature**, não por papel fixo. Não precisa de deploy pra mudar quem vê o quê. |
| `session_templates → session_instances → session_overrides` | `Meeting` solto | Sessão recorrente como template materializado; exceção do dia vira override, sem quebrar a série. |
| `session_participants` com `join_count` e `total_time_seconds` | não existe | É o que sustenta a presença automática (≥5min) e a taxa de presença. |
| `loss_reasons` como **tabela** | `Deal.lostReason` texto livre | Motivo de perda padronizado é o que permite analisar perda depois. |
| `task_templates` + `task_automations` | tarefa avulsa | Tarefa criada sozinha ao entrar na etapa — é o que faz o pipeline andar sem disciplina manual. |

## 2. Padrões de arquitetura que valem copiar

**RPC no banco em vez de JOIN no cliente.** Eles têm 61 funções. Pipeline usa
três separadas: board, página da coluna e totais. É assim que 4 mil deals
carregam rápido. No nosso caso o equivalente é isolar essas queries em funções
SQL ou em `lib/queries` bem fechadas, com paginação por coluna.

**Versionar a função em vez de alterar.** `_v2`, `_v6`, `_v7` no nome. A versão
nova sobe ao lado da antiga e o front migra quando quiser. Zero downtime.

**Contadores vêm de agregação separada da paginação.** O aviso na tela de
Gravações ("os números não mudam ao trocar de página") mostra que eles trataram
isso de propósito. Nosso CRM já faz certo em Negócios; manter a regra.

## 3. Funcionalidades que eu não sabia que existiam (não estavam nos prints)

- **Pipeline de Renovação inteiro** — `renovacao_pipeline_state`,
  `renovacao_events`, `renovacao_loss_reasons`, rotas `pipeline-renovacao` e
  `my-tasks-renovacao`, com responsável de CS. É um segundo funil, pós-venda.
- **Painel do líder** — `get_team_leader_overview_v2`, rota `painel-lider`.
- **Forecast com ML** — `get_ml_forecast_diario_v1`, além de forecast por canal
  e histórico (`forecast_canais_hist_v2`, `forecast_funil_canais_v1`).
- **Threshold analysis** e **análise de lead score no fechamento**.
- **Follow-up de fim de mês** — `get_follow_up_leads_v5` + métricas.
- **Webphone** — discagem dentro do CRM.
- **Zoom** além do LiveKit (`zoom_config`, `zoom_sync_logs`).
- **Materiais** — `materiais_cases`, `materiais_solucoes`, `materiais_formacoes`:
  uma biblioteca de conteúdo pro closer usar na call.
- **Bloqueio de usuário** — `block_user_v3`, `list_user_block_status`.
- **Importação CSV** com log (`csv_import_logs`, `leads_import_logs`).
- **Justificativa de link de pagamento** — `payment_link_justifications` e
  `payment_link_snapshots`. Eles auditam quando o closer gera link fora do padrão.

## 4. O fluxo público — é o projeto 3 (Meet) já resolvido lá

```
/agendar → /agendamento/:id → /obrigado/:id → /reagendamento/:id
/invite/:token → /join/:bookingId → /call/:bookingId
```

Não existe Cal.com. O agendamento, a confirmação, o reagendamento, a sala e a
call são páginas do próprio app, amarradas por `booking_id`. É exatamente o que
você quer no Meet — e o nosso `Meeting.roomId` já está reservado pra isso.

## 5. Onde o nosso já está igual ou melhor

- Drawer do negócio: reproduzimos a estrutura fielmente.
- Regra de mentoria obrigatória antes do Ganho: **nós validamos no servidor**;
  não dá pra saber se eles fazem o mesmo.
- Escopo por papel reforçado em toda query e Server Action.
- Nosso CSV já respeita o escopo do vendedor (testado).

## 6. Ordem sugerida

1. **Centavos** no valor + `loss_reasons` como tabela (migração barata agora)
2. `task_templates` + `task_automations` — maior ganho de operação por linha de código
3. `session_templates/instances/overrides` + `session_participants` com tempo
4. Permissão por feature (`role_permissions`)
5. Fluxo público de agendamento → é a ponte com o Meet
6. Renovação como segundo funil
