# Plano — ecossistema Squad.com
**13/09/2026** · comparação completa + próximos passos
Base: 17 agentes auditaram os 3 projetos, compararam 6 dimensões com o CRM Viver de IA,
propuseram 3 roadmaps por ângulos opostos, 2 juízes pontuaram e 1 crítico conferiu tudo.

---

## A premissa que ninguém tinha declarado

Antes do plano, dois fatos que eu verifiquei pessoalmente e que mudam a ordem de tudo:

**1. Nada está no ar.** Nenhum dos três projetos tem `.git`, `Dockerfile`,
`vercel.json`, `.github` ou `fly.toml`. Zero. O Funil do Type é uma **página
pública de captação** — e ela não capta nada rodando em `localhost:3001`.

**2. Não há uso real.** No CRM: **11 negócios abertos, 5 perdidos, 0 ganhos**,
0 anotações, 7 atividades, 1 sessão. Os três usuários são linhas de seed, não
pessoas. No Type: 6 leads, todos `IN_PROGRESS`. No Dashboard: 1 usuário.

Isso não é um sistema em produção com dívida técnica. É um **protótipo
pré-lançamento de um autor só**. A consequência prática é grande: os dois bugs
de receita do Dashboard são **latentes, não ativos** — com zero negócio ganho, as
telas mostram R$ 0, não um número errado. E endurecer autorização entre
vendedores num banco com 1 sessão ativa é dívida antes do primeiro usuário.

> Corrigir o filtro `status = 'COMPLETED'` da ponte Type→CRM não faz um lead
> chegar ao vendedor se o funil nunca esteve na internet.

---

## Parte 1 — Comparação: CRM Squad × CRM Viver de IA

Seis dimensões, todas com o mesmo veredito — **Squad atrás** — mas por razões
muito diferentes, e com ressalvas que importam.

### Modelo de dados — Squad atrás
21 modelos contra 59 tabelas. A diferença não é tamanho, são **domínios inteiros
ausentes**: conversa, call/gravação/transcrição/análise, times, renovação como
segundo funil, catálogo de produtos e formas de pagamento.

*Ressalva de método:* a referência foi levantada por engenharia reversa de
bundles — enxergamos **nomes** de tabela e coluna, não tipos, constraints, FKs
nem índices. Em integridade referencial o nosso é verificável e o deles não.

**Defeitos concretos do nosso modelo:**
- `Deal.leadId @unique` — uma pessoa só pode ter **um negócio na vida inteira**
- `MeetingType.GROUP` é irrepresentável: `Meeting.leadId` é FK única opcional
- Presença tem **três fontes de verdade** sem constraint entre elas
- `Lead.email` e `Lead.phone` sem `@unique` — nenhuma chave de deduplicação
- `DealStageHistory` é escrito e **nunca lido** — nenhum relatório de velocidade

### Funcionalidades — Squad atrás
Eles têm 22 itens de sidebar; nós, 9 telas. Mas o corte honesto é outro: **eles
fecham ciclos que nós abrimos e largamos.** O que temos funciona ponta a ponta
(lead → qualificação automática → tarefa/reunião → negócio → kanban → ganho com
trava de mentoria → dashboard com "por que perdemos").

**O que falta e dói:** nenhuma configuração é editável pela UI (etapas, motivos,
templates, automações, cases, permissões só existem no seed — **e o seed apaga a
base**); calendário é read-only; não há como distribuir leads; listas sem filtro,
sem paginação e com busca que não acha acentuada; o lead importado do funil não
entra no pipeline.

### UX e design — Squad atrás
O buraco **não é de artesanato visual** — peça a peça empatamos ou ganhamos, e o
nosso drawer é endereçável por URL, renderizado no servidor, com Esc e voltar
funcionando. O buraco é de **ergonomia de lista e feedback**:
- Nenhum `loading.tsx`, `error.tsx`, `not-found.tsx` em `src/app` — qualquer
  throw derruba a tela inteira
- Zero busca, filtro e ordenação em Leads, Pipeline e Tarefas
- Zero toast, confirmação ou desfazer em todo o projeto
- Calendário renderiza no fuso do servidor: `TZ = 'America/Sao_Paulo'` está
  declarado em `dates.ts:4` e **nunca é usado**

