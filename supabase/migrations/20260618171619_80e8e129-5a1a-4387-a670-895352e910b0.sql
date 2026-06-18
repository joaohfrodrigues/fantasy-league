
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  round_key TEXT NOT NULL,
  points INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, round_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scores TO anon, authenticated;
GRANT ALL ON public.players TO service_role;
GRANT ALL ON public.scores TO service_role;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Public write players" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update players" ON public.players FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete players" ON public.players FOR DELETE USING (true);

CREATE POLICY "Public read scores" ON public.scores FOR SELECT USING (true);
CREATE POLICY "Public write scores" ON public.scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update scores" ON public.scores FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete scores" ON public.scores FOR DELETE USING (true);

INSERT INTO public.players (name, display_order) VALUES
  ('João', 1),
  ('Mariana', 2),
  ('Pedro', 3),
  ('Tiago', 4),
  ('Camacho', 5),
  ('Joana', 6),
  ('Sofia', 7),
  ('Francisco', 8),
  ('Sara', 9),
  ('José Luís', 10);
