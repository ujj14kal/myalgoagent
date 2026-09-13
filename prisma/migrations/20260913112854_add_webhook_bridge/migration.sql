-- AlterEnum
ALTER TYPE "StrategyMode" ADD VALUE 'WEBHOOK';

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookTokenHash" TEXT;

-- CreateTable
CREATE TABLE "WebhookAlert" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" TEXT NOT NULL,
    "parsedAction" "PaperOrderSide",
    "parseError" TEXT,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "paperOrderId" TEXT,

    CONSTRAINT "WebhookAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookAlert_paperOrderId_key" ON "WebhookAlert"("paperOrderId");

-- CreateIndex
CREATE INDEX "WebhookAlert_strategyId_receivedAt_idx" ON "WebhookAlert"("strategyId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_webhookTokenHash_key" ON "Strategy"("webhookTokenHash");

-- AddForeignKey
ALTER TABLE "WebhookAlert" ADD CONSTRAINT "WebhookAlert_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookAlert" ADD CONSTRAINT "WebhookAlert_paperOrderId_fkey" FOREIGN KEY ("paperOrderId") REFERENCES "PaperOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

