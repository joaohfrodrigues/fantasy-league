-- Add AI-generated summary column to rounds.
-- Populated server-side when a round is locked.
ALTER TABLE rounds ADD COLUMN summary TEXT;
