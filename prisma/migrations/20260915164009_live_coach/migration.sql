-- Live Coach: o roteiro da call, que guia ao vivo e vira rubrica depois.
--
-- NOTA: terceira vez que o `migrate diff` propõe derrubar os índices de
-- trigrama. Removidos à mão de novo. Ele não os conhece porque foram criados
-- em SQL cru com `extensions.gin_trgm_ops`.

-- CreateEnum
CREATE TYPE "PlaybookTipo" AS ENUM ('INDIVIDUAL', 'GRUPO');

-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "PlaybookTipo" NOT NULL DEFAULT 'INDIVIDUAL',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookBloco" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "objetivo" TEXT,
    "minutosAlvo" INTEGER,

    CONSTRAINT "PlaybookBloco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingBloco" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "blocoId" TEXT NOT NULL,
    "marcadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "segundo" INTEGER NOT NULL,

    CONSTRAINT "MeetingBloco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playbook_tipo_ativo_idx" ON "Playbook"("tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Playbook_tipo_versao_key" ON "Playbook"("tipo", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookBloco_playbookId_ordem_key" ON "PlaybookBloco"("playbookId", "ordem");

-- CreateIndex
CREATE INDEX "MeetingBloco_meetingId_idx" ON "MeetingBloco"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingBloco_meetingId_blocoId_key" ON "MeetingBloco"("meetingId", "blocoId");

-- AddForeignKey
ALTER TABLE "PlaybookBloco" ADD CONSTRAINT "PlaybookBloco_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBloco" ADD CONSTRAINT "MeetingBloco_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBloco" ADD CONSTRAINT "MeetingBloco_blocoId_fkey" FOREIGN KEY ("blocoId") REFERENCES "PlaybookBloco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

