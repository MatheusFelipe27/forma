-- DropForeignKey
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_trainingId_fkey";

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
