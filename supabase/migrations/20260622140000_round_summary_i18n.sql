-- Store round summaries per locale (English + European Portuguese).
-- Replaces the single `summary` column; existing data is preserved as the EN version.
ALTER TABLE rounds ADD COLUMN summary_en TEXT;
ALTER TABLE rounds ADD COLUMN summary_pt TEXT;
UPDATE rounds SET summary_en = summary WHERE summary IS NOT NULL;
ALTER TABLE rounds DROP COLUMN summary;
