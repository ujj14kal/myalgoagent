-- CreateEnum
CREATE TYPE "PositionSizingMode" AS ENUM ('FULL_CAPITAL', 'FIXED_QUANTITY', 'FIXED_CAPITAL', 'PERCENT_OF_CAPITAL');

-- AlterTable
ALTER TABLE "BacktestRun" ADD COLUMN     "positionSizingMode" "PositionSizingMode" NOT NULL DEFAULT 'FULL_CAPITAL',
ADD COLUMN     "positionSizingValue" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PaperSession" ADD COLUMN     "positionSizingMode" "PositionSizingMode" NOT NULL DEFAULT 'FULL_CAPITAL',
ADD COLUMN     "positionSizingValue" DOUBLE PRECISION;
