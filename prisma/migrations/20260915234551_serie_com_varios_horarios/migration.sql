-- A série passa a ter VÁRIOS horários por dia, e um horizonte declarado.
--
-- A agenda que o funil mostra abre um horário por hora, das 08:00 às 20:00, de
-- segunda a sábado. `time` guardava um horário só; vira `times`, uma lista
-- "HH:MM" separada por vírgula — a mesma convenção que `weekdays` já usa no
-- mesmo model.
--
-- E `horizonDays` vira `horizonte` + `horizonDias`: o número sozinho não sabia
-- dizer "até o fim do mês", que é a regra da operação. Enquanto era só um
-- número, a rota pública tinha o SEU próprio teto cravado (21 dias) e os dois
-- já discordavam.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DUAS COISAS FORAM REESCRITAS À MÃO sobre o que o `migrate diff` gerou:
--
-- 1. O Prisma renderiza renomear coluna como DROP + ADD. Aplicado assim,
--    apagaria o horário e o horizonte de toda série já cadastrada. Vira
--    RENAME COLUMN, que preserva o dado.
--
-- 2. NOTA: sexta vez que o `migrate diff` propõe derrubar os índices de
--    trigrama (`Lead_name_trgm`, `Lead_email_trgm`, `Lead_company_trgm`).
--    Eles foram criados em SQL cru com `extensions.gin_trgm_ops`, que o
--    schema.prisma não consegue declarar — então o diff não os enxerga e
--    propõe o DROP toda vez. Removidos à mão de novo.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "Horizonte" AS ENUM ('FIM_DO_MES', 'DIAS');

-- AlterTable: renomear preservando o que já está lá.
-- Um "10:00" existente já é uma lista válida de um horário.
ALTER TABLE "SessionTemplate" RENAME COLUMN "time" TO "times";
ALTER TABLE "SessionTemplate" RENAME COLUMN "horizonDays" TO "horizonDias";

ALTER TABLE "SessionTemplate"
  ALTER COLUMN "horizonDias" SET DEFAULT 28,
  ADD COLUMN "horizonte" "Horizonte" NOT NULL DEFAULT 'FIM_DO_MES';

-- CreateIndex: a consulta da disponibilidade pública filtra por type + status
-- e recorta por startsAt. Sem isto ela varre a tabela de reuniões inteira a
-- cada carga de tela do funil.
CREATE INDEX "Meeting_type_status_startsAt_idx" ON "Meeting"("type", "status", "startsAt");
