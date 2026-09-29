-- AlterTable
ALTER TABLE "User" ADD COLUMN     "liveStaticIp" TEXT,
ADD COLUMN     "liveTermsAcceptedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_liveStaticIp_key" ON "User"("liveStaticIp");

