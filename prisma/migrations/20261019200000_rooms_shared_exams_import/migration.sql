-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "externalId" TEXT;

-- AlterTable
ALTER TABLE "Module" ADD COLUMN "examGroupId" TEXT;
ALTER TABLE "Module" ADD COLUMN "room" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_userId_externalId_key" ON "CalendarEvent"("userId", "externalId");

-- CreateIndex
CREATE INDEX "Module_examGroupId_idx" ON "Module"("examGroupId");
