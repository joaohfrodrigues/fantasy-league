-- League-level tie-break rule for ranking players tied on total points.
-- 'total'  -> total points only (previous behaviour)
-- 'wins'   -> total points, then most round wins
-- 'latest' -> total points, then best score in the latest played round

ALTER TABLE public.leagues
ADD COLUMN tiebreak TEXT NOT NULL DEFAULT 'total'
CHECK (tiebreak IN ('total', 'wins', 'latest'));
