-- CreateEnum
CREATE TYPE "PaperSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "PaperOrderSide" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "PaperSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "strategyName" TEXT NOT NULL,
    "instrumentSymbol" TEXT NOT NULL,
    "entryCondition" JSONB NOT NULL,
    "exitCondition" JSONB NOT NULL,
    "startingCapital" DOUBLE PRECISION NOT NULL,
    "brokeragePercent" DOUBLE PRECISION NOT NULL,
    "slippagePercent" DOUBLE PRECISION NOT NULL,
    "cash" DOUBLE PRECISION NOT NULL,
    "positionEntryIdx" INTEGER,
    "positionEntryTime" INTEGER,
    "positionEntryPrice" DOUBLE PRECISION,
    "positionQuantity" DOUBLE PRECISION,
    "lastSyncedTime" INTEGER,
    "status" "PaperSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperOrder" (
    "id" TEXT NOT NULL,
    "paperSessionId" TEXT NOT NULL,
    "side" "PaperOrderSide" NOT NULL,
    "time" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL,
    "netPnl" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PaperSession" ADD CONSTRAINT "PaperSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperSession" ADD CONSTRAINT "PaperSession_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperOrder" ADD CONSTRAINT "PaperOrder_paperSessionId_fkey" FOREIGN KEY ("paperSessionId") REFERENCES "PaperSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
