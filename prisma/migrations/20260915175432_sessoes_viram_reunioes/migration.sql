-- A sessão coletiva vira uma Meeting(type: GROUP).
--
-- SessionInstance, SessionParticipant e SessionOverride tinham ZERO linhas
-- nos dois schemas: o único escritor era o seed de demonstração. Unificar
-- agora custa nada; daqui a seis meses custaria dados de operação.
--
-- O ganho: a sessão em grupo passa a herdar sala, convite rastreado,
-- presença derivada e controles de host — tudo que Meeting já tem.
--
-- NOTA: quinta vez que o `migrate diff` propõe derrubar os índices de
-- trigrama. Removidos à mão de novo.

-- DropForeignKey
ALTER TABLE "SessionInstance" DROP CONSTRAINT "SessionInstance_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "SessionInstance" DROP CONSTRAINT "SessionInstance_templateId_fkey";

-- DropForeignKey
ALTER TABLE "SessionOverride" DROP CONSTRAINT "SessionOverride_templateId_fkey";

-- DropForeignKey
ALTER TABLE "SessionParticipant" DROP CONSTRAINT "SessionParticipant_leadId_fkey";

-- DropForeignKey
ALTER TABLE "SessionParticipant" DROP CONSTRAINT "SessionParticipant_sessionInstanceId_fkey";

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "SessionTemplate" ADD COLUMN     "endsOn" TIMESTAMP(3),
ADD COLUMN     "horizonDays" INTEGER NOT NULL DEFAULT 28,
ADD COLUMN     "startsOn" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- DropTable
DROP TABLE "SessionInstance";

-- DropTable
DROP TABLE "SessionOverride";

-- DropTable
DROP TABLE "SessionParticipant";

-- CreateIndex
CREATE INDEX "Meeting_templateId_idx" ON "Meeting"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_templateId_startsAt_key" ON "Meeting"("templateId", "startsAt");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SessionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

