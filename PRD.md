# PRD — CRM de Vendas com IA (Squad.com)
**Versão:** 2.0 · **Atualizado:** 13/09/2026

> **v2.1 (13/09, acesso ADMIN).** Uma segunda varredura, agora com permissão de
> head, revelou 8 telas que o vendedor não vê e — o mais importante — **os
> prompts de análise de call**, editáveis na interface, com escopo global e por
> time. Estão em [`referencia/06`](./referencia/06-prompts-analise-calls.md) e
> [`referencia/07`](./referencia/07-acesso-head.md).
>
> **v2.0 — o que mudou.** A v1.0 foi escrita a partir de 40 prints do CRM
> Viver de IA. Em 13/09 fizemos engenharia reversa do app publicado
> (`call.viverdeia.ai`) e trocamos suposição por fato: 59 tabelas, 61 funções
> RPC e 46 Edge Functions extraídas dos bundles. Os detalhes estão em
> [`referencia/`](./referencia/); este documento passa a refletir o que é real.

## Onde o projeto está hoje

**Construído e testado** — login com 2 níveis, Calendário, Minha Agenda, Leads,
Pipeline (kanban + drawer fiel ao original), Negócios (+CSV), Tarefas, Usuários,
Importar do Funil. CRUD completo por drawers controlados pela URL.

**Fundamentos corrigidos a partir da engenharia reversa** — dinheiro em
centavos, motivos de perda como tabela, etapa com `targetRole`, permissão por
feature, automação de tarefas por etapa, sessões template→instância→override,
outbox de WhatsApp.

**Ainda não construído** — Dashboard, fluxo público de agendamento, pipeline de
Renovação, painel do líder, chat de WhatsApp, análise de calls por IA, roleplay,
monitoramento.

---

## Correções à v1.0 (onde eu tinha errado)

| Eu supunha | É de verdade |
|---|---|
| Front em Next.js | **SPA Vite + React** |
| API própria entre front e banco | **Supabase direto do browser**, com RLS |
| JOINs no servidor de aplicação | **61 RPCs no Postgres**; o front quase não faz JOIN |
| Transcrição por Whisper | **Deepgram Nova-3** |
| Gravação por worker próprio | **LiveKit Egress** |
| Front chama a Evolution API | **Outbox**: front insere em `send_queue`, worker entrega |
| Só LiveKit para vídeo | LiveKit **e Zoom** convivendo |
| Cal.com para agendar | **Fluxo de agendamento é do próprio app** |
| Valor como decimal | **Centavos inteiros** (`converted_value_cents`) |
| Papel fixo em enum | **Permissão por feature** (`role_permissions`) |

---

## 1. Visão geral

### 1.1 O que é
Um CRM de vendas **operado por closers**, construído em torno de **calls em vídeo** (coletivas e 1:1) em vez de e-mail. O sistema cobre o ciclo completo:

> captação do lead → agendamento em sessão → convite rastreado → presença na sala → call gravada → transcrição → análise por IA → avanço no pipeline → fechamento → mentoria → pagamento.

Sobre esse ciclo roda uma **camada de IA** que:
- responde leads no WhatsApp (agente **Nina**);
- transcreve, resume e **pontua cada call** contra um roteiro de vendas de 10 etapas;
- gera **boletins diários e semanais de desenvolvimento** por closer;
- transforma os pontos fracos do closer em **cenários de roleplay** treináveis (texto e voz);
- sugere **cases relevantes** por setor do lead e gera **apresentações e planos de ação** personalizados.

### 1.2 Problema que resolve
CRMs genéricos tratam a reunião como um campo de data. Aqui a **call é o objeto central**: ela é agendada, rastreada, gravada, transcrita, avaliada e vira insumo de treino. O gestor enxerga a operação ao vivo; o closer enxerga exatamente em qual etapa do roteiro ele falha e treina justamente aquela etapa antes da próxima call.

### 1.3 Objetivos do produto
| # | Objetivo | Métrica de sucesso |
|---|---|---|
| O1 | Aumentar taxa de presença nas sessões | Taxa de presença (presentes/inscritos) ≥ 60% |
| O2 | Aumentar conversão demo → pagamento | Taxa de conversão por etapa do funil |
| O3 | Elevar a qualidade das calls | Score médio do roteiro (0–100) crescente semana a semana |
| O4 | Reduzir tempo de resposta a lead | SLA de primeira resposta no chat < 15min |
| O5 | Tornar o coaching escalável | % de closers com boletim diário gerado e ≥1 roleplay/semana |
| O6 | Previsibilidade de receita | Acurácia da Previsão vs. realizado por semana |

### 1.4 Fora de escopo (v1)
- App mobile nativo (o web é responsivo).
- Faturamento/emissão de nota fiscal.
- Integração com e-mail marketing.
- Multi-tenant (o sistema é de uma única organização; a modelagem prevê `org_id` para futuro).

---

## 2. Personas e papéis (RBAC)

| Papel | Chave | O que enxerga | Ações exclusivas |
|---|---|---|---|
| **Vendedor / Closer** | `closer` | Apenas os próprios leads, deals, tarefas, sessões, calls, gravações, relatório e roleplay | Operar a própria sala, responder chats atribuídos, mover os próprios deals |
| **Head / Gestor** | `head` | Tudo do seu time (todos os closers do time) | Ver relatórios do time, reatribuir leads, marcar sessão como "Head" |
| **SDR / Pré-vendas** | `sdr` | Leads e chat; sem pipeline de fechamento | Qualificar e agendar leads |
| **Administrador** | `admin` | Tudo, todos os times | Monitoramento, configurações, gestão de usuários, instâncias WhatsApp, catálogo de cases, produtos e etapas do pipeline |

> A UI já sinaliza o papel no rodapé da sidebar (badge "Vendedor" ao lado do e-mail). Todas as regras abaixo são reforçadas em **RLS no Postgres**, nunca só no front.

---

## 3. Glossário do domínio

| Termo | Definição |
|---|---|
| **Lead** | Pessoa captada, ainda não necessariamente agendada. Tem estado de enriquecimento: `incompleto`, `completo`, `lancamento`. |
| **Participante** | Lead **inscrito em uma sessão** (agendado). Um lead vira participante ao ser agendado. |
| **Sessão** | Evento de call num slot de dia/hora, numa **sala**, conduzido por um closer. Pode ser **em grupo** (vários leads) ou **1:1 / individual**. |
| **Sala (Room)** | Sala de vídeo (LiveKit). Cada closer tem uma sala pessoal permanente (`closer-<uuid>`); existem também salas de sessão e de roleplay. |
| **Head** | Marcação de uma sessão conduzida pelo head do time — destacada em laranja no calendário. |
| **Call** | Ocorrência real de conversa gravada. Pode ser `grupo`, `1:1` ou `avulsa` (fora de sessão agendada). |
| **Deal / Negócio** | Oportunidade comercial vinculada a um lead, com valor, produto e etapa do pipeline. |
| **Etapa** | Estágio do pipeline: Leads Incompletos → Leads Contatados → Demo Agendada → Demo Assistida → Atendimento → Pagamento. |
| **Lead Score** | Nota de qualificação de A a E (A = melhor). "Leads Qualificados" = score A ou B. |
| **Nina** | Agente de IA que conversa com o lead no WhatsApp (confirmação de agendamento, retomada, depoimentos, permissão de ligação). |
| **Aspecto** | Uma das 10 etapas do roteiro de vendas avaliadas pela IA em cada call (ex.: "Preço da inação", "Fechamento assumido"). |
| **Boletim** | Relatório diário de desenvolvimento do closer, gerado por IA a partir das calls do dia. |
| **Roleplay** | Treino simulado de call: com outro closer (vídeo), com IA por texto, ou com IA por voz. |
| **Convite rastreado** | Link único por lead/sessão que registra cliques e **contabiliza presença automaticamente** (≥ 5 min na sala). |
| **Convidado** | Link sem rastreamento, para acompanhantes do lead. Não contabiliza reunião realizada. |
| **Mentoria Estratégica** | Etapa obrigatória antes de marcar o deal como **Ganho**. Mentor é sorteado e o cliente recebe e-mail + convite automático. |
| **Case** | Case de sucesso de cliente, catalogado por setor, sugerido pela IA dentro do deal. |

---

## 4. Arquitetura técnica

### 4.1 Diagrama lógico

```
┌──────────────────────────────────────────────────────────────┐
│  VERCEL — Next.js 15 (App Router, RSC, Server Actions)        │
│  UI + rotas /api (curtas) + Vercel Cron                       │
└───────┬──────────────────────────────────────┬───────────────┘
        │ supabase-js (SSR/RSC) + Realtime     │ REST
        ▼                                       ▼
┌───────────────────────────┐        ┌─────────────────────────┐
│  SUPABASE                 │        │  WORKER (VPS/Fly/Railway)│
│  • Postgres + RLS         │◄──────►│  • Agentes LiveKit       │
│  • Auth (email + magic)   │  jobs  │  • Gravação/Egress       │
│  • Storage (gravações,    │  queue │  • Transcrição (fila)    │
│    logos de cases)        │        │  • Análise IA (fila)     │
│  • Realtime (chat, monit.)│        │  • Roleplay de voz       │
│  • Edge Functions         │        │  • Webhooks WhatsApp     │
│  • pg_cron                │        └───────────┬─────────────┘
└───────────────────────────┘                    │
                                                 ▼
          ┌──────────┬──────────────┬────────────┬──────────────┐
          │ LiveKit  │ Evolution API│ Claude API │ ElevenLabs   │
          │ (vídeo)  │ (WhatsApp)   │ (LLM)      │ (TTS/voz)    │
          └──────────┴──────────────┴────────────┴──────────────┘
```

