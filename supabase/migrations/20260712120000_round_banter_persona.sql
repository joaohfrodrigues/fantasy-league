-- Persona used for a round's AI banter (e.g. 'ruthless-pundit', 'hype-mc'),
-- recorded so the next round's generation can avoid repeating the same voice
-- back-to-back.
ALTER TABLE rounds ADD COLUMN banter_persona TEXT;
