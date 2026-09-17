-- O botão de compra no chat.
--
-- No fim do pitch o closer manda o link, e hoje ele manda como texto solto: a
-- pessoa precisa selecionar, copiar e colar num aparelho onde selecionar texto
-- é difícil. Com `tipo = 'OFERTA'` a mesma conversa desenha um botão.
--
-- `url` fica em coluna própria, e não emendada no texto, porque é o que precisa
-- ser validado antes de virar um link clicável na tela de trinta pessoas:
-- `javascript:` num chat aberto seria um convite.
--
-- Escrita à mão: o `migrate diff` propõe derrubar `Lead_company_trgm`,
-- `Lead_email_trgm` e `Lead_name_trgm` toda vez, porque os índices GIN de
-- pg_trgm vivem no schema `extensions` e o Prisma não os enxerga. Aplicar o
-- diff cru tiraria a busca por nome, e-mail e empresa do CRM inteiro. Décima
-- segunda vez.

-- CreateEnum
CREATE TYPE "RoomMessageKind" AS ENUM ('TEXTO', 'OFERTA');

-- AlterTable
ALTER TABLE "RoomMessage" ADD COLUMN "tipo" "RoomMessageKind" NOT NULL DEFAULT 'TEXTO',
                          ADD COLUMN "url" TEXT;
