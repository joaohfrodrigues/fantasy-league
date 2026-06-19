-- Round lock state and league audit history.

ALTER TABLE public.rounds
ADD COLUMN locked_at TIMESTAMPTZ;

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_league_id_changed_at_idx
  ON public.audit_log (league_id, changed_at DESC);
CREATE INDEX audit_log_entity_type_changed_at_idx
  ON public.audit_log (entity_type, changed_at DESC);

GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
