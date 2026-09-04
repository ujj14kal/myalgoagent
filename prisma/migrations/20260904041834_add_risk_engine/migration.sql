-- CreateEnum
CREATE TYPE "RiskEventType" AS ENUM ('KILL_SWITCH_BLOCKED', 'MAX_LOSS_HIT', 'MAX_CONSECUTIVE_LOSSES_HIT');

-- CreateTable
CREATE TABLE "RiskSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "killSwitchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxLossPercent" DOUBLE PRECISION,
    "maxConsecutiveLosses" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paperSessionId" TEXT,
    "type" "RiskEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskSettings_userId_key" ON "RiskSettings"("userId");

-- AddForeignKey
ALTER TABLE "RiskSettings" ADD CONSTRAINT "RiskSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
