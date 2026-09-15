-- LiveKit: eventos crus de sala, presença derivada e a configuração da
-- plataforma. Ver src/lib/presenca.ts para a razão de a presença ser derivada
-- e não escrita pelo webhook.
--
-- NOTA: o `prisma migrate diff` gerou três `DROP INDEX` dos índices de
-- trigrama (Lead_name_trgm e irmãos) e eles foram removidos à mão. Ele não os
-- conhece porque foram criados em SQL cru com `extensions.gin_trgm_ops` — o
-- schema.prisma não tem como declarar operador de outro schema. Toda migração
-- futura vai propor o mesmo: confira antes de aplicar.

-- CreateTable
CREATE TABLE "RoomEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "livekitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "identity" TEXT,
    "name" TEXT,
    "meetingId" TEXT,

    CONSTRAINT "RoomEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presence" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meetingId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "name" TEXT,
    "userId" TEXT,
    "leadId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Presence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL DEFAULT 'unica',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "presencaMinutos" INTEGER NOT NULL DEFAULT 5,
    "presencaPercentual" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomEvent_livekitId_key" ON "RoomEvent"("livekitId");

-- CreateIndex
CREATE INDEX "RoomEvent_room_at_idx" ON "RoomEvent"("room", "at");

-- CreateIndex
CREATE INDEX "RoomEvent_meetingId_idx" ON "RoomEvent"("meetingId");

-- CreateIndex
CREATE INDEX "RoomEvent_type_at_idx" ON "RoomEvent"("type", "at");

-- CreateIndex
CREATE INDEX "RoomEvent_createdAt_idx" ON "RoomEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Presence_meetingId_idx" ON "Presence"("meetingId");

-- CreateIndex
CREATE INDEX "Presence_leadId_idx" ON "Presence"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Presence_meetingId_identity_key" ON "Presence"("meetingId", "identity");

-- AddForeignKey
ALTER TABLE "RoomEvent" ADD CONSTRAINT "RoomEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presence" ADD CONSTRAINT "Presence_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

