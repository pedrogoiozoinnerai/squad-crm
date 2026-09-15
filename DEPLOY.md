# Deploy do CRM — Vercel + Supabase

Complementa `../Type/DEPLOY.md`, que cobre o roteiro geral. Aqui só o que é
específico deste app.

## Estado

| | |
|---|---|
| Repositório | `github.com/pedrogoiozoinnerai/squad-crm` · branch `main` |
| Banco | Supabase `master_data` (PostgreSQL 17.6, São Paulo) |
| Schema | `crm` em produção · `crm_dev` na máquina |
| Build | `prisma generate && next build` — obrigatório, `src/generated/prisma` não é versionado |
| Migração inicial | criada e aplicada em `crm_dev` |

## 1. Variáveis na Vercel

Project Settings → Environment Variables, escopo **Production**.
Copie os valores do `.env` local — **exceto os dois schemas, que mudam**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | igual ao `.env` (pooler, porta 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | igual ao `.env` (porta 5432) |
| `DB_SCHEMA` | **`crm`** ← não `crm_dev` |
| `TYPE_DATABASE_URL` | mesmo valor de `DATABASE_URL` |
| `TYPE_DB_SCHEMA` | **`type`** ← não `type_dev` |
| `ALLOWED_EMAIL_DOMAIN` | `innerai.com` |
| `ADMIN_EMAIL` | `pedro.goiozo@innerai.com` ← quem cria a primeira conta |
| `NEXT_PUBLIC_BRAND_NAME` | `Squad.com` |

> Trocar só esses dois schemas é o que separa produção de desenvolvimento.
> Com um banco só, é a única fronteira que existe — por isso o seed recusa
> rodar em schema que não termine em `_dev`.

### Três coisas que já quebraram aqui

**Cole sem aspas.** No `.env` os valores ficam entre aspas e o dotenv as
remove; a Vercel guarda exatamente o que você colar. `DATABASE_URL` com aspas
derruba o build (`Invalid URL`); `DB_SCHEMA` com aspas é pior — passa no build
e faz *toda* consulta falhar em produção, sem dizer por quê. O app hoje tolera
(`src/lib/env.ts` limpa tudo o que vem do ambiente), mas continue colando
limpo: quem lê essas variáveis fora daqui não tolera.

**Não marque as variáveis como Sensitive.** Sensitive só é exposta em runtime,
e o build precisa delas.

**Node é `22.x`, não uma faixa.** O `engines.node` do `package.json` tem de
nomear um major que a Vercel reconheça. Uma faixa aberta como `>=20.9.0` diz o
que o projeto tolera, não o que a plataforma deve escolher — e reprova o build.

## 2. Criar o schema de produção e migrar

As migrações **não rodam no build** (o pooler não suporta DDL). Rode da máquina,
uma vez, antes do primeiro deploy:

```bash
DB_SCHEMA=crm DIRECT_URL="<direct url do master_data>" npx prisma migrate deploy
```

Depois, popular só o indispensável em produção — etapas do pipeline, motivos de
perda e permissões. **Não rode `db:seed` contra `crm`**: ele apaga tudo e cria
400 leads fictícios (a trava já impede, mas vale saber por quê).

## 3. Importar o projeto na Vercel

New Project → importar `squad-crm` → Framework **Next.js** (detecta sozinho) →
colar as variáveis acima → Deploy.

Root Directory fica na raiz. Nada de override no comando de build.

## 3.5. Conferir antes de tentar entrar

    curl https://squad-crm.vercel.app/api/saude

`{"banco":"ok", …}` significa que a aplicação enxerga o banco. Qualquer outra
coisa vem com a causa escrita — a rota existe porque a tela de login **não**
toca o banco: ela responde 200 mesmo com a conexão quebrada, e o erro só
aparece quando alguém tenta entrar.

`primeiroCadastroViraAdmin: true` confirma que ainda não há conta com senha. A
primeira conta tem de ser a do `ADMIN_EMAIL` — sem essa variável, produção
recusa qualquer cadastro, porque quem chegasse primeiro viraria administrador
de uma base com a operação inteira dentro. Não existe senha no repositório.

Dali em diante o cadastro é por liberação: em **Usuários**, um admin libera
e-mail por e-mail. Pertencer ao domínio não basta — as contas importadas do
HubSpot só podem ser assumidas por quem foi liberado.

## 4. Depois do primeiro deploy

- [ ] Criar o usuário admin de produção pela tela de cadastro (o primeiro vira ADMIN)
- [ ] **Trocar a senha** — as contas do seed usam `squad1234`, que está no repositório
- [ ] Conferir `/admin/importar` lendo o schema `type`
- [ ] Apontar o domínio

## Antes de abrir para o time

Duas coisas que hoje ficariam expostas:

1. **Cadastro é aberto** — qualquer `@innerai.com` cria conta de vendedor
   sozinho (`src/app/actions/auth.ts`, `signUp`). Vale trocar por convite.
2. **Senha do seed no repositório** — `squad1234` está em `prisma/seed.ts` e no
   histórico do git. Em produção, nenhuma conta deve usá-la.
