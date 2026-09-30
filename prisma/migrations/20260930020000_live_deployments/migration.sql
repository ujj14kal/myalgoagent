-- AlterTable
ALTER TABLE "BrokerConnection" ADD COLUMN     "liveReadyAt" TIMESTAMP(3),
ADD COLUMN     "liveReadyDetail" JSONB;

-- AlterTable
ALTER TABLE "LiveOrder" ADD COLUMN     "deploymentId" TEXT;

-- CreateTable
CREATE TABLE "LiveDeployment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "strategyName" TEXT NOT NULL,
    "instrumentSymbol" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CONFIRM',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "capital" DOUBLE PRECISION NOT NULL,
    "product" TEXT NOT NULL,
    "engineState" JSONB NOT NULL,
    "lastSyncedTime" INTEGER,
    "positionQty" INTEGER NOT NULL DEFAULT 0,
    "positionAvgPrice" DOUBLE PRECISION,
    "pendingSignals" JSONB NOT NULL DEFAULT '[]',
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveDeployment_status_idx" ON "LiveDeployment"("status");

-- CreateIndex
CREATE INDEX "LiveDeployment_userId_idx" ON "LiveDeployment"("userId");

-- AddForeignKey
ALTER TABLE "LiveOrder" ADD CONSTRAINT "LiveOrder_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "LiveDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveDeployment" ADD CONSTRAINT "LiveDeployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveDeployment" ADD CONSTRAINT "LiveDeployment_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

