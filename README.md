# CRM — Squad.com

CRM de vendas do time, na identidade e no design system do Squad.com.
Next.js 16 (App Router) + Prisma 7 + SQLite em dev / Postgres em produção.

```bash
npm install
npm run db:push     # cria o schema
npm run db:seed     # popula dados de demonstração
npm run dev
```

Contas criadas pelo seed (senha `squad1234` nas duas):

| Conta | E-mail | Nível |
|---|---|---|
| Pedro Goiozo | `pedro.goiozo@innerai.com` | Admin |
| Ana Martins | `ana.martins@innerai.com` | Vendedor |
| Rafael Lima | `rafael.lima@innerai.com` | Vendedor |

---

## Rotas

A home (`crm.squad.com/`) é a tela de login. Depois de autenticar, o usuário cai
no espaço do seu nível:

```
/                      login + criar conta
/admin/inicio          /user/inicio        dashboard (destino do login)
/admin/calendar        /user/calendar      grade semanal de reuniões
/admin/agenda          /user/agenda        o dia: reuniões + tarefas
/admin/leads           /user/leads         captação e qualificação
/admin/pipeline        /user/pipeline      kanban com drag & drop
/admin/deals           /user/deals         tabela de negócios + CSV
/admin/tarefas         /user/tarefas       fila de trabalho
/admin/usuarios        —                   níveis de acesso (admin)
/admin/importar        —                   trazer leads do Funil (admin)
```

As telas são as mesmas nos dois espaços; o que muda é o **escopo dos dados**:

- **Admin** — enxerga tudo de todo mundo, vê a coluna "Responsável" em cada
  tela e administra os níveis de acesso.
- **Vendedor** — enxerga apenas os próprios leads, negócios, tarefas e reuniões.

Entrar no espaço errado redireciona para o espaço correto.

## O que dá para fazer

**Dashboard** — pipeline aberto e ponderado, previsto do mês, ganho e perdido,
funil por etapa (com o papel dono de cada uma), **por que perdemos** agrupado
por motivo, tarefas atrasadas, e ranking por closer para o admin. Cada bloco é
uma agregação própria, nunca derivada da página.

**Leads** — cadastrar, editar, qualificar (o status vira `Completo` sozinho quando
há contato e empresa), marcar perdido com motivo e **converter em negócio**.
O telefone é normalizado para E.164 na gravação.

**Negócio** — o painel do negócio reproduz o CRM de referência:

- cabeçalho com score, contato, `Ligar`, `Ver Call`, `✕ Perdido` e `🏆 Ganho`;
- **trilha de etapas em chevron** — clicar numa etapa move o negócio;
- coluna esquerda: agendamento (responsável, assistido, empresa, cargo, setor,
  colaboradores, faturamento, copiar link), **Dados do Negócio** (produto, valor,
  pagamento, previsão, probabilidade, link de pagamento), **Mentoria
  Estratégica**, **Logs de acesso** e **Rastreamento (UTMs)**;
- coluna direita em abas: Nova Tarefa · Anotação · **Atividades**
  (Tudo / Tarefas / Histórico) · Chat · Chat Nina · **Cases** · Plano de Ação.

> **Regra de negócio:** `Ganho` fica bloqueado — no botão e no servidor —
> enquanto a Mentoria Estratégica não estiver concluída.

**Cases** — catálogo por setor. Dentro do negócio, os cases do setor do lead vêm
primeiro, marcados como **match exato**.

**Chat, Chat Nina e Plano de Ação** aparecem com o estado vazio honesto: são as
abas que dependem de WhatsApp e IA, ainda não conectados.

**Em qualquer lead ou negócio** — criar tarefa, agendar reunião e registrar
anotação, sem sair do painel.

**Negócios** — busca por nome/empresa/e-mail/telefone, filtro por status e
**exportação CSV** (com BOM, para o Excel não quebrar os acentos).

**Agenda** — o dia do vendedor: reuniões com marcação de realizada/no-show/
cancelada e as tarefas que vencem no dia, com barra de progresso.

**Linha do tempo** — cada lead e negócio guarda o histórico completo: criação,
mudança de etapa, tarefas, anotações, reuniões, ganho/perda e importação.

## Decisões de modelagem

Vieram da engenharia reversa do CRM Viver de IA (ver [`referencia/`](./referencia/)).

**Dinheiro em centavos.** `Deal.valueCents` é `Int`. Float acumula erro de
arredondamento em soma de pipeline. Entrada e exibição convertem nas bordas
(`moneyCents()` e `brl()`), nunca no meio.

**Motivo de perda é tabela.** `LossReason`, não texto livre — sem isso não dá
para agrupar perda por motivo, que é a única análise que importa depois.

**Etapa sabe de qual papel é.** `Stage.targetRole` permite funil por função
(SDR → closer → CS) sem duplicar pipeline.

**Permissão por feature.** `RolePermission(role, features)` em vez de `if role
=== ADMIN` espalhado. Mudar quem vê o quê é dado, não deploy. Lista vazia libera
tudo, para o sistema nunca se trancar.

**Tarefa nasce da etapa.** `TaskTemplate` + `TaskAutomation`: ao entrar numa
etapa, as tarefas configuradas são criadas com prazo relativo. Idempotente por
(negócio, template) — mover o card de ida e volta não duplica.

