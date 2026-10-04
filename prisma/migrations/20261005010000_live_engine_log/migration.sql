-- CreateTable
CREATE TABLE "LiveEngineLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "LiveEngineLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveEngineLog_userId_at_idx" ON "LiveEngineLog"("userId", "at");

-- CreateIndex
CREATE INDEX "LiveEngineLog_deploymentId_at_idx" ON "LiveEngineLog"("deploymentId", "at");

-- AddForeignKey
ALTER TABLE "LiveEngineLog" ADD CONSTRAINT "LiveEngineLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

