-- AlterTable
ALTER TABLE "BrokerConnection" ADD COLUMN     "loginMethod" TEXT,
ADD COLUMN     "notifierTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BrokerConnection_notifierTokenHash_key" ON "BrokerConnection"("notifierTokenHash");

