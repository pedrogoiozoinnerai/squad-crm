-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "hubspotMeetingId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "description" TEXT,
ADD COLUMN     "hubspotTaskId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_hubspotMeetingId_key" ON "Meeting"("hubspotMeetingId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_hubspotTaskId_key" ON "Task"("hubspotTaskId");

