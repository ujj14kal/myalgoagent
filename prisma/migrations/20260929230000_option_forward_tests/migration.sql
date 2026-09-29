-- CreateTable
CREATE TABLE "OptionForwardTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "strategyName" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "brokeragePerOrder" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "slippagePct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "trades" JSONB NOT NULL DEFAULT '[]',
    "today" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionForwardTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OptionForwardTest_status_idx" ON "OptionForwardTest"("status");

-- CreateIndex
CREATE INDEX "OptionForwardTest_userId_idx" ON "OptionForwardTest"("userId");

-- AddForeignKey
ALTER TABLE "OptionForwardTest" ADD CONSTRAINT "OptionForwardTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionForwardTest" ADD CONSTRAINT "OptionForwardTest_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "OptionStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