**Sessão recorrente é template, não evento.** `SessionTemplate` (a regra) →
`SessionInstance` (o dia) → `SessionOverride` (a exceção). Trocar o closer de
uma terça não reescreve a série.

**Presença vem do tempo.** `SessionParticipant` guarda `joinCount` e
`totalSeconds`; `attended` é consequência, não um checkbox.

**WhatsApp por outbox.** A UI insere em `SendQueue`; um worker entrega. Dá
retry, ordenação por prioridade, troca de provedor sem tocar no front, e humano
e IA compartilham a mesma fila (`fromType`).

## Acesso

- Login por e-mail e senha. **Só e-mails `@innerai.com` criam conta** — o
  domínio é configurável em `ALLOWED_EMAIL_DOMAIN`.
- O **primeiro cadastro do sistema vira Admin** automaticamente, para nunca
  ficar sem administrador.
- Sessão em cookie `httpOnly` + `SameSite=Lax`, senha com bcrypt.
- `proxy.ts` (o antigo `middleware.ts`, renomeado no Next 16) faz apenas a
  checagem otimista de "existe cookie?". **A autorização real acontece sempre no
  servidor**, em `requireUser()` e dentro de cada Server Action — Server Actions
  são alcançáveis por POST direto, então nenhuma delas confia na UI.
- Desativar um usuário encerra as sessões abertas dele na hora.

## Estrutura

```
src/
  app/
    page.tsx               login (home)
    actions/               Server Actions (auth, deals, tasks, users)
    admin/ • user/         os dois espaços, layouts finos sobre os mesmos componentes
  components/
    auth/ calendar/ leads/ pipeline/ tasks/ admin/ shell/ ui/
  lib/
    auth.ts                sessão, papéis e escopo de dados
    queries.ts             leituras já filtradas pelo escopo do usuário
    prisma.ts  dates.ts  nav.ts
prisma/
  schema.prisma  seed.ts
proxy.ts                   checagem otimista de rota
```

## Design system

Vem do manual de marca Squad.com, igual ao Funil do Type:

- Tipografia **Fustat**; fundo `#faf9f7`; texto `#0f172a`.
- Paleta **Waz** (`--color-waz-10` … `--color-waz-95`), verde `#2dc86a` como cor
  de ação; ações primárias usam `waz-30` para garantir contraste AA no texto branco.
- Logotipo oficial em `public/brand/`.
- Primitivas em `globals.css`: `card`, `field`, `btn-primary`, `btn-ghost`, `chip`.

## Banco

SQLite em desenvolvimento (zero infra). Para produção, troque no
`prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
}
```

e aponte `DATABASE_URL` para o Postgres gerenciado (Neon/Supabase/Railway).

### Integração com o Funil do Type

Já funciona, em `/admin/importar`. O CRM lê os leads que chegaram ao fim do
funil (`status = COMPLETED`) e cria cada um aqui com contato, cargo, setor,
faturamento e **UTMs preservadas**. Quem já agendou pelo funil entra também no
calendário, com a reunião na data original.

A ponte são duas colunas `@unique` no `Lead` do CRM:

- `typeLeadId` — id do `Lead` gerado pelo funil;
- `typeSessionId` — `sessionId` da sessão do funil.

Por serem únicas, **reimportar é idempotente** — nada duplica. Os leads chegam
sem responsável, para o admin distribuir.

Em desenvolvimento cada projeto tem seu SQLite, então o import abre uma conexão
só-leitura no banco do funil, apontada por `TYPE_DATABASE_URL`:

```bash
TYPE_DATABASE_URL="file:../Type/dev.db"
```

Quando os dois apontarem para o mesmo Postgres, `readFunnelLeads()` em
`src/lib/type-funnel.ts` vira um `prisma.$queryRaw` na conexão que já existe —
o resto do fluxo não muda.

### Preparado para o Meet (LiveKit)

`Meeting.roomId` já existe e está vazio. Quando o projeto do Meet entrar, é o
campo que amarra a reunião do calendário à sala do LiveKit — sem migração.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | gera o Prisma Client e faz o build de produção |
| `npm run db:push` | aplica o schema no banco |
| `npm run db:seed` | recria os dados de demonstração (apaga os atuais) |
| `npm run db:studio` | abre o Prisma Studio |
| `npm run lint` | ESLint |

## Deploy na Vercel

1. Trocar o `provider` do datasource para `postgresql`.
2. Configurar as variáveis: `DATABASE_URL`, `ALLOWED_EMAIL_DOMAIN`,
   `NEXT_PUBLIC_BRAND_NAME`.
3. O `build` já roda `prisma generate` antes do `next build`.
4. Apontar o domínio `crm.squad.com` para o projeto.

> Ao trocar de SQLite para Postgres, `TYPE_DATABASE_URL` deixa de ser
> necessária: os dois projetos passam a compartilhar o mesmo `DATABASE_URL`.

---

O escopo completo do produto (chat de WhatsApp, análise de calls por IA,
roleplay, relatórios de desenvolvimento, monitoramento) está especificado em
[`PRD.md`](./PRD.md) — tudo isso depende de serviços externos (LiveKit,
Evolution API, Claude API, ElevenLabs) e segue como backlog.

`Meeting.roomId` já existe e está vazio: é por ele que o projeto do **Meet
(LiveKit)** vai amarrar a reunião do calendário à sala, sem migração.
