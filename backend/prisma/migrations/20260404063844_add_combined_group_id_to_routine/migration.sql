-- AlterTable
ALTER TABLE "Routine" ADD COLUMN     "combinedGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Routine_combinedGroupId_idx" ON "Routine"("combinedGroupId");
