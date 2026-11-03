-- AlterTable Donation
ALTER TABLE "Donation" ADD COLUMN IF NOT EXISTS "paymentType" TEXT,
ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- AlterTable LedgerEntry
ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "feeSource" TEXT,
ADD COLUMN IF NOT EXISTS "paymentType" TEXT,
ADD COLUMN IF NOT EXISTS "donationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_donationId_key" ON "LedgerEntry"("donationId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_donationId_fkey'
  ) THEN
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
