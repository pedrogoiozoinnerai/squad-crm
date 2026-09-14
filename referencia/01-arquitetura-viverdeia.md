# CRM Viver de IA — engenharia reversa do app publicado
Capturado de `call.viverdeia.ai` em 13/09/2026, a partir dos bundles JS e das
chamadas de rede. **Só estrutura — nenhum dado de lead real foi coletado.**

## Arquitetura

| Camada | O que é |
|---|---|
| Front | **SPA Vite + React** (`/assets/*.js` com hash), **não** Next.js |
| Dados | **Supabase** chamado direto do browser (`/rest/v1/`), protegido por RLS |
| Lógica pesada | **61 funções RPC no Postgres** — o front quase não faz JOIN, chama RPC |
| Vídeo | LiveKit (`livekit_room_id`, `room_join_url`) **e Zoom** (`zoom_config`) |
| WhatsApp | múltiplos provedores (`whatsapp_providers`, `whatsapp_instances`) |
| Origem | migrado do **Pipedrive** (`call_bookings.pipedrive_deal_id`) |

Padrão-chave: **versionamento no nome da função** (`_v2`, `_v6`, `_v7`). Eles
evoluem a RPC criando a versão seguinte em vez de alterar a existente.

## Rotas (todas sob /admin)

calendar · my-tasks · pipeline · leads · chat · my-agenda · my-sessions
relatorio-calls · roleplay · convites · deals · participants · recordings
monitoramento

## As 59 tabelas, por domínio

**Agenda e sessões**
sessions · session_instances · session_templates · session_overrides ·
session_participants · individual_meetings · call_bookings

**Comercial**
leads · lead_events · pipeline_stages · products · payment_methods ·
loss_reasons · tasks · task_templates · task_automations

**Renovação** *(pipeline separado, não aparecia nos prints)*
renovacao_pipeline_state · renovacao_events · renovacao_loss_reasons

**Conversas**
conversations · messages · contacts · send_queue · whatsapp_instances ·
whatsapp_instance_secrets · whatsapp_providers · webhook_config ·
inbound_webhook_logs

**Calls e IA**
recordings · recording_summaries · transcriptions · batch_transcription_jobs ·
ai_analyses · closer_ai_analyses · call_aspects · call_action_plans ·
coach_insights · closer_daily_metrics · lead_presentations

**Roleplay**
roleplay_scenarios · roleplay_sessions · closer_roleplay_completions

**Conteúdo de apoio**
cases · materiais_cases · materiais_solucoes · materiais_formacoes

**Acesso e operação**
profiles · teams · user_roles · role_permissions · app_error_logs ·
csv_import_logs · leads_import_logs · livekit_guest_reviews ·
lid_resolution_log_v2 · payment_link_snapshots · payment_link_justifications ·
zoom_config · zoom_sync_logs

## Tabela central: `call_bookings`

É o "agendamento" — junta lead, sessão, pipeline e pagamento num registro só:

- Identidade: `booking_id`, `short_code`, `pipedrive_deal_id`
- Agenda: `scheduled_date`, `scheduled_time`, `session_id`, `assigned_user_id`, `closer_session`
- Lead: `name`, `email`, `phone`, `company_name`, `job_title`, `business_sector`,
  `employee_count`, `revenue_range`, `lead_score`, `color`
- Presença: `participation_status`, `attended_time_minutes`, `accessed_at`, `access_count`
- Comercial: `pipeline_stage` (FK), `product` (FK), `payment_method` (FK),
  `payment_type`, `payment_link`, `converted`, `converted_value_cents`
- Mentoria: `mentoria_status`, `mentoria_reuniao_id`
- Atribuição: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`

> Valores em **centavos** (`converted_value_cents`) — decisão correta que eu não
> tinha adotado no nosso CRM (uso `Float`).

## Outras tabelas relevantes

`profiles`: id, name, email, role, team_id, is_active, is_default,
livekit_room_id, room_name, room_join_url, room_meeting_id, room_capacity

`session_participants`: booking_id, session_id, name, email, user_name,
joined_at, left_at, **join_count**, **total_time_seconds**, participation_date, is_active

`recordings`: booking_id, session_id, closer_id, meeting_id, livekit_room_name,
room_name, modality, duration_seconds, started_at, status, scheduled_time

`transcriptions`: recording_id, meeting_id, closer_id, closer_name, full_text,
language, duration_seconds, started_at, status

`tasks`: booking_id, individual_meeting_id, renovacao_id, stage_id, template_id,
assigned_user_id, type, priority, status, due_date, completed_at, description,
notes, is_lost, message_text

`pipeline_stages`: id, name, color, order_index, **target_role**
> `target_role` é interessante: a etapa sabe de qual papel ela é.

`task_templates`: id, name, description, priority, message_text, meeting_enabled
`task_automations`: liga `template` → `target_stage` (tarefa criada ao entrar na etapa)

`cases`: title, slug, client, company, industry, challenge, solution, results,
testimonial, description, logo_url, cover_image_url, client_website_url, is_featured

`role_permissions`: role, features (array), is_active
> Permissão por **feature**, não por papel fixo — mais flexível que o nosso enum.

`messages`: conversation_id, content, type, from_type, media_url, duration, sent_at, status
`whatsapp_instances`: instance_name, phone_number, provider_id, status, assigned_user_id, is_default
