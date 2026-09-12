-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SIGNAL_ALERT';

-- AlterTable
ALTER TABLE "BacktestRun" ADD COLUMN     "maxPyramidEntries" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PaperSession" ADD COLUMN     "alertOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxPyramidEntries" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "positionPyramidCount" INTEGER NOT NULL DEFAULT 1;
