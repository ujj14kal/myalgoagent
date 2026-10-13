-- The BSE master listed mutual-fund scheme units ("08ABB" Nippon India Mutual Fund …) as if they were stocks; they crowded every
-- stock picker. Remove them unless a strategy uses one (watchlist items and chart layouts go with them by cascade).
DELETE FROM "Instrument" i
WHERE i.exchange = 'BSE'
  AND i.name ILIKE '%mutual fund%'
  AND NOT EXISTS (SELECT 1 FROM "Strategy" s WHERE s."instrumentId" = i.id);
