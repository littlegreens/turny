-- CreateTable
CREATE TABLE "MonthlyConstraint" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "ConstraintType" NOT NULL,
    "weight" "ConstraintWeight" NOT NULL DEFAULT 'SOFT',
    "value" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyConstraint_scheduleId_idx" ON "MonthlyConstraint"("scheduleId");

-- CreateIndex
CREATE INDEX "MonthlyConstraint_memberId_idx" ON "MonthlyConstraint"("memberId");

-- AddForeignKey
ALTER TABLE "MonthlyConstraint" ADD CONSTRAINT "MonthlyConstraint_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyConstraint" ADD CONSTRAINT "MonthlyConstraint_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CalendarMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
