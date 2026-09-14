# Prompts de análise de calls — CRM Viver de IA
Capturados em 13/09/2026 com acesso ADMIN, na tela **Gravações → Configurar Prompts**.

> ⚠️ **IP confidencial da operação.** Contém o playbook comercial completo,
> tabela de preços e âncoras. Não publicar fora deste repositório.

## Como funciona

- Botão **Configurar Prompts** no topo de `/admin/recordings` (só admin/head vê).
- Dois tipos: **Reunião Individual (1:1)** e **Reunião em Grupo**.
- Escopo **Global** ou **por time** — cada time pode ter variante própria
  ("pitch diferente"); sem variante, vale o global.
  Times vistos: Agatha · Aquisição-G4 · Gabriel · Leo Carvalho · Lucas Cohen · Murilo
- Guardados numa Edge Function `functions/v1/ai-prompts` (GET lista, POST salva).
- Botões **Restaurar Padrão** e **Salvar**.

## Variáveis disponíveis

`{transcription}` · `{duration_minutes}` · `{participant_count}` ·
`{closer_name}` · `{meeting_date}`

---

## 🔴 O problema mais grave que encontrei

Os dois prompts terminam com este rodapé:

```
Responda em JSON válido com a seguinte estrutura:
{ "summary", "objections", "next_steps", "engagement_score", "insights" }
```

Só que **antes disso** eles mandam o modelo produzir um relatório inteiro:

- o individual pede 10 seções, com scorecard de 11 critérios em tabela
- o de grupo diz literalmente *"FORMATO DE SAÍDA (OBRIGATÓRIO): Responda em
  Markdown, nesta ordem exata"* e pede scorecard por bloco, citações literais,
  contagem de vocabulário proibido, 5 insights e recomendação de roleplay

**São duas ordens de formato contraditórias na mesma mensagem.** E mesmo que o
modelo obedeça ao JSON, o schema não tem campo para quase nada disso: aderência
por bloco, erros com citação, vocabulário e recomendação de treino são
espremidos em `summary` e `insights[]`, ou simplesmente descartados.

Ou seja: o head escreveu uma auditoria de playbook de 13 mil caracteres e a
saída joga fora a maior parte dela.

**Como consertar** (vale para o nosso CRM):
1. O schema de saída precisa espelhar o prompt — um campo por seção pedida.
2. Não misturar "responda em Markdown" com "responda em JSON". Escolher um.
   Para dados que alimentam telas, JSON estruturado; o Markdown vira um campo
   `report` dentro dele.
3. Validar com Zod e rejeitar/reprocessar quando não bater.

Proposta de schema para o nosso:

```jsonc
{
  "summary": "string",
  "verdict": "aderente | mediana | freestyle",
  "adherencePct": 0,
  "totalMinutes": 0,
  "blocks": [{ "name", "status", "minutes", "done": [], "missing": [] }],
  "errors": [{ "error", "quote", "shouldHaveSaid", "triggerLost", "impact" }],
  "vocabulary": { "forbidden": [{ "word", "quote" }], "valueDensity": {} },
  "objections": [{ "type", "howHandled", "score", "betterAnswers": [] }],
  "scorecard": [{ "criterion", "score", "note" }],
  "insights": [{ "title", "whatToChange", "block", "expected" }],
  "roleplayFocus": ["bloco a treinar"],
  "engagementScore": 0
}
```

---

## Prompt 1 — Reunião Individual (1:1) · escopo Global
*4.537 caracteres*

```
Você é  Diretor de Vendas. Especialista em fechamento de alta performance,
leitura comportamental de clientes, diagnóstico de operações, cálculo de ROI e
quebra de objeções em vendas de tecnologia e IA. Você já treinou centenas de
closers e tem visão cirúrgica para identificar erros sutis que custam vendas.

CONTEXTO DO PRODUTO:
Você está analisando reuniões individuais de fechamento do Viver de IA —
plataforma de inteligência artificial que ajuda empresários a aplicar IA no
negócio deles para reduzir tarefas repetitivas, aumentar lucro e tomar melhores
decisões. O cliente já participou de uma reunião em grupo onde conheceu o
produto. A reunião individual tem 3 objetivos centrais:
1. Entender profundamente a operação do cliente
2. Fazer o cliente enxergar que ele já PERDE DINHEIRO hoje (sem IA)
3. Gerar comprometimento para fechar

PRINCÍPIO-CHAVE: Se o cliente não tiver consciência de que está desperdiçando
dinheiro agora, ele nunca vai investir em IA. O closer precisa ser um espelho
que mostra a dor financeira antes de apresentar a solução.

ESTRUTURA DA SUA ANÁLISE (siga sempre esta ordem):

## 1. RESUMO EXECUTIVO (3–5 linhas)
## 2. NOTA GERAL DA REUNIÃO: X/10
## 3. SCORECARD DETALHADO (0–10 por critério, em tabela)
   Rapport e abertura · Diagnóstico da operação · Levantamento de tarefas
   repetitivas · Cálculo de custo/ROI · Métricas coletadas · Ancoragem de dor ·
   Apresentação da solução · Quebra de objeções · Geração de urgência ·
   Tentativa de fechamento · Próximos passos definidos
## 4. OS 3 MAIORES ERROS  (fala exata + porquê + 3 formas corretas)
## 5. ANÁLISE DE OBJEÇÕES (tipo, nota da resposta, 3 variações da quebra)
## 6. DIAGNÓSTICO: O CLOSER FEZ O CÁLCULO?  (checklist de 4 itens)
## 7. DIAGNÓSTICO: COLETOU AS MÉTRICAS?     (checklist de 5 itens)
## 8. MOMENTOS DE OURO PERDIDOS (até 3)
## 9. O QUE O CLOSER FEZ BEM (2 a 4 pontos)
## 10. PLANO DE PRÓXIMOS PASSOS
   OPÇÃO A — WhatsApp (mensagem pronta)
   OPÇÃO B — Áudio (roteiro)
   OPÇÃO C — Ligação (script + objetivo)

REGRAS DO SEU FEEDBACK:
- Seja brutalmente honesto. Elogios genéricos não desenvolvem closers.
- Toda crítica vem com 3 alternativas de como falar melhor.
- Foque em comportamentos observáveis, não julgamentos de caráter.

DADOS DA REUNIÃO: {closer_name} · {duration_minutes} · {meeting_date}
TRANSCRIÇÃO: {transcription}

Responda em JSON válido: { summary, objections, next_steps,
engagement_score, insights }        ← ⚠️ conflito descrito acima
```

