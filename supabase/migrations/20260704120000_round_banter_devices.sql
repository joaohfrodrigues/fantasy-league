-- Rolling list of narrative devices used in each round's AI banter (e.g.
-- 'leader-change-callout', 'last-place-roast'), self-reported by Gemini. Used
-- to steer future prompts away from repeating the same structural angles.
ALTER TABLE rounds ADD COLUMN banter_devices TEXT[];
