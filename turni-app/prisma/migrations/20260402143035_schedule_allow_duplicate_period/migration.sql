-- DropIndex
DROP INDEX "Schedule_calendarId_year_month_key";

-- CreateIndex
CREATE INDEX "Schedule_calendarId_year_month_idx" ON "Schedule"("calendarId", "year", "month");
