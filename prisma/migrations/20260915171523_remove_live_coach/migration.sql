-- Remove o Live Coach. Zero marcações nos dois schemas na hora da remoção;
-- o único dado era o roteiro semeado. Volta inteiro pelo commit 8ca7011.
--
-- NOTA: quarta vez que o `migrate diff` propõe derrubar os índices de
-- trigrama. Removidos à mão de novo.

-- DropForeignKey
ALTER TABLE "MeetingBloco" DROP CONSTRAINT "MeetingBloco_blocoId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingBloco" DROP CONSTRAINT "MeetingBloco_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "PlaybookBloco" DROP CONSTRAINT "PlaybookBloco_playbookId_fkey";

-- DropTable
DROP TABLE "MeetingBloco";

-- DropTable
DROP TABLE "Playbook";

-- DropTable
DROP TABLE "PlaybookBloco";

-- DropEnum
DROP TYPE "PlaybookTipo";

