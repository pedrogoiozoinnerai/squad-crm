-- Limite de taxa nas rotas públicas.
--
-- Em banco, e não em memória, pela mesma razão que `LoginAttempt` já é em
-- banco: a aplicação roda serverless, cada requisição pode cair num processo
-- diferente, e um contador em memória protege apenas a instância que por acaso
-- atendeu — que é o mesmo que não proteger.
--
-- Uma linha por rota, por quem pede, por janela. A janela entra na CHAVE e não
-- numa coluna de data: assim a virada é automática (a janela seguinte é outra
-- linha) e não há relógio para comparar nem contador para zerar. As vencidas
-- saem na faxina do cron.
--
-- NOTA: OITAVA vez que o `migrate diff` propõe derrubar os índices de trigrama
-- (`Lead_name_trgm`, `Lead_email_trgm`, `Lead_company_trgm`). Eles foram
-- criados em SQL cru com `extensions.gin_trgm_ops`, que o schema.prisma não
-- consegue declarar — então o diff não os enxerga e propõe o DROP toda vez.
-- Removidos à mão de novo.

-- CreateTable
CREATE TABLE "RateLimit" (
    "chave" TEXT NOT NULL,
    "contagem" INTEGER NOT NULL DEFAULT 1,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE INDEX "RateLimit_expiraEm_idx" ON "RateLimit"("expiraEm");