### 4.2 Por que existe um Worker fora da Vercel
Funções serverless da Vercel têm limite de duração e **não sustentam processos longos**. Ficam no Worker:
- agentes LiveKit (bot que entra na sala para gravar e medir presença);
- egress/gravação e upload dos arquivos;
- fila de transcrição e de análise de IA (jobs de minutos);
- os **2 agentes de voz do Roleplay IA** (lead + coach), com TTS da ElevenLabs;
- conexão persistente com as instâncias WhatsApp (Baileys/Evolution).

A Vercel roda a UI, as leituras/escritas de banco e os crons que **enfileiram** trabalho.

### 4.3 Stack detalhada
| Camada | Escolha | Observação |
|---|---|---|
| Framework | **Next.js 15**, App Router, TypeScript | RSC para listas pesadas; Server Actions para mutações |
| UI | **Tailwind CSS + shadcn/ui + Radix** | Dark-first, tema claro disponível |
| Ícones | **lucide-react** | Igual ao original |
| Tabelas | **TanStack Table** | Colunas configuráveis, sort, seleção |
| Kanban | **dnd-kit** | Drag & drop de deals entre etapas |
| Gráficos | **Recharts** ou SVG próprio | Donut de segmentos, barras+linha de evolução |
| Estado servidor | **TanStack Query** | Cache + invalidação; Realtime empurra updates |
| Datas | **date-fns** + `date-fns-tz` | Fuso `America/Sao_Paulo` fixo |
| Formulários | **react-hook-form + zod** | Zod compartilhado entre client e server |
| Banco | **Supabase Postgres** | RLS obrigatório em todas as tabelas |
| Migrations | **Supabase CLI** (`supabase/migrations`) | Versionado no repo |
| Auth | **Supabase Auth** | E-mail + senha e magic link; `profiles` espelha `auth.users` |
| Storage | **Supabase Storage** (bucket `recordings`, `cases`, `avatars`) | Signed URLs com expiração |
| Vídeo | **LiveKit Cloud** ou self-hosted | Rooms, tokens, egress, webhooks |
| WhatsApp | **Evolution API** (Baileys) | Uma instância por closer, pareamento por QR |
| LLM | **Claude API** — `claude-sonnet-5` (análises em volume) e `claude-opus-5` (relatórios semanais/planos) | Prompt caching para o roteiro de 10 aspectos |
| STT | **Whisper** (`whisper-large-v3`) ou Deepgram Nova | Diarização por falante |
| TTS | **ElevenLabs** | Voz do lead-IA e do coach |
| Filas | **pgmq** no Supabase ou **BullMQ + Redis** no worker | Retry com backoff |
| Observabilidade | **Sentry** + logs estruturados no Postgres (`system_events`) | |

### 4.4 Estrutura de pastas
```
/app
  /(auth)/login
  /(app)
    /calendario
    /tarefas
    /pipeline           (kanban | lista | previsao)
    /leads
    /chat
    /agenda
    /sessoes
    /relatorio-calls    (semana | calls | desenvolvimento)
    /roleplay           (simulado | chat | ia)
    /convites
    /deals
    /participantes
    /gravacoes
    /admin/monitoramento
      /central-de-controle
      /livekit
      /whatsapp
  /api
    /webhooks/livekit
    /webhooks/whatsapp
    /invite/[token]      (redirect + log de acesso)
    /cron/*
/components
  /ui                    (shadcn)
  /layout                (Sidebar, TopBar, ThemeToggle)
  /drawers               (DealDrawer, LeadDrawer, SessionDrawer, SlotDrawer)
  /pipeline /calendar /chat /reports /roleplay
/lib
  /supabase              (client, server, admin, realtime)
  /ai                    (prompts, analise-call, boletim, nina, roleplay)
  /livekit /whatsapp
  /utils
/supabase
  /migrations /seed /functions
/worker                  (deploy separado)
```

---

## 5. Modelo de dados (Supabase / Postgres)

Convenções: `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at` via trigger, soft delete com `deleted_at` onde indicado. Todos os horários em `timestamptz`; a UI converte para `America/Sao_Paulo`.

### 5.1 Identidade e organização

**`profiles`** — espelha `auth.users`
| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| nome | text | |
| email | text unique | |
| role | enum `user_role` | `admin` \| `head` \| `closer` \| `sdr` |
| team_id | uuid FK teams | |
| avatar_url | text | |
| room_id | uuid FK rooms | sala pessoal |
| ativo | boolean default true | |
| tema | text default 'dark' | preferência de tema |

**`teams`** — id, nome, head_id (FK profiles), ativo.

**`rooms`** — id, nome, tipo (`pessoal` \| `sessao` \| `roleplay`), owner_id (FK profiles), livekit_room `text unique` (ex.: `closer-f1303d66-98fb-4d5e-ade6-c3e6f9ef0f11`), ativa.

### 5.2 Leads e participantes

**`leads`**
| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| nome | text not null | |
| email | text | |
| telefone | text | E.164 normalizado |
| empresa | text | |
| cargo | text | |
| setor | text | ex.: Educação, Varejo, Serviço, Tecnologia… |
| faturamento | text | faixa ("Até R$500 mil/ano") |
| funcionarios | text | faixa |
| lead_score | char(1) | `A`–`E`, null se não pontuado |
| status_enriquecimento | enum | `incompleto` \| `completo` \| `lancamento` |
| status_comercial | enum | `em_aberto` \| `convertido` \| `perdido` |
| responsavel_id | uuid FK profiles | null = "Sem responsável" |
| origem | text | `google`, `instagram`, `youtube`, `abm_outbound`, `abm_reactivation`, `manual`… |
| utm_source / utm_medium / utm_campaign / utm_term / utm_content | text | |
| origem_registro | text | `manual`, `import`, `webhook`, `mock-seed` |
| anotacoes | text | |
| deleted_at | timestamptz | |

Índices: `(responsavel_id)`, `(status_enriquecimento)`, `(origem)`, `gin(to_tsvector(nome||email||telefone||empresa))`.

**`session_participants`** — inscrição de um lead numa sessão
| Coluna | Tipo | Notas |
|---|---|---|
| id, session_id FK, lead_id FK | | unique (session_id, lead_id) |
| presente | boolean default false | |
| entrou_em / saiu_em | timestamptz | |
| tempo_min | int generated | minutos na sala |
| no_show | boolean generated | `not presente and sessao finalizada` |
| invite_id | uuid FK invites | por qual link entrou |
| origem_presenca | enum | `automatica` (≥5min) \| `manual` |

> A tela **Participantes** é uma *view* sobre `session_participants` + `leads` + `sessions`, com métricas Total Agendados e Agendados Hoje.

### 5.3 Sessões, salas e calendário

**`sessions`**
| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| data | date | |
| hora | time | slots de 30/60min |
| inicio_at / fim_at | timestamptz | derivados |
| tipo | enum | `grupo` \| `individual` |
| room_id | uuid FK rooms | |
| closer_id | uuid FK profiles | |
| team_id | uuid FK teams | |
| is_head | boolean | destaque laranja no calendário |
| status | enum | `agendada` \| `ao_vivo` \| `finalizada` \| `nao_realizada` \| `cancelada` |
| inscritos_count / presentes_count | int | denormalizados, recalculáveis |
| taxa_presenca | numeric generated | presentes/inscritos |
| leads_qualificados | int | count de score A/B entre presentes |
| encerrada_em | timestamptz | após isso o slot é **somente leitura** |

Índices: `(data, hora)`, `(closer_id, data)`, `(status)`.

### 5.4 Pipeline e negócios

**`pipeline_stages`** — id, chave (`leads_incompletos`, `leads_contatados`, `demo_agendada`, `demo_assistida`, `atendimento`, `pagamento`), nome, ordem, cor, is_ganho, ativa. *(configurável pelo admin)*

**`deals`**
| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| codigo | text | curto, ex.: `#807f` |
| lead_id | uuid FK leads | |
| stage_id | uuid FK pipeline_stages | |
| status | enum | `em_aberto` \| `ganho` \| `perdido` |
| motivo_perda | text | |
| valor | numeric(12,2) | |
| produto | text FK products | ex.: `Pro` |
| forma_pagamento | text | |
| previsao_fechamento | date | alimenta a aba Previsão |
| probabilidade | int | 0–100, usado no valor ponderado |
| link_pagamento | text | |
| closer_id | uuid FK profiles | |
| score | char(1) | espelha o lead_score |
| assistido | enum | `agendado` \| `sim_participou` \| `nao_compareceu` |
| sessao_agendada_id | uuid FK sessions | |
| mentoria_status | enum | `nao_aplicavel` \| `pendente` \| `agendada` \| `concluida` |
| ganho_em / perdido_em | timestamptz | |

Regra: `status = 'ganho'` só é aceito se `mentoria_status = 'concluida'` (constraint + validação na Server Action).

**`products`** — id, nome, valor_padrao, ativo.

**`deal_stage_history`** — deal_id, de_stage, para_stage, movido_por, movido_em. Alimenta o "Histórico" do drawer.

### 5.5 Tarefas, anotações e atividades

