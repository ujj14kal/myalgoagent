-- CreateEnum
CREATE TYPE "CreditPlan" AS ENUM ('FREE', 'TRADE', 'PRO');

-- CreateTable
CREATE TABLE "CreditAccount" (
    "userId" TEXT NOT NULL,
    "plan" "CreditPlan" NOT NULL DEFAULT 'FREE',
    "monthlyBalance" INTEGER NOT NULL,
    "topupBalance" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "aiRepliesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CreditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT,
    "credits" INTEGER NOT NULL,
    "monthlyAfter" INTEGER NOT NULL,
    "topupAfter" INTEGER NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditEvent_userId_createdAt_idx" ON "CreditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditEvent_userId_action_createdAt_idx" ON "CreditEvent"("userId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEvent" ADD CONSTRAINT "CreditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Everyone who already has an account keeps full access (early access, Pro limits) so nobody is cut off when metering starts.
-- Accounts created from now on start on the free plan.
INSERT INTO "CreditAccount" ("userId", "plan", "monthlyBalance", "topupBalance", "periodStart", "periodEnd", "aiRepliesUsed", "updatedAt")
SELECT "id", 'PRO', 4000, 0, NOW(), NOW() + INTERVAL '1 month', 0, NOW() FROM "User";
