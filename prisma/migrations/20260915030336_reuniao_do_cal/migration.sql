-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "calBookingUid" TEXT,
ADD COLUMN     "location" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_calBookingUid_key" ON "Meeting"("calBookingUid");

