-- O roster da reunião: quem está nela, o convite rastreado e a presença
-- derivada. Ver o comentário de `MeetingAttendee` no schema para a razão de o
-- convite não ser um modelo à parte.
--
-- NOTA: o `prisma migrate diff` propôs de novo os três `DROP INDEX` dos
-- índices de trigrama, removidos à mão — ele não os conhece porque foram
-- criados em SQL cru com `extensions.gin_trgm_ops`. É a segunda vez; toda
-- migração futura vai propor o mesmo.

-- CreateEnum
CREATE TYPE "AttendeeStatus" AS ENUM ('INSCRITO', 'CONFIRMADO', 'CANCELADO', 'LISTA_ESPERA');

-- CreateEnum
CREATE TYPE "AttendeeSource" AS ENUM ('INSCRICAO', 'CONVITE', 'IMPORTADO', 'AUTOMATICO');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "attendanceAt" TIMESTAMP(3),
ADD COLUMN     "attendanceManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "dealId" TEXT;

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "AttendeeStatus" NOT NULL DEFAULT 'INSCRITO',
    "source" "AttendeeSource" NOT NULL DEFAULT 'INSCRICAO',
    "inviteToken" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3),
    "firstOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3),
    "consentIp" TEXT,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "joinCount" INTEGER NOT NULL DEFAULT 0,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "regraMinutos" INTEGER,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_inviteToken_key" ON "MeetingAttendee"("inviteToken");

-- CreateIndex
CREATE INDEX "MeetingAttendee_leadId_idx" ON "MeetingAttendee"("leadId");

-- CreateIndex
CREATE INDEX "MeetingAttendee_meetingId_status_idx" ON "MeetingAttendee"("meetingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_meetingId_leadId_key" ON "MeetingAttendee"("meetingId", "leadId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

