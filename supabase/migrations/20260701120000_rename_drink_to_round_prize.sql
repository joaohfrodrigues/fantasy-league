-- Rename players.drink to players.round_prize: the column stores the prize a
-- player earns for winning a round, not a literal drink. A plain rename
-- preserves existing values (no drop-and-add).
ALTER TABLE players RENAME COLUMN drink TO round_prize;
