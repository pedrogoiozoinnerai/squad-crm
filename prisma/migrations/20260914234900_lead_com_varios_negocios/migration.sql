-- DropIndex
DROP INDEX "Deal_leadId_key";

-- CreateIndex
CREATE INDEX "Deal_leadId_idx" ON "Deal"("leadId");