---

## Prompt 2 — Reunião em Grupo · escopo Global
*13.605 caracteres — é o playbook comercial inteiro virado em rubrica de auditoria*

### Estrutura

**1. Identidade** — "Analista de Performance Comercial Sênior", com a missão
declarada de *"acabar com o freestyle"*. Não é coach motivacional: aponta com
trecho da transcrição, mostra a fala correta do playbook e nomeia o gatilho
neurocientífico perdido.

**2. O roteiro padrão** — monólogo controlado de 17–22 min (alvo 15), zero
interação, ordem dos blocos imutável. Cada bloco traz elementos obrigatórios e
os gatilhos esperados:

| Bloco | Tema | Gatilhos declarados |
|---|---|---|
| 1 | Abertura (1-2min) | Autoridade · Escassez de capacidade · Reciprocidade · Priming do CTA |
| 2 | O que é o Viver de IA (1min) | Autoridade categórica · Ancoragem · Loop aberto (Zeigarnik) |
| 3 ⭐ | **Analogia do apartamento** (3min) | Concretude · Endowment · Contraste · Autonomia percebida |
| 4 | Cases do segmento (2min) | Prova social segmentada · Identificação · Redução de risco |
| 5 | Perguntas antecipadas (3-4min) | Pergunta antecipada · Identificação silenciosa |
| 6 | Diferenciação e ancoragem (2min) | Ancoragem por comparação · Autoridade humilde |
| 7 | Síntese mnemônica (1min) | Consolidação de memória · Processing fluency |
| 8 | Quem sustenta (1-2min) | Autoridade distribuída · Prova social de crescimento |
| 9 | Ponte para a individual (1-2min) | Escassez qualitativa · Pressuposição de ação |
| 10 ⭐ | **Apresentação de preços** (3-4min) | Ancoragem · Contraste · Escassez temporal |

O Bloco 3 é chamado de *spine* da apresentação: os 3 caminhos (tijolo/cimento →
ferramentas + formações; apartamento pronto → soluções plug and play; imóvel
customizado → AI Builder), arquiteto = mentorias, vizinhos = comunidade.

O Bloco 10 tem sequência de 5 slides **inalterável**: posicionar os 3 planos →
"quanto custaria no mercado?" (âncora, com pausa dramática de 3-5s) → preço real
→ desconto exclusivo do dia → bônus supremo. *(Valores no app; não replico aqui.)*

**3. Vocabulário como regra** — lista de palavras que devem aparecer
(negócio, dinheiro, receita, custo, produtividade, tempo, resultado, implementar,
rodar) e **lista de proibidas**, cada ocorrência contando como violação
(startup, API, integração, automação, low-code, no-code, SDR, BDR, RAG,
embedding, prompt, agente, stack, framework…).

**4. Metodologia** — identificar blocos executados e ordem; marcar cada um como
✅/⚠️/❌/🚫; contar vocabulário proibido com o trecho; estimar tempo total
(>22min = "freestyle confirmado"); listar erros críticos.

**5. Formato de saída** — Markdown em 6 seções: scorecard geral (com veredito
🟢 Aderente / 🟡 Mediana / 🔴 Freestyle), aderência por bloco em tabela, erros
do mais grave ao menos grave, vocabulário, **5 insights acionáveis** e
recomendação de roleplay.

**6. Regras de ouro** — sem citação não há acusação; sempre confrontar com a
fala literal do playbook; nunca inventar blocos; declarar transcrição ruim;
*"não maquie scorecard"*; os 5 insights são o output mais valioso.

---

## O que copiar disso para o CRM do Squad

1. **Prompt editável na interface, versionado, com escopo global e por time.**
   É o que permite o playbook evoluir sem deploy.
2. **Rubrica explícita por bloco**, com elementos obrigatórios e gatilho
   esperado — é isso que transforma "a call foi mediana" em diagnóstico.
3. **Vocabulário proibido contado com evidência.** Métrica objetiva e barata.
4. **Toda crítica com 3 alternativas de fala.** Feedback que vira ação.
5. **Recomendação de roleplay saindo da análise** — fecha o ciclo
   análise → treino que o módulo de Roleplay usa.
6. **Schema de saída espelhando o prompt** — o erro deles que não vamos repetir.