**`tasks`**
| Coluna | Tipo | Notas |
|---|---|---|
| id, deal_id FK, lead_id FK | | |
| assunto | text | |
| tipo | enum | `follow_up` \| `call_individual` \| `call_coletiva` \| `mensagem` \| `outro` |
| status | enum | `pendente` \| `concluida` \| `cancelada` |
| prioridade | enum | `baixa` \| `media` \| `alta` |
| prazo | timestamptz | vencido → destaque vermelho |
| parado_dias | int generated | dias desde a última atividade no deal |
| responsavel_id | uuid FK profiles | |
| concluida_em | timestamptz | |

**`notes`** — id, deal_id/lead_id, autor_id, conteudo, created_at.

**`activities`** — timeline unificada: id, deal_id, lead_id, tipo (`tarefa`, `nota`, `etapa`, `mensagem`, `call`, `convite`, `sistema`), titulo, descricao, payload jsonb, autor_id, ocorrido_em.

### 5.6 Conversas (WhatsApp) e Nina

**`whatsapp_instances`** — id, closer_id, nome, numero, status (`conectado`\|`desconectado`\|`pareando`), qr_code, ultima_conexao, falhas_pendentes.

**`conversations`** — id, lead_id, instance_id, status (`aberta`\|`arquivada`), responsavel_id, ia_ativa boolean, tags text[], ultima_mensagem_at, nao_lidas int, aguardando_desde timestamptz *(alimenta o badge "aguarda 1h")*.

**`messages`** — id, conversation_id, direcao (`in`\|`out`), autor (`lead`\|`closer`\|`nina`\|`sistema`), tipo (`texto`\|`audio`\|`imagem`\|`documento`\|`template`), conteudo text, media_url, template_nome, enviada_em, entregue_em, lida_em, external_id.

**`nina_templates`** — id, nome (`retomar_conversa`, `nina_confirmacao_agendamento_v4`, `pedido_permissao_ligacao`, `depoimento_*`), conteudo, tipo, ativo.

**`conversation_insights`** — conversation_id, resumo, sentimento, proximos_passos jsonb, gerado_em. *(botão "Gerar Insights com IA")*

### 5.7 Calls, gravações e análise

**`calls`** — id, session_id (nullable → `avulsa`), room_id, tipo (`grupo`\|`1_1`\|`avulsa`), closer_id, lead_id (nullable em grupo), inicio_at, fim_at, duracao_seg, engajamento int (0–100), is_roleplay boolean *(isola dos relatórios)*, solo boolean.

**`recordings`** — id, call_id, storage_path, url_assinada_cache, duracao_seg, tamanho_bytes, status (`processando`\|`pronta`\|`falhou`).

**`call_transcripts`** — call_id, texto, segments jsonb (`[{falante, inicio, fim, texto}]`), idioma, provider, custo.

**`call_analyses`** — call_id, resumo text, plano jsonb, engajamento int, scores jsonb `{aspecto_id: nota}`, pontos_fortes jsonb, a_desenvolver jsonb, modelo, gerado_em.

**`call_aspects`** — catálogo das 10 etapas do roteiro:
`rapport_frase_seguranca`, `situacao_mapear_negocio`, `gargalo_quantificado`, `preco_da_inacao`, `cases_com_identificacao`, `recomendacao_um_plano`, `checagem_entendimento_desejo`, `isolamento_objecoes_ocultas`, `garantia_e_virada`, `fechamento_assumido`.
Campos: id, chave, nome, ordem, descricao, dica_template, contexto (`grupo`\|`individual`\|`ambos`).

**`call_aspect_scores`** — call_id, aspect_id, nota (0–100), pulou boolean, evidencia text.

### 5.8 Relatórios de desenvolvimento

**`daily_reports`** — id, closer_id, data, score int, narrativa text, constancia_dias int, engajamento_medio numeric, delta_vs_ontem int, ponto_atencao jsonb, calls_analisadas int, plano_preparacao jsonb `{itens:[], concluidos:0}`.

**`weekly_reports`** — id, closer_id, semana_inicio, semana_fim, score int, narrativa text, calls_count int, engajamento int, pontos_fortes jsonb, a_desenvolver jsonb, frentes_foco jsonb (3 itens), sentimento text.

**`aspect_trends`** — closer_id, aspect_id, periodo, nota_atual, nota_anterior, vezes_pulou, contexto (`grupo`\|`individual`). Alimenta "era 28 · pulou 4×".

### 5.9 Roleplay

**`roleplay_scenarios`** — id, titulo, aspect_id, dificuldade (`facil`\|`medio`\|`dificil`), origem (`relatorio`\|`manual`\|`livre`), persona_prompt text, contexto text, closer_id (null = global), ativo. *(85 cenários no exemplo, a maioria gerada "do relatório")*

**`roleplay_sessions`** — id, closer_id, scenario_id, modo (`simulado`\|`chat`\|`voz`), room_id, parceiro_id (outro closer), transcript jsonb, duracao_seg, recording_id, feedback jsonb, iniciada_em, finalizada_em.
> Regra: toda call originada de roleplay tem `calls.is_roleplay = true` e **é excluída** de relatórios, scores e métricas de vendas.

### 5.10 Convites e rastreamento

**`invites`** — id, session_id, lead_id, token text unique, tipo (`rastreado`\|`convidado`), url, cliques int default 0, primeiro_acesso_em, contabilizado boolean, criado_por.

**`invite_access_logs`** — invite_id, ip, user_agent, referer, acessado_em.

### 5.11 Cases, apresentações e mentoria

**`cases`** — id, titulo, cliente, setor, logo_url, metrica_destaque text (ex.: "200x Redução de Preço"), rotulo_metrica, resumo, link, ativo. Índice por `setor` para o match.

**`deal_cases`** — deal_id, case_id, tipo_match (`exato`\|`aproximado`), score.

**`sales_presentations`** — id, deal_id, conteudo jsonb (slides), gerada_em, gerada_por (`ia`), modelo.

**`action_plans`** — id, deal_id, call_id, itens jsonb, gerado_em.
> Regra: o plano de ação só é gerado **após uma call individual com transcrição**.

**`mentorships`** — id, deal_id, mentor_id (sorteado), agendada_em, status (`pendente`\|`agendada`\|`realizada`), email_enviado_em, convite_id.

### 5.12 Sistema

**`system_events`** — id, tipo, severidade, origem (`livekit`\|`whatsapp`\|`ia`\|`cron`), payload jsonb, created_at. Alimenta o painel de **anomalias** do Monitoramento.

**`jobs`** (se usar pgmq, substituir) — id, tipo, payload jsonb, status, tentativas, erro, agendado_para.

---

## 6. Módulos e requisitos funcionais

Cada módulo abaixo descreve: propósito, layout, requisitos funcionais (RF) e regras de negócio (RN).

---

### 6.1 Layout base (shell)

**Sidebar fixa (240px), colapsável** por botão flutuante na borda.
- Logo no topo.
- Grupo **OPERAÇÃO**: Calendário, Minhas Tarefas, Pipeline, Leads, Chat, Minha Agenda, Minhas Sessões, Relatório de Calls, Roleplay, Convites, Deals, Participantes, Gravações.
- Grupo **ADMINISTRAÇÃO**: Monitoramento *(só `admin` e `head`)*.
- Rodapé: avatar + nome/e-mail + badge de papel, alternador **Tema Escuro / Tema Claro**, **Sair**.

**RF**
- RF-L1: item ativo destacado com barra vertical à esquerda + fundo elevado.
- RF-L2: estado colapsado persistido em `localStorage`.
- RF-L3: tema persistido em `profiles.tema` e aplicado no server (sem flash).
- RF-L4: cabeçalho de página padrão = ícone em caixa arredondada + título + subtítulo à esquerda; ações à direita.

---

### 6.2 Calendário de Sessões — `/calendario`

**Propósito:** visão operacional de toda a grade de sessões da semana, por hora e por dia.

**Layout**
- Card "Calendário Semanal" com contador total ("334 sessões programadas").
- Filtros: **Todos os times** e **Todas as salas**.
- Navegação: `‹` / `›` + rótulo do intervalo ("07 de set. – 13 de set. 2026").
- Legenda **Heads**: chip laranja "Head", chip cinza "Sem head".
- Grade: coluna **Hora** (06:00 → 23:00) × 7 colunas de dia (SEG…DOM). Dia atual com o número dentro de um círculo destacado; **coluna do dia atual com fundo levemente elevado**.
- Cada célula contém até 2 cartões de sessão + um agrupador **"+N salas"** expansível.
- Cartão de sessão: bolinha de status, nome do closer (ou "–" quando oculto), ícone 👥 + nº de agendados, ✓ + nº de presentes, ícone de câmera quando houve gravação.
- Sessões com `is_head = true` recebem **borda e texto em âmbar**.

**Drawer do slot** (clique numa célula)
- Título: "Sexta-feira, 11 de setembro · 08:00" + chip "Head".
- Chips-resumo: "N sessões", "N agendados", "N presentes".
- Aviso **"Horário encerrado — só leitura"** quando `now > sessions.encerrada_em`.
- Lista das sessões do slot: closer, agendados, presentes, botão **Abrir** (vai para o detalhe da sessão).

**RN**
- RN-C1: o slot fica **somente leitura** após encerrado; nenhuma inscrição/remoção é aceita.
- RN-C2: closer vê a grade completa mas só abre sessões próprias; head vê o time; admin vê tudo.
- RN-C3: contadores vêm de view materializada refrescada a cada 60s + Realtime nas sessões ao vivo.

