-- Performance Indexes for fast ledger filtering and status lookup (Tahap D)
CREATE INDEX IF NOT EXISTS "Donation_campaignId_status_idx" ON "Donation"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "LedgerEntry_campaignId_type_idx" ON "LedgerEntry"("campaignId", "type");
