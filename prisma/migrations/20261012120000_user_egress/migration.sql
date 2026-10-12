-- CreateEnum
CREATE TYPE "UserEgressStatus" AS ENUM ('PENDING', 'ACTIVE', 'RELEASING', 'RELEASED', 'FAILED');

-- CreateTable
CREATE TABLE "UserEgress" (
    "userId" TEXT NOT NULL,
    "status" "UserEgressStatus" NOT NULL DEFAULT 'PENDING',
    "allocationId" TEXT,
    "publicIp" TEXT,
    "instanceId" TEXT,
    "relayHost" TEXT,
    "relayCertPem" TEXT,
    "tokenEnc" TEXT,
    "graceUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEgress_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "UserEgress_status_idx" ON "UserEgress"("status");

-- AddForeignKey
ALTER TABLE "UserEgress" ADD CONSTRAINT "UserEgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
