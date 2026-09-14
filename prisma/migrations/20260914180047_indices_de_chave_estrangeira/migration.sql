-- CreateIndex
CREATE INDEX "Activity_authorId_idx" ON "Activity"("authorId");

-- CreateIndex
CREATE INDEX "Deal_lossReasonId_idx" ON "Deal"("lossReasonId");

-- CreateIndex
CREATE INDEX "Meeting_leadId_idx" ON "Meeting"("leadId");

-- CreateIndex
CREATE INDEX "Note_authorId_idx" ON "Note"("authorId");

-- CreateIndex
CREATE INDEX "SendQueue_instanceId_idx" ON "SendQueue"("instanceId");

-- CreateIndex
CREATE INDEX "SessionTemplate_ownerId_idx" ON "SessionTemplate"("ownerId");

-- CreateIndex
CREATE INDEX "Task_dealId_idx" ON "Task"("dealId");

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "Task_templateId_idx" ON "Task"("templateId");
