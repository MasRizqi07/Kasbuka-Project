-- Gate G6 Query: Verifikasi entri pengeluaran (OUT) berbukti nota fisik milik organisasi pilot di database production.
-- Ganti '<id pilot>' dengan organizationId sebenarnya dari tabel "Organization" milik pengurus pilot.
SELECT count(*)
FROM "LedgerEntry" e
JOIN "Campaign" c ON c.id = e."campaignId"
WHERE e.type = 'OUT'
  AND e."proofSha256" IS NOT NULL
  AND c."organizationId" = '<id pilot>';