### Camada de IA — Squad atrás, sem disputa
**Zero.** Nenhuma dependência de IA no `package.json`, nenhuma variável de
ambiente, nenhum modelo (`Recording`, `Transcription`, `CallAnalysis`, `Aspect`,
`Prompt`). `Meeting.roomId` e `SessionInstance.roomId` têm **0 referências** em
`src/`. Toda a superfície de IA são três estados vazios em `DealPanels.tsx`.

O diferencial deles não é "usar IA" — é o **prompt como produto**: 13.605
caracteres de rubrica por bloco, editável na UI, com escopo por time.

### Escala e operação — Squad atrás
Cada tela deles tem a cicatriz de 4.243 deals e 9.651 gravações. Nós:
- Nenhuma lista tem `take` — o contador de Negócios **mente acima de 300**
- Índices isolados onde as queries pedem compostos
- `getSessionUser` roda 2 queries em toda navegação, sem `cache()`
- Trabalho pesado dentro do request (import faz ~1.500 round-trips sequenciais
  numa Server Action, sem transação e sem timeout)

### Segurança — Squad atrás na execução, à frente na forma
**Nossa arquitetura é mais segura que a deles.** O browser nunca recebe
credencial de banco; o escopo mora dentro de `queries.ts`; não há IDOR de
leitura. Eles chamam o Supabase direto do browser com a anon key no bundle — 59
tabelas onde **uma policy esquecida vira dump público** de leads e transcrições.

**Mas nossa execução tem furos reais:**
- Escrita cross-tenant em `notes.ts:19-29` e `tasks.ts:66-76`: quando `dealId` e
  `leadId` chegam juntos, só o deal é autorizado
- `can()` existe em `auth.ts:96` com **zero call sites** — o RBAC por feature só
  esconde links da sidebar
- Token de sessão em **texto puro** no banco, sem rotação, sem rate limit
- `proxy.ts` está na raiz e **nunca executa** (os 4 `middleware-manifest.json` do
  build estão vazios) — a proteção real vem de `requireUser` nos layouts
- `Deal.code` usa `Math.random().toString(16).slice(2,6)`: 65.536 valores num
  campo `@unique`

---

## Parte 2 — Os três projetos hoje

| | Type (:3001) | CRM (:3000) | Dashboard (:3002) |
|---|---|---|---|
| Papel | captação | operação | medição |
| tsc | limpo | limpo | limpo |
| lint | 5 erros¹ | limpo | 2 erros² |
| Dados reais | 6 leads, 0 completos | 0 ganhos | 1 usuário |
| Deploy | não | não | não |
| Git | não | não | não |

¹ todos vindos de `node_modules 2` — cópia de conflito do iCloud
² `Date.now()` no render e `setState` em efeito — a mesma classe que corrigi 2× no CRM

**Infraestrutura:** os três vivem no iCloud Drive. Achei 8 cópias de conflito,
incluindo um `node_modules 2` e um `.next/dev 2` no Type. O `clean:icloud` que
criei cobre só o `.next`.

**Conflito de fronteira não resolvido:** CRM `/inicio` e Dashboard calculam **as
mesmas seis métricas**, e já divergem — o ranking do CRM filtra `active: true`,
o do Dashboard inclui admin. Duas telas, dois bancos de código, mesma pergunta.

---

## Parte 3 — Plano

O painel elegeu "Fundação primeiro" (7/10 e 8/10). Eu **concordo com o conteúdo
e discordo da ordem**, pelo motivo da premissa: não se endurece um protótipo que
ninguém usa e que não está no ar.

### Fase A — Pôr no ar e gerar dado real *(3 a 5 dias)*
Sem isto, nenhuma métrica significa nada.

1. **Tirar os três do iCloud** → `~/dev/squad/` como monorepo (npm workspaces,
   um `.gitignore`, CI único). Resolve `node_modules 2` e prepara o `packages/db`.
2. **`git init` + primeiro commit.** Os `.gitignore` já estão corretos nos três
   (conferi) — mas `.env*` também ignora `.env.example`; corrigir.
3. **Deploy dos três na Vercel**, Postgres gerenciado, domínios.
   O Type primeiro: é a única superfície pública e a única que capta.
4. **Seed realista** — é a prioridade nº 1 que você já escreveu em
   `Dashboard/prompts/PROMPT-CRM.md`. Hoje o Dashboard mostra R$ 0 em tudo e
   **não dá para avaliar tela nenhuma**. Precisa de negócios ganhos, ao longo de
   meses, por canal e por closer.
   ⚠️ Cuidado: tornar o seed idempotente por `upsert` em `User.email`
   **resetaria a senha do admin para `squad1234` a cada execução**.

