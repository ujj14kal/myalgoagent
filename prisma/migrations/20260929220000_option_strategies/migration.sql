-- CreateTable
CREATE TABLE "OptionStrategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "underlying" TEXT NOT NULL,
    "legs" JSONB NOT NULL,
    "expiryRule" TEXT NOT NULL DEFAULT 'WEEKLY_CURRENT',
    "entryMinute" INTEGER NOT NULL DEFAULT 560,
    "exitMinute" INTEGER NOT NULL DEFAULT 915,
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "stopLossUnit" TEXT,
    "stopLossValue" DOUBLE PRECISION,
    "targetUnit" TEXT,
    "targetValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionBacktestRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "strategyName" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "brokeragePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "slippagePct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "cursor" TEXT,
    "daysDone" INTEGER NOT NULL DEFAULT 0,
    "daysTotal" INTEGER NOT NULL DEFAULT 0,
    "trades" JSONB NOT NULL DEFAULT '[]',
    "stats" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionBacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OptionStrategy_userId_idx" ON "OptionStrategy"("userId");

-- CreateIndex
CREATE INDEX "OptionBacktestRun_userId_createdAt_idx" ON "OptionBacktestRun"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "OptionStrategy" ADD CONSTRAINT "OptionStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionBacktestRun" ADD CONSTRAINT "OptionBacktestRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionBacktestRun" ADD CONSTRAINT "OptionBacktestRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "OptionStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

