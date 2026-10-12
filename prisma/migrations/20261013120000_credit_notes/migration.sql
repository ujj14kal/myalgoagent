-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" INTEGER,
ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "creditNoteNumber" TEXT,
ADD COLUMN "creditNoteSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_creditNoteNumber_key" ON "Payment"("creditNoteNumber");
