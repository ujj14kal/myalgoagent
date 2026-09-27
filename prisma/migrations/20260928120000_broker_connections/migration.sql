-- CreateEnum
CREATE TYPE "BrokerConnectionStatus" AS ENUM ('KEYS_SAVED', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "BrokerConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "status" "BrokerConnectionStatus" NOT NULL DEFAULT 'KEYS_SAVED',
    "apiKeyEnc" TEXT NOT NULL,
    "apiSecretEnc" TEXT,
    "apiKeyHint" TEXT NOT NULL,
    "brokerClientId" TEXT,
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "accountName" TEXT,
    "connectedAt" TIMESTAMP(3),
    "pendingState" TEXT,
    "pendingStartedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrokerConnection_userId_broker_key" ON "BrokerConnection"("userId", "broker");

-- AddForeignKey
ALTER TABLE "BrokerConnection" ADD CONSTRAINT "BrokerConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
