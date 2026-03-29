-- AlterTable
ALTER TABLE "Calendar" ADD COLUMN     "activeWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];
