# Chat, gravação e transcrição — como o Viver de IA realmente faz

## Não é Fireflies

Varri os 294 bundles: **zero menções a Fireflies**. A pilha real é:

| Função | Provedor | Evidência |
|---|---|---|
| Vídeo e salas | **LiveKit** | 419 menções; `livekit-token`, `livekit-room` |
| Gravação | **LiveKit Egress** | `EGRESS` como tipo de participante; edge fn `stop-recording` |
| Transcrição | **Deepgram Nova-3** | badge literal na UI: "Deepgram Nova-3 · Português BR" |
| Resumo/análise | LLM via edge function | `analyze-closer-performance`, `generate-lead-insights` |
| Voz do roleplay | **ElevenLabs** | ainda **desligado**: "configurar ElevenLabs + ligar o worker" |
| WhatsApp | **Evolution API** | 53 menções, pareamento por QR |
| Vídeo alternativo | **Zoom** | 6 edge functions + SDK embutido |

> O "Otter.ai" que aparece no código é string do **SDK do Zoom**, não escolha deles.

## O chat — padrão outbox, e é o ponto mais inteligente do sistema

O front **nunca chama a Evolution direto**. Ele insere numa fila no banco:

```js
send_queue.insert({
  instance_id, contact_id, conversation_id,
  content, message_type: "text",
  from_type: "human",   // humano × IA usam a MESMA fila
  priority: 1,
  status: "pending",
})
```

Um worker consome a fila e entrega pela Evolution. O que isso compra:

- **Retry e ordenação** de graça; mensagem não se perde se o WhatsApp cair
- **Troca de provedor sem tocar no front** (`whatsapp_providers` é tabela)
- **Nina e humano na mesma fila**, diferenciados por `from_type` — por isso o
  composer mostra "está respondendo automaticamente" sem lógica duplicada
- `priority` permite furar a fila com mensagem de confirmação de reunião

Áudio tem caminho próprio (`sendAudioMessage`, envia blob).

Uma instância de WhatsApp **por vendedor** (`whatsapp_instances.assigned_user_id`),
pareada por QR (`whatsapp-pair-instance`), com segredos em tabela separada
(`whatsapp_instance_secrets`) e verificação de saúde (`check-whatsapp-status`).

## As 46 Edge Functions (a camada de servidor deles)

**Sala e gravação:** livekit-token · livekit-room · stop-recording · check-host-status
**WhatsApp:** whatsapp-create-instance · whatsapp-pair-instance ·
whatsapp-delete-instance · check-whatsapp-status · switch-evolution-webhook ·
audit-whatsapp-conversations · generate-whatsapp-closer-report
**IA:** nina-conversa · nina-relatorio-cadencia · analyze-closer-performance ·
generate-lead-insights · roleplay-voice-start
**Agendamento:** agenda-self-schedule · lead-to-booking · fetch-lead-for-booking ·
invite-resolve · send-meeting-invite · send-meeting-invite-whatsapp ·
send-reschedule-webhook · update-participation · register-call-interest
**Sessões:** materialize-sessions · migrate-session
**Massa:** bulk-create-tasks · bulk-insert-tasks-direct · bulk-reopen-deals ·
leads-bulk-insert · csv-table-import · csv-bulk-update · redistribute-leads ·
export-filter-assistant
**Zoom:** zoom-create-meeting · zoom-add-registrant · zoom-check-status ·
zoom-sdk-signature · zoom-sync · zoom-sync-participants
**Outros:** mentoria-agendamento · vdi-checkout-links · recalculate-metrics ·
resolve-lid-fakes-batch · test-webhook

## Fluxo completo de uma call

```
agendamento (call_bookings)
  → sala LiveKit (livekit-token / livekit-room)
  → presença medida por session_participants (join_count, total_time_seconds)
  → Egress grava → recordings (status: pending→processing→completed→failed)
  → Deepgram Nova-3 → transcriptions (full_text, language, duration_seconds)
  → LLM → recording_summaries · ai_analyses (engagement_score, sentiment)
  → call_aspects + closer_ai_analyses → boletim do closer
  → coach_insights e call_action_plans
```