---

### 6.3 Minhas Tarefas — `/tarefas`

**Propósito:** fila de trabalho do closer.

**Layout**
- Busca "Buscar tarefa ou lead…", seletor de status (padrão **Pendentes**), botão **Filtros**.
- Chips de filtro ativo removíveis ("Status: Pendentes ×").
- Alternância **calendário / tabela** no canto superior direito + botão **Colunas**.
- Tabela com colunas ordenáveis: Assunto, Tipo, Status, Prioridade, **Prazo**, Parado, Lead, Etapa, Probabilidade, Reunião, Telefone.
- Rodapé: "Mostrando 1-34 de 34 tarefas" + seletor de itens por página (100 por página).

**RF**
- RF-T1: prazo vencido ou vencendo hoje em **vermelho**, com texto relativo ("cerca de 1 hora", "em 4 minutos", "em 2 dias").
- RF-T2: coluna **Parado** mostra dias sem atividade no deal ("1d", "Hoje").
- RF-T3: clique na linha abre o **drawer do deal** correspondente.
- RF-T4: seleção de colunas persistida por usuário.
- RF-T5: visão calendário posiciona as tarefas por `prazo`.

**RN**
- RN-T1: uma tarefa sempre pertence a um deal **ou** a um lead.
- RN-T2: concluir tarefa registra `activities` e reseta `parado_dias` do deal.

---

### 6.4 Pipeline — `/pipeline`

Três visões na mesma rota: **Kanban** (padrão), **Lista**, **Previsão**. Cabeçalho comum: botão **Cadastrar Lead** + seletor de visão.

#### 6.4.1 Kanban
- Filtros: busca, status (**Abertos** / Ganhos / Perdidos / Todos), **Todos os prazos**, ordenação (**Mais recente**), **Filtros**.
- Uma coluna por etapa, com cor, contador de leads e **soma de valor** no topo ("31 · 30 de 31 · ↗ R$ 278.352").
- Cada coluna tem ícones de **configurar** e **ocultar coluna**.
- Card do deal: nome, chip "Participou" quando assistiu a demo, empresa, telefone, data/hora do agendamento, **valor**, "N tarefa(s)" + data da próxima, data no canto inferior direito, **avatar com a letra do lead score (A–E)** colorido.
- Drag & drop entre colunas; scroll horizontal com barra própria.

**RN**
- RN-P1: mover card grava `deal_stage_history` e dispara automações da etapa (ver §8).
- RN-P2: colunas vazias exibem estado "Arraste leads para cá".
- RN-P3: o valor do topo é a **soma simples** dos deals abertos da coluna.

#### 6.4.2 Lista
- Tabela: seleção múltipla, Nome (+ empresa), Etapa (com bolinha colorida), Status, Valor, Closer, Criado em.
- Busca, **Filtrar** (com contador de filtros ativos), **Colunas**, contador de resultados.
- Ações em massa sobre a seleção: reatribuir closer, mudar etapa, exportar.

#### 6.4.3 Previsão (Forecast)
- Navegação por período: `‹` **Hoje** `›`, toggle **Incluir vencidas**, granularidade **Dia / Semana / Mês**.
- Uma coluna por período ("14 Set – 20 Set") com:
  - **valor ponderado** no topo (`Σ valor × probabilidade`) — ex.: ↗ R$ 145.152,00;
  - **Pipeline** total bruto (R$ 725.760,00);
  - cards: nome, empresa, valor, badge de prazo (**+5d** em cinza = a vencer; **−207d** em vermelho = atrasado), badge de probabilidade (20%);
  - rodapé "N negócio(s)".
- Períodos sem deals mostram "Sem negócios".

**RN**
- RN-P4: o deal aparece na coluna do seu `previsao_fechamento`. Sem previsão → não entra no forecast.
- RN-P5: "Incluir vencidas" traz deals com previsão passada para a primeira coluna.

#### 6.4.4 Drawer do Deal (peça central do produto)

Abre por cima de qualquer tela. Estrutura:

**Cabeçalho**
- Nome do lead + ícone de editar + copiar + **badge de score (A–E)**.
- Empresa, e-mail, telefone + botão **Ligar**.
- Ações à direita: chip de status (**Pendente**), **Ver Call**, **Perdido** (✕), **Ganho** (🏆).

**Stepper de etapas** horizontal, em formato de setas: LEADS INCOMPLETOS › LEADS CONTATADOS › **DEMO AGENDADA** › DEMO ASSISTIDA › ATENDIMENTO › PAGAMENTO. A etapa atual é destacada; clicar move o deal.

**Coluna esquerda (scrollável)**
1. **Agendamento**: data grande ("14/09 14:00 · segunda") + código curto (`#807f`); selects **Responsável** e **Assistido** (`Agendado` / `Sim (participou)` / `Não compareceu`); Empresa, Cargo, Setor (select), Colaboradores; Faturamento; botão **Copiar link**.
2. **Dados do Negócio** + chip "Score D": "Lead agendado em 11/09/2026 às 17:44"; **Produto** (select), **Valor (R$)**, **Pagamento** (select), **Previsão** (date picker limpável), **Probabilidade** (select %), **Link pagamento**.
3. **Mentoria Estratégica** + chip de status: texto "Obrigatória antes de dar o **Ganho**. O mentor é sorteado e o cliente recebe e-mail + convite automaticamente." + botão **Agendar Mentoria**.
4. **Logs de Acesso**: "Cliques no link" com contador; lista de acessos ou "Nenhum acesso registrado ainda."
5. **Rastreamento (UTMs)**: Src, Med, Cmp, Term, Cont em fonte monoespaçada.

**Coluna direita — abas**
| Aba | Conteúdo |
|---|---|
| **+ Nova Tarefa** | Formulário inline (assunto, tipo, prioridade, prazo) |
| **Anotação** | Editor de nota livre |
| **Atividades** | Timeline com sub-filtros **Tudo (n) / Tarefas (n) / Histórico (n)**. Cada item: hora, título, descrição, "vence dd/mm hh:mm", chip "— A FAZER · ALTA", ações **Abrir minha sala**, **Concluir**, **Editar**, **Excluir** |
| **Chat** | Conversa WhatsApp do lead; se não houver, estado vazio com telefone formatado e botão **Iniciar Conversa via WhatsApp** |
| **Chat Nina** | Histórico do agente IA: "4 enviadas · 0 respostas" + chip **Nina respondendo**; bolhas marcadas `NINA` com `[template: nome]` ou texto livre, com horário e ✓✓ |
| **Cases** | "Cases relevantes — N matches pro setor X", busca, cards com logo, título, cliente, chip do setor, **métrica destaque**, ações **Link** e **Resumo**, badge **MATCH EXATO** |
| **Plano de Ação** | Bloco "Apresentação de vendas — Personalizada por IA, cruza o lead, o resumo da call, cases e soluções" + botão **Gerar apresentação**; abaixo, o plano de ação (estado vazio: "O plano é gerado automaticamente após uma call individual com transcrição") |

**RN**
- RN-D1: **Ganho** só é habilitado com `mentoria_status = 'concluida'`; caso contrário o botão abre o fluxo de agendar mentoria.
- RN-D2: **Perdido** exige motivo (select + texto livre).
- RN-D3: todo campo alterado grava em `activities` (histórico).
- RN-D4: os Cases são buscados por `setor` do lead — match exato primeiro, depois aproximado por embedding.
- RN-D5: "Abrir minha sala" leva à sala pessoal do closer com o lead pré-associado à call.

---

### 6.5 Leads — `/leads`

**Propósito:** captar, enriquecer e converter leads em agendamento.

**Layout**
- Barra de métricas: **Total: 241** · Incompleto: 4 · Completo: 233 · Lançamento: 4 · 1 convertido · ⚠ 1 perdido.
- Busca + filtros: **Todos os status** (Todos / Em aberto / Convertidos / Perdidos), **Todos os responsáveis** (Todos / Sem responsável / lista de closers), **Todas as origens** (abm_outbound, abm_reactivation, google, instagram, youtube…), **ordenação** (Mais recentes / Mais antigos / Nome A-Z).
- Botão **Exportar filtro** (CSV do resultado filtrado).
- Três colunas por estado de enriquecimento, cada uma com subtítulo explicativo e contador:
  - **Lead incompleto** — "Recém-importado, ainda falta qualificação"
  - **Lead completo** — "Dados completos, pronto para entrar em contato"
  - **Lead Lançamento** — "Destinado ao lançamento"
- Card: nome, empresa + cargo, e ações rápidas **WhatsApp**, **Ligar**, **Agendar**. Sem telefone → só **Agendar** e texto "Sem telefone". Leads já convertidos exibem chip **Convertido** e perdem a ação Agendar.

**Drawer do Lead**
- Cabeçalho: nome, e-mail, telefone; ações **WhatsApp**, **Agendar**, **Perdido**.
- Stepper: LEAD INCOMPLETO › LEAD COMPLETO › LEAD LANÇAMENTO.
- **Dados do Lead**: Nome, E-mail, Telefone, Empresa, Cargo, Faturamento, Funcionários, Setor, **Lead score**, **Responsável** (select, "Sem responsável").
- Painel direito **Origem**: Source, Medium; campo **Anotações**; rodapé "Origem do registro: manual (mock-seed) · criado em 26/06/2026 às 12:03".

