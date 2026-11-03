SELECT count(*) 
FROM "LedgerEntry" e 
JOIN "Campaign" c ON c.id = e."campaignId" 
WHERE e.type = 'OUT' 
  AND e."proofSha256" IS NOT NULL 
  AND c."organizationId" = 'cmw0kwtlh0000guao0kxefthg';

