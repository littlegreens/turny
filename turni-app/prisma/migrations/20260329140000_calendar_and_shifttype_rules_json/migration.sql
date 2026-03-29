-- AlterTable
ALTER TABLE "Calendar" ADD COLUMN     "rules" JSONB,
ADD COLUMN "customRules" JSONB;

-- AlterTable
ALTER TABLE "ShiftType" ADD COLUMN "rules" JSONB;
