-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerNote_userId_createdAt_idx" ON "CustomerNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerNote_followUpAt_doneAt_idx" ON "CustomerNote"("followUpAt", "doneAt");

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
