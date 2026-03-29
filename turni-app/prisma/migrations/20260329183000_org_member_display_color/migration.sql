-- AlterTable
ALTER TABLE "OrgMember" ADD COLUMN "defaultDisplayColor" TEXT;
ALTER TABLE "OrgMember" ADD COLUMN "useDisplayColorInCalendars" BOOLEAN NOT NULL DEFAULT true;