**RN**
- RN-LD1: o lead passa automaticamente para `completo` quando nome, telefone, empresa, cargo e setor estiverem preenchidos.
- RN-LD2: **Agendar** abre o seletor de sessão disponível e cria `session_participants` + deal na etapa **Demo Agendada**.
- RN-LD3: deduplicação por telefone normalizado (E.164) e e-mail; importação avisa duplicatas.
- RN-LD4: "Exportar filtro" respeita as permissões do usuário (um closer nunca exporta lead de outro).

---

### 6.6 Chat — `/chat`

**Propósito:** inbox de WhatsApp do time, com IA assistindo.

**Layout em 3 colunas**

**(1) Lista "Chats Ativos"** com contador total (4712)
- Busca "Buscar conversa…".
- Filtros em chips: **Todas**, **Não respondidas (122)**, **Não lidas (369)**, **+24h (119)**.
- Item: avatar (foto do WhatsApp ou iniciais), nome, horário da última mensagem, prévia (ou "🎵 Áudio", "secretEncryptedMessage"), chip do responsável, **badge de SLA em âmbar ("aguarda 1h", "aguarda 3h")**, badge de não lidas.

**(2) Thread**
- Cabeçalho: avatar, nome, chip de estado do lead ("Reunião Agendada"), telefone; ações **ligar**, **vídeo**, **⋮**.
- Bolhas com separador de data ("Hoje"), horário e ✓✓.
- Composer: **+** (anexos), campo com placeholder **"Pedro Ernesto está respondendo automaticamente…"** quando a IA está ativa, emoji, anexo, microfone (áudio) e enviar.

**(3) Painel do contato**
- **Insights IA** + botão **Gerar Insights com IA**.
- Avatar, nome, chip de estado.
- **Agendamento**: data e hora com ícone de confirmado.
- **Contato**: telefone, e-mail, empresa.
- **Perfil**: setor.
- **Responsável**: select.
- **Tags**: chips (IA, Automação) + **+ Add**.
- **UTMs**: Source, Medium, Campaign.

**RF**
- RF-CH1: mensagens em tempo real via Supabase Realtime (canal por conversa) alimentado pelo webhook da Evolution API.
- RF-CH2: SLA calculado a partir da última mensagem **inbound** sem resposta; chips `<1h`, `1-3h`, `+24h`.
- RF-CH3: áudio recebido é transcrito e exibido com o texto abaixo do player.
- RF-CH4: envio otimista com estado `enviando → enviada → entregue → lida`.
- RF-CH5: alternar IA por conversa (`conversations.ia_ativa`) — com a IA ligada, o composer avisa que a Nina está respondendo.

**RN**
- RN-CH1: um closer só vê conversas de leads sob sua responsabilidade (ou sem responsável, se o admin permitir a fila aberta).
- RN-CH2: assumir uma conversa atribui automaticamente o lead ao closer.

---

### 6.7 Minha Agenda — `/agenda`

**Propósito:** visão pessoal unificada do dia — reuniões, sessões e tarefas no mesmo lugar.

**Layout**
- Chips de resumo da semana: **43 eventos · 15 reuniões · 12 sessões · 16 tarefas** + navegação `‹ › Hoje`.
- Faixa de 7 dias (SEGUNDA…DOMINGO) com o número do dia, **pontos coloridos por tipo de evento** e a contagem total do dia. Dia selecionado com borda destacada.
- Painel esquerdo: dia selecionado, bloco **AGORA** ("Sem próximos itens"), **HOJE** ("Dia livre."), e no rodapé **PROGRESSO** com barra e contadores (Sessões / 1:1 / Tarefas).
- Painel direito: lista do dia com chip "N eventos"; cada item tem ícone por tipo (vídeo = reunião, ✓ = tarefa), título, horário + duração, participante, chip de tipo (**Reunião** / **Tarefa**) e seta para abrir. Evento em andamento recebe chip **● Ao vivo**.

**RN**
- RN-A1: agrega `sessions` (onde o usuário é closer), `session_participants` 1:1 e `tasks` com prazo no dia.
- RN-A2: "Progresso" = itens concluídos / total do dia.

---

### 6.8 Minhas Sessões — `/sessoes`

**Layout**
- Card **Minha Sala**: chip **Disponível/Ocupada**, "Gerencie sua sala pessoal", **ID da Sala** em monoespaçado (`closer-f1303d66-…`) com copiar, botão grande **▶ Iniciar Sala**.
- Métricas: **Total de Sessões** (323 — "12 grupos, 311 individuais"), **Esta Semana** (15, com intervalo de datas), **Participantes** (1000 — "Agendamentos recebidos").
- Busca de participante + filtros rápidos: **Todos / Hoje / Amanhã / Semana / Mês / Personalizado**.
- Abas: **Próximas (8)** · **Realizadas (2)** · **Não Realizadas (313)**.
  - *Próximas*: hora, nome do lead, chip **Individual**, data por extenso, chip **Agendada**, ícone para abrir o lead.
  - *Realizadas*: hora, data, sala, "N participaram" + ícone 👁 para abrir o detalhe.
  - *Não Realizadas*: mesma estrutura, com chip vermelho **Não compareceu** para 1:1 e "0 participaram" para grupos.
- Botão **Gerar links de convite para leads** (atalho para Convites).

#### Detalhe da Sessão (tela cheia / drawer)
- Cabeçalho: "Sessão" + chip **Finalizada**, data e hora, botão **Adicionar Participante** (tooltip "Cadastrar novo participante para esta sessão"), seletor de closer.
- Barra de métricas: **Inscritos 14** · **Participaram 7/14** · **Taxa de Presença 50%** · **Leads Qualificados (A/B) 4** · botão **↻ Recalcular**.
- Abas: **Participantes** · **Sala ao Vivo** · **Relatório da Call** (com indicador de disponibilidade).
- *Participantes*: lista com checkbox de presença, avatar com iniciais, nome, empresa/e-mail, ícone de **transferir** (mover para outra sessão), ícone de **copiar link do convite**, badge de score, e chip **Participou** (verde) ou **No-show** (vermelho). Filtros por presença/score/origem.
- Painel direito: **Segmentos predominantes na sessão** — donut com total de inscritos ao centro e legenda com setor, contagem e percentual. Nota: "Os segmentos são definidos com base nas informações de perfil dos participantes."

**RN**
- RN-S1: **Recalcular** reprocessa presença a partir dos eventos do LiveKit e dos acessos de convite.
- RN-S2: presença automática exige **≥ 5 min** na sala; abaixo disso, fica manual.
- RN-S3: "Sala ao Vivo" só é habilitada enquanto `status = 'ao_vivo'`.

---

### 6.9 Relatório de Calls — `/relatorio-calls`

**Propósito:** transformar as calls em diagnóstico de performance e plano de desenvolvimento.

Cabeçalho editorial: "— RELATÓRIO DE CALLS / **Sua semana de calls tem uma história.**" com subtítulo explicativo. Três abas:

#### Aba 1 — Visão da semana
- Chip do período ("SEMANA · 31 AGO – 6 SET 2026") e linha "Baseado no seu relatório semanal de 7 set · 26 calls na semana".
- **Título-narrativa gerado por IA** ("Seu ritmo está *melhorando*.") + parágrafo analítico.
- 4 cartões de métrica com **sparkline**: Calls no período (117, +57 vs. 30d) · Engajamento (60/100, +14pts vs. 30d) · Score da semana (62/100, +13pts) · Sentimento (— / "sem dados").
- **Sua evolução · últimos dias**: gráfico combinado — barras = calls por dia, linha = score do relatório diário; legenda alternável Calls/Score; caixa **Leitura** com a interpretação em texto.
- **O que a IA observou na sua semana**: 3 cartões em itálico (2 **Ponto forte**, 1 **A desenvolver**) com nome do aspecto, nota/100, tendência e evidência.
- **Próximos passos · seu desenvolvimento → "3 frentes pra focar"**: 3 itens numerados com instruções acionáveis literais.
- Lateral: caixa **Dica** + botões **Ver meu desenvolvimento diário →** e **Atualizar a semana →**.

#### Aba 2 — Minhas calls
- Contador ("117 calls") + seletor de período ("Últimos 30 dias").
- Lista de calls: chip de tipo (**Grupo** / **1:1**), identificador (nome do lead ou id da sala), data/hora, duração, chips de artefatos disponíveis — **Transcrição**, **Análise**, **Resumo**, **Plano** (desabilitado quando não existe) — e badge **Engajamento N/100**. Seta abre o detalhe da call.

#### Aba 3 — Meu desenvolvimento
- **Boletim de Desenvolvimento**: anel de score (62/100) + chip de faixa ("No caminho"), nome do closer, "Boletim de Quinta-feira, 10 de setembro · 7 calls analisadas", **narrativa do dia gerada por IA**, métricas **Constância (3 dias em sequência)**, **Engajamento médio (69.7/100)** e **delta vs. o dia anterior (-9 pts)**.
- Lateral: **melhor score · 30d (71)**, **score médio · 30d (40)**, **maior sequência (5)**; botões **↻ Gerar o de hoje** e **Plano de preparação · 0 de 3**; caixa **Ponto de atenção de hoje**.
- **Notas por aspecto**: alternador **Call em grupo (58)** / **Call individual (23)**; linha de resumo ("10 etapas · ● 10 fracas"); lista ordenada da pior para a melhor nota, cada item com: **nota /100**, nome do aspecto, tendência ("↘ era 28"), chip **"pulou 4×"** e **dica acionável literal** ("Pergunte: 'Você me disse que perde R$ 20k/mês…'").

