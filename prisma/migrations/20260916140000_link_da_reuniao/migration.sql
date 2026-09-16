-- O link da reunião: uma porta para quem não tem conta nem convite.
--
-- Até aqui a sala tinha duas entradas — a sessão do CRM (vendedor) e o token
-- do convite (lead inscrito). Faltava a terceira, que é a que se manda por
-- WhatsApp: call interna, convidado fora do funil, conversa marcada na hora.
-- Sem ela, "me manda o link" não tinha resposta quando a reunião não tinha
-- lead.
--
-- Anulável porque toda reunião de antes desta migração não tem um, e gerar em
-- massa criaria milhares de links válidos para salas que ninguém vai abrir.
-- Nasce preenchido a partir de agora.
--
-- NOTA: SÉTIMA vez que o `migrate diff` propõe derrubar os índices de trigrama
-- (`Lead_name_trgm`, `Lead_email_trgm`, `Lead_company_trgm`). Eles foram
-- criados em SQL cru com `extensions.gin_trgm_ops`, que o schema.prisma não
-- consegue declarar — então o diff não os enxerga e propõe o DROP toda vez.
-- Removidos à mão de novo.

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "guestToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_guestToken_key" ON "Meeting"("guestToken");
