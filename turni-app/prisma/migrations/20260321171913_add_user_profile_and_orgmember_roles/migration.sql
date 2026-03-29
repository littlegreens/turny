-- AlterTable
ALTER TABLE "OrgMember" ADD COLUMN     "roles" "OrgRole"[] DEFAULT ARRAY['WORKER']::"OrgRole"[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastName" TEXT NOT NULL DEFAULT '';
