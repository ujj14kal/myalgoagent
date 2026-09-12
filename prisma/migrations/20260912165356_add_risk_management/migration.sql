-- CreateEnum
CREATE TYPE "RiskUnit" AS ENUM ('PERCENT', 'POINTS', 'ATR_MULTIPLE');

-- AlterTable
ALTER TABLE "BacktestRun" ADD COLUMN     "stopLossEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stopLossUnit" "RiskUnit",
ADD COLUMN     "stopLossValue" DOUBLE PRECISION,
ADD COLUMN     "targetEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetUnit" "RiskUnit",
ADD COLUMN     "targetValue" DOUBLE PRECISION,
ADD COLUMN     "trailingSlEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trailingSlUnit" "RiskUnit",
ADD COLUMN     "trailingSlValue" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PaperSession" ADD COLUMN     "positionFavorableExtreme" DOUBLE PRECISION,
ADD COLUMN     "positionStopLossPrice" DOUBLE PRECISION,
ADD COLUMN     "positionTargetPrice" DOUBLE PRECISION,
ADD COLUMN     "stopLossEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stopLossUnit" "RiskUnit",
ADD COLUMN     "stopLossValue" DOUBLE PRECISION,
ADD COLUMN     "targetEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetUnit" "RiskUnit",
ADD COLUMN     "targetValue" DOUBLE PRECISION,
ADD COLUMN     "trailingSlEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trailingSlUnit" "RiskUnit",
ADD COLUMN     "trailingSlValue" DOUBLE PRECISION;
