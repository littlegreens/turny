-- DropForeignKey
ALTER TABLE "ShiftAssignment" DROP CONSTRAINT "ShiftAssignment_memberId_fkey";

-- AlterTable
ALTER TABLE "ShiftAssignment" ADD COLUMN     "guestColor" TEXT,
ADD COLUMN     "guestLabel" TEXT,
ALTER COLUMN "memberId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CalendarMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