**RN**
- RN-R1: calls com `is_roleplay = true` **nunca** entram nesses números.
- RN-R2: escala de score: 0–39 crítico (vermelho), 40–69 no caminho (azul), 70–100 forte (verde).
- RN-R3: "pulou N×" = número de calls do período em que o aspecto teve nota 0 ou não foi detectado.
- RN-R4: o boletim diário é gerado por cron às 23h; o botão "Gerar o de hoje" força a geração sob demanda (rate-limit 1/hora).
- RN-R5: as **3 frentes pra focar** viram automaticamente cenários de roleplay (§6.10).

---

### 6.10 Roleplay — `/roleplay`

**Propósito:** treinar sem queimar lead real. Cabeçalho: "**Treine antes de fechar de verdade.**" Três modos em abas.

#### Modo 1 — Roleplay simulado (closer × closer)
- Card "CLOSER × CLOSER — Treine com outro closer, ao vivo.", com explicação de papéis.
- Campo **LINK PARA O OUTRO CLOSER** (`https://call.<dominio>/join-room?room=roleplay-<uuid>`) + botões **Copiar** e **Abrir**.
- Aviso: "O link só conecta depois que você iniciar a sala. O outro closer entra como convidado, sem precisar de login."
- Botão **▶ Iniciar sala de treino** + chip **● Sala pronta**.
- Três cartões informativos: **Áudio e vídeo** (mesma sala das calls reais) · **Papéis** (1 faz de lead · 1 treina) · **Gravação** (fica salva pra você rever).

#### Modo 2 — Roleplay chat (texto com IA)
- Painel esquerdo **CENÁRIOS DE TREINO (85)** com busca. Cada cenário: chip do aspecto, título, e rodapé "Dificuldade · **do relatório**". O primeiro é **Conversa livre** (chip "Livre", "Lead genérico e cético · sem foco").
- Painel direito: título do cenário, área de conversa (estado vazio: "Conversa livre. Comece a falar com o lead como numa call de verdade.") e composer "Escreva sua fala…" + **Enviar**.

#### Modo 3 — Roleplay IA (voz)
- Mesma lista de cenários à esquerda.
- Painel direito: ícone grande de microfone, **"Ligação com lead-IA"**, estado "Pronto para iniciar", explicação ("Você fala no microfone e o **lead-IA** responde em áudio, em tempo real. Quando você escorregar, o **coach** corta, corrige numa frase e devolve pro lead.").
- Seletores de **MICROFONE** e **ALTO-FALANTE** ("Padrão do sistema") + link "Liberar microfone para ver os nomes dos dispositivos".
- Botão **📞 Iniciar call**.
- Rodapé técnico: "A call usa 2 agentes de voz na nossa VPS (lead + coach, voz da ElevenLabs). Fica gravada pra você rever, isolada das calls reais. Precisa do worker no ar + `ROLEPLAY_VOICE_ENABLED=true`."

**RN**
- RN-RP1: **toda** gravação de roleplay é marcada `is_roleplay = true` e excluída de relatórios, scores e métricas.
- RN-RP2: cenários com `origem = 'relatorio'` são gerados a partir dos aspectos fracos do closer (job diário) e carregam a nota no chip quando relevante ("Garantia e virada (0/100, caindo)").
- RN-RP3: se `ROLEPLAY_VOICE_ENABLED=false` ou o worker estiver fora, o modo voz aparece desabilitado com aviso claro.
- RN-RP4: ao fim de um roleplay a IA devolve feedback estruturado nos mesmos 10 aspectos (sem contaminar o score oficial).

---

### 6.11 Convites — `/convites`

**Propósito:** gerar links rastreados para os leads agendados.

**Layout**
- Subtítulo: "Gere links rastreados para os leads agendados. Links rastreados contabilizam a reunião automaticamente (≥ 5min na sala)."
- Seletores: **Dia** (date picker) e **Sessão / Horário** (select).
- Área de resultado: estado vazio "Escolha um closer, dia e sessão para ver os leads."; preenchido, lista os leads inscritos com botões **Copiar link** / **Enviar por WhatsApp** e o contador de cliques.
- Aviso em destaque: "⚠ **Convidado** gera um link sem rastreamento — use apenas para acompanhantes do lead. Não contabiliza como reunião realizada."

**RN**
- RN-CV1: `token` único por (sessão, lead); o mesmo lead reusa o link se já existir.
- RN-CV2: o acesso via `/api/invite/[token]` grava `invite_access_logs`, incrementa `cliques` e redireciona para a sala com o participante identificado.
- RN-CV3: presença é confirmada pelo webhook do LiveKit quando o participante identificado permanece ≥ 5 min.

---

### 6.12 Deals — `/deals`

**Propósito:** visão tabular completa de **todos** os negócios do sistema (escopo por permissão).

- Busca por nome/e-mail/telefone, **Filtrar**, **Colunas**, contador ("4.244 resultados"), **Exportar CSV**.
- Colunas: seleção, Nome (+ empresa), Etapa (bolinha colorida), Status (chip "Em aberto" / "Perdido" / "Ganho"), Valor (ordenável), Closer, Criado em (ordenável).
- Paginação server-side (keyset) — a base é grande.

**RN**
- RN-DL1: exportação em CSV é assíncrona acima de 5.000 linhas (gera arquivo no Storage e notifica).
- RN-DL2: o escopo respeita o papel; um closer vê "Todos os Deals" = todos os *seus*.

---

### 6.13 Participantes — `/participantes`

**Propósito:** base completa de leads agendados.

- Métricas: **Total Agendados (4244)** e **Agendados Hoje (23)**.
- Botão **+ Novo Participante**.
- Busca + filtros: **Todos os setores**, **Todos** (status de presença), **Todos os closers**, **Todos os períodos**.
- Tabela: Nome, E-mail, Telefone, Empresa, Setor, **Lead Score** (badge circular colorido A–E), Closer, **Agendamento** (data + hora), Criado em.

**RN**
- RN-PT1: criar participante cria (ou vincula) o lead e a inscrição na sessão escolhida.
- RN-PT2: cores do score: A verde, B azul, C âmbar, D vermelho, E cinza.

---

### 6.14 Gravações — `/gravacoes`

**Propósito:** biblioteca de calls gravadas, com transcrição e análise.

- Faixa de métricas: **GRAVAÇÕES 9.630** · **EM GRUPO 3.927** · **1:1 5.273** · **AVULSAS 430** · **TEMPO GRAVADO 7.555 h**, com a nota "Base filtrada completa, sem gravações duplicadas — os números não mudam ao trocar de página".
- Busca "Buscar lead em toda a base…", **Todos os closers**, **Todas as datas**, **Filtros**, botão **↻ Atualizar**.
- Grade de cards (3 colunas): ícone do tipo (pessoa = 1:1, grupo, telefone = avulsa), nome do lead (ou "Sem closer"), tipo · data · hora, chip **Solo**, duração, botão **▶ Reproduzir**. Cards de grupo mostram "sessão 18:00".
- Paginação numerada com total ("Página 1 de 1070 · 9.630 gravações no filtro").

**RN**
- RN-GR1: URLs de mídia são **signed URLs** com validade curta, geradas na hora do play.
- RN-GR2: o player abre em modal com abas Transcrição / Resumo / Análise, sincronizadas por timestamp.
- RN-GR3: as métricas do topo são de **toda a base filtrada** (query agregada separada da paginação).
- RN-GR4: retenção configurável; gravações antigas migram para armazenamento frio.

---

### 6.15 Monitoramento — `/admin/monitoramento`

**Propósito:** operação em tempo real. Subtítulo: "Operação em tempo real. Acompanhe sessões, salas LiveKit e instâncias WhatsApp ao vivo."

Três cartões de entrada:

1. **Central de Controle** — "Dashboard de operação ao vivo: totais do dia, navegador de sessão, status de gravação, funnel, leads ao vivo, timeline e anomalias."
2. **Monitor – LiveKit** — "Salas LiveKit em tempo real: participantes online, tracks de áudio/vídeo/screen, duração e waiting room com lead score."
3. **WhatsApp Monitor** — "Status das instâncias WhatsApp por closer, fila de mensagens falhadas e pareamento via QR Code."

**RN**
- RN-M1: acesso restrito a `admin` (e `head` limitado ao próprio time).
- RN-M2: dados via Supabase Realtime + polling de 5s nos webhooks do LiveKit/WhatsApp.
- RN-M3: **anomalias** detectadas: sessão ao vivo sem gravação, instância WhatsApp caída, fila de transcrição travada, sessão com 0 presentes após 15min, taxa de no-show anormal.
- RN-M4: reparear WhatsApp exibe QR Code com refresh automático.

---

## 7. Camada de IA

### 7.1 Pipeline de análise de call

```
call finaliza (webhook LiveKit)
  → job: baixar gravação → Storage
  → job: transcrever (Whisper, com diarização)   → call_transcripts
  → job: analisar (Claude)                        → call_analyses + call_aspect_scores
  → job: se 1:1 com transcrição → gerar plano     → action_plans
  → atualiza engajamento da call e do deal
  → 23h: consolidar boletim diário                → daily_reports
  → domingo 22h: consolidar relatório semanal     → weekly_reports
  → gerar/atualizar cenários de roleplay          → roleplay_scenarios
```

