-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "hubspotDealId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "hubspotContactId" TEXT;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "hubspotNoteId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hubspotOwnerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_hubspotDealId_key" ON "Deal"("hubspotDealId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_hubspotContactId_key" ON "Lead"("hubspotContactId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_hubspotNoteId_key" ON "Note"("hubspotNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "User_hubspotOwnerId_key" ON "User"("hubspotOwnerId");

