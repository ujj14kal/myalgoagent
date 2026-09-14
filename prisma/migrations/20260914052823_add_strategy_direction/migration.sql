-- CreateEnum
CREATE TYPE "StrategyDirection" AS ENUM ('LONG', 'SHORT');

-- AlterTable
ALTER TABLE "BacktestRun" ADD COLUMN     "direction" "StrategyDirection" NOT NULL DEFAULT 'LONG';

-- AlterTable
ALTER TABLE "PaperSession" ADD COLUMN     "direction" "StrategyDirection" NOT NULL DEFAULT 'LONG';

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "direction" "StrategyDirection" NOT NULL DEFAULT 'LONG';

