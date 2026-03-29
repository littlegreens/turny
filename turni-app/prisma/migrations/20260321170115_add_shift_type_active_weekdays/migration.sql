-- AlterTable
ALTER TABLE "ShiftType" ADD COLUMN     "activeWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];
