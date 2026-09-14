# O que cada tela faz — observado ao vivo (13/09/2026)

Escala real da operação: **4.243 deals · 4.243 participantes · 9.651 gravações
(7.571 h) · 4.710 conversas · 241 leads · 323 sessões do closer**.

## Calendário `/admin/calendar`
Grade hora × dia. Filtros **time** e **sala**. Legenda Head / Sem head.
Cartão mostra closer, agendados, presentes e ícone quando há gravação.
Dados: `session_instances` + `session_overrides` (exceções por data) +
RPC `get_booking_counts_by_week_v2(start_date, end_date)`.
> O modelo é **template → instância → override**: a sessão recorrente é um
> template materializado por período (`materialize_template_range_v2`), e
> alterações pontuais viram override em vez de editar a série.

## Minhas Tarefas `/admin/my-tasks`
Colunas: Assunto, Tipo, Status, Prioridade, Prazo, **Parado**, Lead, Etapa,
Probabilidade, Reunião, Telefone. Prazo em linguagem natural ("há 1 dia",
"em cerca de 23 horas"). Botão **Colunas**, filtros, 100 por página.
RPC `get_my_tasks_v3`, `tasks_bulk_action_v1`, `get_bulk_task_targets_v2`.

## Pipeline `/admin/pipeline`
Kanban · Lista · **Previsão**. Por coluna: contador, soma e
**"30 de 31"** (carregados de total — paginação por coluna).
Cada coluna tem **ordenar/filtrar** e **esconder coluna**.
Card: score A–E, chip "Participou", empresa, telefone, data·hora, valor,
nº de tarefas, **"Copiar link da call"**.
RPCs: `get_pipeline_board_v6`, `get_pipeline_stage_page_v6`,
`get_pipeline_stage_totals_v3`, `search_pipeline_leads_v4`,
`get_pipeline_filter_options`, `get_pipeline_export_v2`.
> Board, página da coluna e totais são **três RPCs separadas** — é assim que
> aguentam 4 mil deals sem travar.

## Leads `/admin/leads`
3 colunas (Incompleto 4 / Completo 233 / Lançamento 4) + contadores de
convertido e perdido. Filtros: status, responsável, origem, ordenação.
**Exportar filtro**. Ações por card: WhatsApp · Ligar · Agendar.

## Chat `/admin/chat`
4.710 conversas. Filtros **Todas · Não respondidas (123) · Não lidas (368) ·
+24h (122)**. SLA por conversa ("aguarda 15h", "aguarda 1d").
Áudio com **controle de velocidade (1x)**. Painel: **Gerar Insights com IA**,
agendamento, contato, responsável, tags, UTMs.
RPC `chat_list_v2`, tabelas `conversations`/`messages`/`contacts`/`send_queue`.

## Minha Agenda `/admin/my-agenda`
Semana com contagem por dia; lista do dia com "Sessão ao Vivo", duração 45min
e contagem regressiva ("em 9h 22min").

## Minhas Sessões `/admin/my-sessions`
Minha Sala com `room_id` copiável e **Iniciar Sala**. Métricas: total (323),
semana (15), participantes (1000). Filtros de período. Abas **Próximas /
Realizadas / Não Realizadas (316)**.

## Relatório de Calls `/admin/relatorio-calls`
3 abas. Visão da semana traz narrativa gerada por IA + 4 métricas com
sparkline (calls 30d, engajamento, score da semana, sentimento), gráfico
barras+linha, pontos fortes / a desenvolver, **3 frentes pra focar** e
**Atualizar a semana** (regeneração sob demanda).
Aba desenvolvimento: boletim diário, constância, notas por aspecto (10 etapas)
com tendência e "pulou N×". RPC `closer_aspect_evolution_v1`.

## Roleplay `/admin/roleplay`
3 modos: simulado (closer × closer via link de convidado), chat (IA texto),
IA (voz, 2 agentes). Cenários vêm dos pontos fracos do relatório.
Tabelas `roleplay_scenarios`, `roleplay_sessions`, `closer_roleplay_completions`.

## Convites `/admin/convites`
Dia + sessão → lista de leads com link rastreado.
**≥ 5min na sala contabiliza a reunião automaticamente.**
Link de "Convidado" não rastreia e não contabiliza.
RPC `track_booking_access`, `confirm_booking_presence`.

## Deals `/admin/deals`
Tabela de 4.243 negócios, filtros, colunas, **Exportar CSV**, paginação servidor.

## Participantes `/admin/participants`
4.243 registros, 213 páginas. Filtros: setor, lead score, closer, período.

## Gravações `/admin/recordings`
9.651 gravações · 3.937 grupo · 5.284 1:1 · 430 avulsas · 7.571 h.
Aviso explícito: "base filtrada completa, sem duplicadas — os números não mudam
ao trocar de página". 1.073 páginas.
RPCs `recordings_list_v1`, `recordings_stats_v2`, `search_recordings_by_lead_v2`.

## Monitoramento `/admin/monitoramento`
3 painéis: Central de Controle, Monitor LiveKit, WhatsApp Monitor.