### 7.2 Prompts (contratos de saída)

Todos os prompts pedem **JSON estrito** validado com Zod; falha de schema = retry (máx. 2) e depois marca o job como `falhou` com o payload bruto salvo.

**A. Análise de call** (`claude-sonnet-5`)
Entrada: transcrição com falantes, tipo da call, dados do lead, catálogo dos 10 aspectos (em *prompt cache*).
Saída:
```json
{
  "resumo": "string",
  "engajamento": 0,
  "sentimento": "positivo|neutro|negativo",
  "aspectos": [{ "chave": "preco_da_inacao", "nota": 0, "pulou": true, "evidencia": "citação da transcrição", "dica": "frase acionável" }],
  "pontos_fortes": ["..."],
  "a_desenvolver": ["..."],
  "objecoes": ["..."],
  "proximos_passos": ["..."]
}
```

**B. Boletim diário** (`claude-sonnet-5`) — entrada: análises do dia + boletim de ontem. Saída: `{score, narrativa, ponto_atencao, plano_preparacao[3], delta_vs_ontem}`. Tom: direto, 2ª/3ª pessoa, cita calls e nomes reais.

**C. Relatório semanal** (`claude-opus-5`) — entrada: boletins da semana + tendências. Saída: `{titulo_narrativa, narrativa, pontos_fortes[2], a_desenvolver[1], frentes_foco[3], dica}`. O `titulo_narrativa` é a manchete da tela ("Seu ritmo está melhorando.").

**D. Nina (SDR no WhatsApp)** (`claude-sonnet-5`) — recebe histórico da conversa, dados do lead, agendamento e a biblioteca de templates. Decide entre enviar um template ou texto livre. **Nunca inventa horário**: consulta as sessões disponíveis via tool call.
Ferramentas expostas: `listar_sessoes_disponiveis`, `agendar_lead`, `remarcar`, `marcar_perdido`, `escalar_para_humano`.

**E. Cenário de roleplay** — a partir de um aspecto fraco, gera persona do lead, contexto do negócio, objeções a usar e critério de sucesso.

**F. Lead-IA e Coach (voz)** — dois agentes no worker: o lead-IA interpreta a persona do cenário; o coach monitora a fala do closer e **interrompe** quando detecta desvio do roteiro, corrige em uma frase e devolve a palavra ao lead.

**G. Cases relevantes** — match por `setor` (exato) + embeddings (`pgvector`) sobre o resumo do case e a dor identificada na call.

**H. Apresentação de vendas** — cruza lead + resumo da call + cases + produto → slides em JSON.

**I. Insights da conversa (Chat)** — resumo, temperatura, objeções e próxima ação sugerida.

### 7.3 Custos e controles
- Cache de prompt para o catálogo de aspectos e o roteiro de vendas (conteúdo estável, alto volume).
- Limite diário de tokens por closer, configurável.
- Toda chamada registra `modelo`, `tokens_in/out`, `custo_estimado` em `ai_usage`.
- Análises são idempotentes por `call_id` (reprocessar exige flag explícita).

---

## 8. Automações e jobs

| Job | Gatilho | Ação |
|---|---|---|
| `on_deal_stage_change` | Trigger no `deals` | Grava histórico, cria tarefa padrão da etapa, dispara mensagem da Nina quando configurado |
| `on_session_end` | Webhook LiveKit | Marca presença, calcula taxa, enfileira gravação |
| `presence_check` | Webhook LiveKit `participant_left` | Se ≥5min e veio de convite rastreado → `presente = true` |
| `transcribe_queue` | Fila | Transcrição das gravações pendentes |
| `analyze_queue` | Fila | Análise de IA das transcrições prontas |
| `daily_report` | Cron 23:00 | Boletim diário de cada closer com calls no dia |
| `weekly_report` | Cron domingo 22:00 | Relatório semanal + atualização dos cenários de roleplay |
| `stale_deals` | Cron 07:00 | Marca `parado_dias`, cria tarefa de follow-up em deals parados > 3 dias |
| `no_show_followup` | Cron 30min após sessão | Cria tarefa e dispara template da Nina para no-shows |
| `whatsapp_health` | Cron 5min | Verifica instâncias, registra anomalia se caída |
| `forecast_refresh` | Cron 30min | Refresca a view materializada da Previsão |
| `mentorship_assign` | Ação do usuário | Sorteia mentor, cria evento, envia e-mail + convite ao cliente |
| `recording_retention` | Cron diário | Move gravações antigas para armazenamento frio |

---

## 9. Segurança e RLS

### 9.1 Princípios
- **Toda** tabela com `ENABLE ROW LEVEL SECURITY`. Nada é acessível pela chave anônima sem policy.
- A `service_role` só existe no Worker e nas Server Actions do servidor — **nunca** exposta ao browser.
- Funções auxiliares em SQL: `auth_role()`, `auth_team_id()`, `is_admin()`, `is_head_of(team_id)`.

### 9.2 Padrão de policy (exemplo para `deals`)
```sql
create policy "deals_select" on deals for select using (
  is_admin()
  or closer_id = auth.uid()
  or (auth_role() = 'head' and exists (
        select 1 from profiles p
        where p.id = deals.closer_id and p.team_id = auth_team_id()))
);

create policy "deals_update" on deals for update using (
  is_admin() or closer_id = auth.uid()
) with check (
  is_admin() or closer_id = auth.uid()
);
```
O mesmo padrão se aplica a `leads` (`responsavel_id`), `tasks` (`responsavel_id`), `sessions`/`calls`/`recordings` (`closer_id`), `conversations` (via `leads.responsavel_id`).

### 9.3 Outras medidas
- Storage privado; acesso somente por **signed URL** de curta duração gerada no servidor após checagem de permissão.
- Webhooks (LiveKit, Evolution) validados por assinatura HMAC + allowlist de IP.
- Tokens de convite: 32 bytes aleatórios, sem informação derivável; rota de redirect não expõe IDs internos.
- Auditoria: `activities` + `system_events` registram quem fez o quê.
- LGPD: soft delete + rotina de anonimização de lead a pedido; gravações com política de retenção declarada.
- Rate limit nas rotas públicas (`/api/invite/*`) e nas ações de IA.

---

## 10. Design system

### 10.1 Tokens (dark-first, com tema claro completo)
```css
:root {                      /* claro */
  --bg: #f7f8fa;  --surface: #ffffff;  --surface-2: #f1f3f6;
  --border: #e3e7ee;
  --text: #0f172a; --text-muted: #64748b;
  --accent: #2f6df6;         /* azul primário */
  --head: #e8912d;           /* âmbar — sessões de head, SLA */
  --success: #16a34a; --danger: #e5484d; --warning: #e8912d;
}
:root[data-theme="dark"] {
  --bg: #0a1020;  --surface: #101a30;  --surface-2: #16223d;
  --border: #1e2d4d;
  --text: #e8eef8; --text-muted: #8fa0bd;
  --accent: #4b7dfb; --head: #f0994a;
}
```
- **Raio:** 12px em cards, 10px em inputs, pill (999px) em chips e botões de filtro.
- **Tipografia:** sans geométrica (Poppins/Outfit) para títulos; sistema para corpo; **monoespaçada** para IDs, tokens e UTMs.
- **Elevação:** sem sombra pesada — profundidade por `--surface-2` e borda de 1px.
- **Densidade:** linhas de tabela 56–64px; grade do calendário com altura de linha fixa.

### 10.2 Componentes compartilhados
`PageHeader` · `FilterBar` · `StatChip` · `MetricCard` (com sparkline) · `ScoreBadge` (A–E) · `StageChip` · `StatusChip` · `SLAChip` · `DataTable` (colunas configuráveis) · `KanbanBoard` · `WeekGrid` · `SideDrawer` · `StepperStages` · `Timeline` · `EmptyState` · `DonutChart` · `ComboBarLineChart` · `AudioPlayer` · `TranscriptViewer`.

### 10.3 Acessibilidade
- Contraste AA em ambos os temas (o azul sobre fundo escuro precisa de checagem — usar `--accent` mais claro no dark).
- Navegação por teclado em drawers, kanban (mover card com setas) e tabelas.
- Estados de foco visíveis; `aria-live` nas listas em tempo real.
- Cor nunca é o único sinal: score tem letra, status tem texto, presença tem ícone.

### 10.4 Estados obrigatórios
Toda lista implementa: **loading (skeleton)**, **vazio com instrução**, **erro com retry**, **sem permissão**. Nunca uma tela em branco.

---

## 11. Variáveis de ambiente

```bash
# App
NEXT_PUBLIC_APP_URL=
TZ=America/Sao_Paulo

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # servidor/worker apenas

# LiveKit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_WEBHOOK_SECRET=
NEXT_PUBLIC_CALL_DOMAIN=          # ex.: call.seudominio.ai

# WhatsApp (Evolution API)
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_WEBHOOK_SECRET=

# IA
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_FAST=claude-sonnet-5
ANTHROPIC_MODEL_DEEP=claude-opus-5
OPENAI_API_KEY=                   # Whisper (STT) e embeddings
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_LEAD=
ELEVENLABS_VOICE_COACH=

# Worker
WORKER_URL=
WORKER_SHARED_SECRET=
ROLEPLAY_VOICE_ENABLED=false

# Regras de negócio
PRESENCA_MIN_MINUTOS=5
CRON_SECRET=
```

