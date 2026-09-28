-- CreateEnum
CREATE TYPE "LiveOrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "LiveOrderStatus" AS ENUM ('CREATED', 'OPEN', 'TRIGGER_PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "RiskSettings" ADD COLUMN     "liveMaxOrderValue" DOUBLE PRECISION,
ADD COLUMN     "liveMaxOrdersPerDay" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "liveTradingEnabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LiveOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL,
    "brokerOrderId" TEXT,
    "exchange" TEXT NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'CASH',
    "tradingSymbol" TEXT NOT NULL,
    "instrumentSymbol" TEXT NOT NULL,
    "side" "LiveOrderSide" NOT NULL,
    "orderType" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION,
    "triggerPrice" DOUBLE PRECISION,
    "status" "LiveOrderStatus" NOT NULL DEFAULT 'CREATED',
    "brokerStatus" TEXT,
    "filledQuantity" INTEGER NOT NULL DEFAULT 0,
    "averagePrice" DOUBLE PRECISION,
    "purpose" TEXT NOT NULL,
    "reason" TEXT,
    "rejectReason" TEXT,
    "exchangeAlgoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "LiveOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "LiveOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveOrder_clientRef_key" ON "LiveOrder"("clientRef");

-- CreateIndex
CREATE INDEX "LiveOrder_userId_createdAt_idx" ON "LiveOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveOrder_status_idx" ON "LiveOrder"("status");

-- CreateIndex
CREATE INDEX "LiveOrderEvent_orderId_at_idx" ON "LiveOrderEvent"("orderId", "at");

-- AddForeignKey
ALTER TABLE "LiveOrder" ADD CONSTRAINT "LiveOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOrderEvent" ADD CONSTRAINT "LiveOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LiveOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

