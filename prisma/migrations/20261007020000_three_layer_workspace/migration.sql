-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "systemRuntime" JSONB;

-- AlterTable
ALTER TABLE "BacktestRun" ADD COLUMN     "systemRuntime" JSONB;

-- AlterTable
ALTER TABLE "BacktestTrade" ADD COLUMN     "direction" "StrategyDirection";

-- AlterTable
ALTER TABLE "PaperSession" ADD COLUMN     "systemRuntime" JSONB,
ADD COLUMN     "positionDirection" "StrategyDirection",
ADD COLUMN     "systemMemo" JSONB;

-- AlterTable
ALTER TABLE "PaperOrder" ADD COLUMN     "positionSide" "StrategyDirection";

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "description" TEXT,
    "classification" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_userId_updatedAt_idx" ON "Block"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Block_userId_nameNormalized_key" ON "Block"("userId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Concept_userId_updatedAt_idx" ON "Concept"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_userId_nameNormalized_key" ON "Concept"("userId", "nameNormalized");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