---

## 12. Roadmap de implementação

| Fase | Entrega | Telas / peças | Critério de pronto |
|---|---|---|---|
| **F0 — Fundação** | Base do projeto | Auth, `profiles`, RLS base, shell (sidebar, temas), design system, migrations, seed | Login funciona, papéis aplicados, tema persiste |
| **F1 — Núcleo comercial** | Leads → Deals | Leads (+drawer), Pipeline Kanban/Lista/Previsão (+drawer do deal), Minhas Tarefas, Deals | É possível captar, agendar, mover e fechar um deal ponta a ponta |
| **F2 — Operação de calls** | Agendamento e presença | Calendário (+drawer de slot), Minhas Sessões (+detalhe), Participantes, Convites, Minha Agenda, integração LiveKit | Link rastreado gera presença automática ≥5min |
| **F3 — Conversas** | WhatsApp | Chat (3 colunas), instâncias, webhooks, templates, agente **Nina** | Mensagem entra e sai em tempo real; Nina agenda sozinha |
| **F4 — Inteligência** | Gravação → insight | Gravações, transcrição, análise, `call_aspect_scores`, Relatório de Calls (3 abas), boletins | Uma call vira nota nos 10 aspectos e entra no boletim |
| **F5 — Treino** | Roleplay | Modos simulado, chat e voz; cenários gerados do relatório | Roleplay não contamina métricas reais |
| **F6 — Gestão** | Monitoramento e admin | Central de Controle, Monitor LiveKit, WhatsApp Monitor, config de etapas/produtos/cases, mentoria | Admin enxerga a operação ao vivo e detecta anomalias |

**Ordem recomendada de construção dentro de cada fase:** migration → tipos gerados (`supabase gen types`) → queries/Server Actions → componentes → tela → seed de demonstração → testes.

---

## 13. Métricas, testes e critérios de aceite

### 13.1 Métricas do produto (dashboard interno)
Taxa de presença · conversão por etapa · ciclo médio por etapa · valor ponderado vs. realizado · SLA de primeira resposta · score médio do roteiro por closer e por time · aderência ao roleplay · custo de IA por call.

### 13.2 Testes
- **Unitários (Vitest):** cálculo de score, ponderação da previsão, regra de presença ≥5min, normalização de telefone, validação dos schemas de IA.
- **Integração:** policies RLS por papel (um closer não lê dado de outro — teste explícito para cada tabela).
- **E2E (Playwright):** captar lead → agendar → entrar pelo convite → encerrar sessão → ver presença → mover deal → registrar ganho (com mentoria obrigatória).
- **Carga:** Deals (4.244 linhas) e Gravações (9.630) com paginação keyset abaixo de 300ms P95.

### 13.3 Critérios de aceite globais
1. Nenhuma tela quebra sem dados — todo estado vazio tem instrução.
2. Nenhum dado sensível trafega sem RLS correspondente.
3. Todo número exibido é rastreável a uma query determinística (nada calculado só no front).
4. A troca de tema não altera hierarquia nem legibilidade.
5. Métricas agregadas (Gravações, Deals, Participantes) refletem **a base filtrada inteira**, não a página.
6. Roleplay é sempre isolado dos relatórios.
7. Toda ação de IA é reversível ou revisável por um humano antes de chegar ao lead.

---

## 14. Decisões em aberto (precisam da sua definição)

| # | Questão | Impacto |
|---|---|---|
| Q1 | LiveKit Cloud ou self-hosted na VPS? | Custo, latência e complexidade do egress |
| Q2 | Evolution API própria ou WhatsApp Business Cloud API oficial? | Templates, risco de banimento e custo por conversa |
| Q3 | O sistema será multi-time desde o início ou só um time? | Modelagem de `teams` e RLS de head |
| Q4 | O roteiro de 10 aspectos é fixo ou configurável pelo admin? | Se configurável, vira CRUD + versionamento das notas históricas |
| Q5 | Migração de dados do CRM atual ou começar limpo? | Define scripts de importação na F0 |
| Q6 | Retenção de gravações (90 dias? 1 ano? indefinido?) | Custo de storage e política de LGPD |
| Q7 | Produtos/valores são catálogo fechado ou valor livre por deal? | Já modelado com `products` + valor editável |

---

*Fim do PRD v1.0*


---

# Parte II — Plano derivado da engenharia reversa

## Prioridades, na ordem

### P1 · Dashboard (Início)
Hoje o usuário cai no Calendário e não tem leitura da operação. O original tem
`inicio`, `metrics`, `radar`, `controle-crm` e `painel-lider`.
Conteúdo: receita ponderada vs. fechada, funil por etapa com conversão,
**perdas por motivo** (agora possível), tarefas atrasadas, presença nas sessões,
ranking por closer (admin) e o próprio dia do vendedor.

### P2 · Fluxo público de agendamento — a ponte com o Meet
```
/agendar → /agendamento/:token → /obrigado/:token
                               ↘ /reagendamento/:token
/convite/:token → /sala/:bookingId
```
É isto que dispensa Cal.com. O lead escolhe o horário numa sessão com vaga, e o
mesmo `booking` atravessa convite, sala, presença e gravação.
`Meeting.roomId` e `SessionInstance.roomId` já estão reservados.

### P3 · Chat de WhatsApp
Schema de outbox já existe (`SendQueue`, `WhatsappInstance`). Falta: inbox de 3
colunas, SLA por conversa, webhook de entrada, e o worker que consome a fila.
**Evolution API**, uma instância por vendedor, pareamento por QR.

### P4 · Pipeline de Renovação
Segundo funil, pós-venda, com responsável de CS: `renovacao_pipeline_state`,
`renovacao_events`, `renovacao_loss_reasons`.

### P5 · Calls com IA
LiveKit Egress → **Deepgram Nova-3** → LLM. Alimenta gravações, transcrições,
notas por aspecto e o boletim do closer.

### P6 · Roleplay e Monitoramento
Dependem de P5 e da infraestrutura de sala estar no ar.

## Padrões que adotamos deles

1. **Versionar a função, não alterar.** `_v2`, `_v6` no nome; a nova sobe ao
   lado da antiga e o front migra quando quiser.
2. **Contadores separados da paginação.** Métrica de topo agrega a base
   filtrada inteira, nunca a página.
3. **Paginação por coluna no kanban.** "30 de 31" — é assim que 4 mil deals
   carregam rápido.
4. **Outbox para tudo que sai do sistema.** Retry, ordem e troca de provedor de graça.
5. **Presença derivada de tempo**, nunca de checkbox.

## Escala que o original opera (alvo de carga)

4.243 negócios · 4.243 participantes · 9.651 gravações (7.571 h) ·
4.710 conversas · 323 sessões por closer.


---

# Parte III — Achados do acesso Head (13/09)

## O diferencial real do CRM deles: o prompt é produto

A análise de call não é "um resumo por IA". É uma **auditoria contra um playbook
escrito**, com rubrica por bloco, elementos obrigatórios, gatilho esperado e
vocabulário proibido contado com evidência. O prompt de grupo tem 13.605
caracteres e é o playbook comercial inteiro.

E ele é **editável na interface**, com escopo **global ou por time** — cada time
pode ter o próprio pitch. Isso é o que permite o playbook evoluir sem deploy.

**O erro deles que não vamos repetir:** o prompt manda produzir um relatório
Markdown de 6 seções e, no rodapé, manda responder em JSON com 5 campos
genéricos. São ordens contraditórias, e o schema não tem onde guardar scorecard
por bloco, citações ou recomendação de treino. A maior parte da análise é
descartada na saída. **Nosso schema vai espelhar o prompt, campo a campo.**

## Padrões de UX que valem copiar

**Alerta acionável.** A faixa no topo de todas as telas não diz "5 problemas".
Ela diz qual é a regra ("a call só divide sozinha aos 100 agendados"), lista os
5 casos com time e closer, e dá o botão que resolve.

**Frase de estado gerada dos dados.** O dashboard abre com uma linha em
português — *"Tudo em dia por aqui"* ou *"3 WhatsApps sem conexão, 280 conversas
aguardando, 77 tarefas atrasadas"* — antes de qualquer número.

**Remuneração visível.** O closer vê o próprio mês em R$ dentro do CRM.

**Funil sempre comparado.** Participantes → marcadas → concluídas → vendas,
com variação vs. o período anterior e delta em pontos percentuais.

## Backlog acrescentado

| # | Item | Origem |
|---|---|---|
| P1.1 | Frase de estado + alerta acionável no Dashboard | `/admin/inicio` |
| P1.2 | Bloco de Remuneração do closer | `/admin/inicio` |
| P1.3 | Painel do líder com ranking e próxima call do time | `/admin/painel-lider` |
| P1.4 | Funil com comparação período a período | `/admin/controle-crm` |
| P2.1 | Fila "sem closer" das 1:1 agendadas pelo lead | `/admin/calendar-individuais` |
| P3.1 | Import CSV com reversão por `batch_id` | `/admin/dados` |
| P4.1 | Sessões: detecção de conflito + overflow + migração entre closers | `/admin/configuracoes` |
| P5.1 | Editor de prompts por tipo e por time, com schema espelhado | Gravações |
| P5.2 | Rubrica por bloco + vocabulário proibido com evidência | prompt de grupo |
| P5.3 | Recomendação de roleplay saindo da análise | prompt de grupo |
