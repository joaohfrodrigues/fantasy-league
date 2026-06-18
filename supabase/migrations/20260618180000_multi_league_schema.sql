-- Multi-league schema.
-- Anyone with a league's slug can READ it. All writes go through server functions
-- using the service role, which verify the league's shared password first.

-- A league: one group of friends, identified publicly by a short slug.
CREATE TABLE public.leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The shared edit password lives in its own table that anon/authenticated can
-- NEVER read (no grants, no RLS policies). Only the service role touches it.
CREATE TABLE public.league_credentials (
  league_id UUID PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rounds are defined per league (custom competition).
CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  drink TEXT NOT NULL DEFAULT '🍺',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, name)
);

CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  points INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, round_id)
);

CREATE INDEX rounds_league_id_idx ON public.rounds (league_id);
CREATE INDEX players_league_id_idx ON public.players (league_id);
CREATE INDEX scores_player_id_idx ON public.scores (player_id);
CREATE INDEX scores_round_id_idx ON public.scores (round_id);

-- Reads are public; writes are reserved for the service role (server functions).
GRANT SELECT ON public.leagues, public.rounds, public.players, public.scores TO anon, authenticated;
GRANT ALL ON public.leagues, public.league_credentials, public.rounds, public.players, public.scores TO service_role;

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read leagues" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Public read rounds" ON public.rounds FOR SELECT USING (true);
CREATE POLICY "Public read players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Public read scores" ON public.scores FOR SELECT USING (true);
-- No grants and no policies on league_credentials: anon/authenticated cannot read it.

-- Enable realtime so the board updates live for everyone viewing a league.
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;