### Fase B — Fechar as portas *(1 semana)*
Só o que é bug de verdade, não hardening especulativo:
- `notes.ts:19-29` e `tasks.ts:66-76` — escrita cross-tenant
- `moveDeal`/`saveDeal` não checam `status`: dá para editar negócio fechado por POST
- `Deal.code` → `nanoid(8)` com retry em P2002
- Apagar o `proxy.ts` (não executa) ou movê-lo para `src/` — decidir, não deixar as duas
- `error.tsx`, `not-found.tsx`, `loading.tsx` nos três apps
- Fuso: usar o `TZ` que já está declarado

### Fase C — Fronteira CRM × Dashboard *(bloqueante, 1 dia de decisão)*
Você já escreveu a resposta em `Dashboard/analise/05-proximos-passos.md`:
**CRM `/inicio` encolhe para operação pessoal; todo agregado da empresa vira
link para o Dashboard.** Só falta executar — e isso muda o que eu construí hoje.

### Fase D — Migrações, testes e CI *(1 semana)*
`prisma migrate diff --from-empty` para baselinar (o `prisma7.config.ts` já
aponta para `prisma/migrations`, que não existe); vitest nos três;
`npm run check` = `tsc && eslint && vitest`; GitHub Actions.

### Fase E — A ponte Type → CRM que hoje entrega zero
No Type, `COMPLETED` só nasce com booking do Cal.com. Desacoplar: lead completo
é lead com dados, não lead agendado. Trazer `utmTerm`, `utmContent`,
`consentAcceptedAt`, `privacyVersion` (o import descarta — risco de LGPD).
Import vira job, e **cria o Deal** (hoje o lead importado é invisível no Dashboard).

### Fase F — Features, na SUA ordem documentada
O PRD já diz: **P2 é o fluxo público de agendamento**, à frente de WhatsApp,
Renovação e Calls com IA. Os juízes chamaram isso de "inversão de prioridade
mais cara possível" — **eles não conferiram contra o que você decidiu**. Eu fico
com a sua ordem.

### O que NÃO fazer agora, com gatilho de volta
| Corte | Volta quando |
|---|---|
| RLS no Postgres | >10 usuários, ou acesso de parceiro/agência, ou banco compartilhado entre apps |
| Paginação keyset em tudo | qualquer lista passar de 500 linhas reais |
| WhatsApp/Nina | houver dono de operação e observabilidade no ar |
| Gravação e análise de call | houver call real acontecendo no produto |
| Hash de token + rate limit | passar de ~10 usuários |

---

## Parte 4 — Sete decisões que são suas, não minhas

O `PRD.md §14` já listava; nenhuma foi respondida, e três delas **bloqueiam** fases:

1. **LiveKit Cloud ou self-hosted?**
2. **Evolution API ou WhatsApp Cloud API oficial?** — governa a fase de chat inteira
3. **Multi-time desde o início?**
4. **Roteiro de aspectos fixo ou configurável?**
5. **Migrar dados do CRM atual ou começar limpo?**
6. **Retenção de gravações** — governa custo e LGPD
7. **Catálogo de produtos fechado ou valor livre?**

E uma nova, que a auditoria levantou: **`/clientes` do Dashboard precisa de
retenção/churn, que o CRM não modela.** Isso é decisão de produto — o CRM passa
a cuidar de pós-venda ou não?

---

## Dimensões que ninguém tinha comparado

- **Acessibilidade** — o kanban é só `draggable`, sem nenhum `onKeyDown`:
  **inoperável por teclado**, contra o que o próprio PRD §10.3 exige.
- **Mobile** — o Type tem **2 breakpoints** (CRM 23, Dashboard 19). É a única
  superfície pública, majoritariamente aberta no celular, e a menos responsiva.
- **Design system triplicado** — três `globals.css` mantidos à mão. Falta `packages/ui`.
- **Custo** — nenhuma cifra em lugar nenhum: LiveKit, Deepgram, LLM por call,
  Postgres, número de WhatsApp.
- **PRD desatualizado onde muda decisão** — §5 diz Supabase, §9 é "Segurança e
  RLS", §10.1 especifica tema dark azul com Poppins. Nada disso é verdade hoje.
