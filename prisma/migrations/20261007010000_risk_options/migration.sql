-- AlterEnum
ALTER TYPE "RiskUnit" ADD VALUE 'R_MULTIPLE';

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "riskOptions" JSONB;

-- AlterTable
ALTER TABLE "BacktestRun" ADD COLUMN     "riskOptions" JSONB;

-- AlterTable
ALTER TABLE "PaperSession" ADD COLUMN     "riskOptions" JSONB,
ADD COLUMN     "positionTrailAfter" JSONB,
ADD COLUMN     "engineMemo" JSONB;
