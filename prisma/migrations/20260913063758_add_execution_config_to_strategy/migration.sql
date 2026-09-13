-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "maxPyramidEntries" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "positionSizingMode" "PositionSizingMode" NOT NULL DEFAULT 'FULL_CAPITAL',
ADD COLUMN     "positionSizingValue" DOUBLE PRECISION,
ADD COLUMN     "stopLossEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stopLossUnit" "RiskUnit",
ADD COLUMN     "stopLossValue" DOUBLE PRECISION,
ADD COLUMN     "targetEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetUnit" "RiskUnit",
ADD COLUMN     "targetValue" DOUBLE PRECISION,
ADD COLUMN     "trailingSlEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trailingSlUnit" "RiskUnit",
ADD COLUMN     "trailingSlValue" DOUBLE PRECISION;
