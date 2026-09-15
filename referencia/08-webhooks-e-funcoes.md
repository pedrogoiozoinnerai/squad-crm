# `/admin/webhook` — Webhooks e Funções (Viver de IA)

Capturado em 15/09/2026, logado como `gabriel.santos@viverdeia.ai` (ADMIN).
Leitura apenas — nada foi salvo, testado nem ativado.

Três abas: **Webhooks de Saída** · **Webhooks de Entrada** · **Funções / API**.

---

## 1. Webhooks de Saída — três eventos, três abas

Todos os três estavam **Inativos** no momento da captura.

### Agendamento
- URL configurada: `…/functions/v1/nina-booking-bridge`, nome **"Nina SDR Bridge"**
- **Atenção:** o projeto Supabase desta URL (`aoxcvjthwjterbqzpxa`) é **diferente**
  do projeto do próprio CRM (`febsftrgndawkldcrmfm`). O webhook de saída entrega
  numa função de OUTRO projeto — o da Nina.
- Dispara "no mesmo momento em que o e-mail de confirmação é enviado".
- Payload: `nome`, `id_participante`, `telefone`, `email`, `horario`,
  `linkreuniao`, `closer`, `setor`, `empresa`, `link_google_calendar`.

### Reagendamento
- Dispara em **duas** situações: o lead confirma reagendamento na página de
  entrada, **ou** um admin move o lead para outra sessão pelo painel.
- Payload acrescenta `evento: "reagendamento"`, `data_anterior`,
  `horario_anterior`, `data_nova`, `horario_novo`.

### No-Show
- "Disparado quando a sessão encerra e um lead agendado não participou."
  O no-show é **derivado pelo sistema no fim da sessão**, não marcado à mão.
- Payload: `evento: "no_show"` + `data_agendada` / `horario_agendado`.

### O que copiar
- **Cada campo do payload é um toggle** ("Dados a Incluir") — o operador monta o
  contrato sem programador. Telefone e e-mail podem ficar de fora.
- **Headers customizados em JSON** por webhook (só na aba Agendamento).
- Botão **Testar Webhook** ao lado de Salvar.
- O painel mostra o **JSON de exemplo renderizado**, não uma lista de campos.

---

## 2. Webhooks de Entrada — `confirm-booking-webhook`

`POST …/functions/v1/confirm-booking-webhook` com `{ "booking_id": "<uuid>" }`
marca o participante como `confirmed`. Duas sub-abas: **Configuração** e
**Histórico**.

### Chave secreta é OPCIONAL
> *"Deixe vazio para aceitar qualquer requisição."*

Vazio = endpoint aberto. **Não copiar esse default.** No nosso, segredo é
obrigatório para o webhook poder ser ativado.

### Histórico — o melhor achado da tela
Tabela das **últimas 50 requisições recebidas**: Data/Hora · Booking ID ·
Participante · **Status HTTP** · **IP de origem**. Sem isso, "o webhook não
chegou" vira palavra contra palavra.

**O histórico está registrando varredura de ataque.** Em 20/04, de um mesmo IP,
uma sequência clara de sondagem — todas rejeitadas com 400/401/405:

| Payload tentado | O que é |
|---|---|
| `${7*7}#{...` | injeção de template / expression language |
| `../proc/...` | path traversal |
| `data:app…`, `ftp://ad…`, `http://[…` | SSRF |
| `CVE-2024…` | sonda por CVE conhecida |
| `test`, `test123`, `nonexist`, `00000000…` | fuzzing de id |

Mais tentativas isoladas em 17/06 e 01/09, de outro IP. **Nenhuma passou** — o
endpoint respondeu 401. Vale avisar o time deles de qualquer forma.

**Lição para o Squad:** nosso endpoint de webhook vai ser varrido igual no
primeiro dia público. Precisa nascer com segredo obrigatório, rate limit e este
mesmo log de IP + status.

---

## 3. Funções / API — **API pública sem autenticação**

`…/functions/v1/get-availability` — *"API pública para consultar dias e horários
disponíveis e criar agendamentos. **Não requer autenticação.**"*

| Método | Rota | Função |
|---|---|---|
| GET | `?action=days` | dias disponíveis |
| GET | `?date=YYYY-MM-DD` | horários do dia |
| POST | `/get-availability` | **cria agendamento** |

É assim que a Nina agenda sem passar pela tela. O POST sem autenticação é o
ponto mais exposto do sistema: qualquer um que saiba a URL cria agendamento.
Se formos fazer equivalente, o mínimo é chave por cliente + rate limit por IP.

---

## Para o nosso CRM, por ordem de valor

1. **Log de entrega com IP e status HTTP**, visível na UI.
2. **Payload montado por toggle**, com JSON de exemplo ao vivo.
3. **Três eventos como ponto de partida** — agendou, remarcou, não apareceu —
   e o nosso quarto: **pagou** (o checkout que fecha deal automático).
4. Segredo **obrigatório**, não opcional.
5. `reagendamento` disparar também quando o **admin** move — não só o lead.
