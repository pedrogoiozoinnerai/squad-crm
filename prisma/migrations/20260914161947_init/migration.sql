-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('INCOMPLETE', 'COMPLETE', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "Attendance" AS ENUM ('AGENDADO', 'PARTICIPOU', 'NAO_COMPARECEU');

-- CreateEnum
CREATE TYPE "MentorshipStatus" AS ENUM ('PENDENTE', 'AGENDADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('GROUP', 'ONE_ON_ONE');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'DONE', 'NO_SHOW', 'CANCELED');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('LEAD_CREATED', 'LEAD_UPDATED', 'DEAL_CREATED', 'DEAL_UPDATED', 'STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST', 'TASK_CREATED', 'TASK_DONE', 'NOTE_ADDED', 'MEETING_SCHEDULED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "SendStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "features" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "segment" TEXT,
    "revenueRange" TEXT,
    "collaborators" TEXT,
    "score" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "notes" TEXT,
    "ownerId" TEXT,
    "source" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "trackedLink" TEXT,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "lastLinkClick" TIMESTAMP(3),
    "typeLeadId" TEXT,
    "typeSessionId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "targetRole" TEXT,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossReason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LossReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "valueCents" INTEGER NOT NULL DEFAULT 0,
    "product" TEXT,
    "probability" INTEGER NOT NULL DEFAULT 20,
    "expectedAt" TIMESTAMP(3),
    "lostNote" TEXT,
    "lossReasonId" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "attendance" "Attendance" NOT NULL DEFAULT 'AGENDADO',
    "paymentMethod" TEXT,
    "paymentLink" TEXT,
    "mentorshipStatus" "MentorshipStatus" NOT NULL DEFAULT 'PENDENTE',
    "mentorshipAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageHistory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "movedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'follow_up',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "messageText" TEXT,
    "meetingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAutomation" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "targetStageId" TEXT NOT NULL,
    "dueInDays" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'follow_up',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "dealId" TEXT,
    "leadId" TEXT,
    "templateId" TEXT,
    "automated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekdays" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 45,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "SessionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionInstance" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 45,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "roomId" TEXT,
    "templateId" TEXT,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "SessionInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionOverride" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "overrideDate" TIMESTAMP(3) NOT NULL,
    "newOwnerId" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionParticipant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionInstanceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "joinCount" INTEGER NOT NULL DEFAULT 0,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "attended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "type" "MeetingType" NOT NULL DEFAULT 'ONE_ON_ONE',
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "roomId" TEXT,
    "ownerId" TEXT NOT NULL,
    "leadId" TEXT,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "leadId" TEXT,
    "dealId" TEXT,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "highlight" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "link" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappInstance" (
    "id" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'evolution',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT,

    CONSTRAINT "WhatsappInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendQueue" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instanceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "mediaUrl" TEXT,
    "fromType" TEXT NOT NULL DEFAULT 'human',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "status" "SendStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "SendQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_key" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_typeLeadId_key" ON "Lead"("typeLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_typeSessionId_key" ON "Lead"("typeSessionId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_key_key" ON "Stage"("key");

-- CreateIndex
CREATE INDEX "Stage_order_idx" ON "Stage"("order");

-- CreateIndex
CREATE UNIQUE INDEX "LossReason_name_key" ON "LossReason"("name");

-- CreateIndex
CREATE INDEX "LossReason_orderIndex_idx" ON "LossReason"("orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_code_key" ON "Deal"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_leadId_key" ON "Deal"("leadId");

-- CreateIndex
CREATE INDEX "Deal_stageId_idx" ON "Deal"("stageId");

-- CreateIndex
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "Deal"("status");

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_idx" ON "DealStageHistory"("dealId");

-- CreateIndex
CREATE INDEX "TaskAutomation_targetStageId_idx" ON "TaskAutomation"("targetStageId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAutomation_templateId_targetStageId_key" ON "TaskAutomation"("templateId", "targetStageId");

-- CreateIndex
CREATE INDEX "Task_ownerId_status_idx" ON "Task"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE INDEX "SessionInstance_date_idx" ON "SessionInstance"("date");

-- CreateIndex
CREATE INDEX "SessionInstance_ownerId_date_idx" ON "SessionInstance"("ownerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SessionInstance_templateId_date_time_key" ON "SessionInstance"("templateId", "date", "time");

-- CreateIndex
CREATE INDEX "SessionOverride_overrideDate_idx" ON "SessionOverride"("overrideDate");

-- CreateIndex
CREATE UNIQUE INDEX "SessionOverride_templateId_overrideDate_key" ON "SessionOverride"("templateId", "overrideDate");

-- CreateIndex
CREATE INDEX "SessionParticipant_leadId_idx" ON "SessionParticipant"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipant_sessionInstanceId_leadId_key" ON "SessionParticipant"("sessionInstanceId", "leadId");

-- CreateIndex
CREATE INDEX "Meeting_startsAt_idx" ON "Meeting"("startsAt");

-- CreateIndex
CREATE INDEX "Meeting_ownerId_startsAt_idx" ON "Meeting"("ownerId", "startsAt");

-- CreateIndex
CREATE INDEX "Note_leadId_idx" ON "Note"("leadId");

-- CreateIndex
CREATE INDEX "Note_dealId_idx" ON "Note"("dealId");

-- CreateIndex
CREATE INDEX "Activity_leadId_createdAt_idx" ON "Activity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_dealId_createdAt_idx" ON "Activity"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_segment_idx" ON "Case"("segment");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInstance_instanceName_key" ON "WhatsappInstance"("instanceName");

-- CreateIndex
CREATE INDEX "WhatsappInstance_ownerId_idx" ON "WhatsappInstance"("ownerId");

-- CreateIndex
CREATE INDEX "SendQueue_status_priority_createdAt_idx" ON "SendQueue"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "SendQueue_leadId_idx" ON "SendQueue"("leadId");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_lossReasonId_fkey" FOREIGN KEY ("lossReasonId") REFERENCES "LossReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAutomation" ADD CONSTRAINT "TaskAutomation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAutomation" ADD CONSTRAINT "TaskAutomation_targetStageId_fkey" FOREIGN KEY ("targetStageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTemplate" ADD CONSTRAINT "SessionTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInstance" ADD CONSTRAINT "SessionInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SessionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInstance" ADD CONSTRAINT "SessionInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionOverride" ADD CONSTRAINT "SessionOverride_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SessionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_sessionInstanceId_fkey" FOREIGN KEY ("sessionInstanceId") REFERENCES "SessionInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInstance" ADD CONSTRAINT "WhatsappInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendQueue" ADD CONSTRAINT "SendQueue_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsappInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendQueue" ADD CONSTRAINT "SendQueue_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
