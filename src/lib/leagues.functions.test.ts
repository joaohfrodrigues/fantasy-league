import { describe, it, expect } from "vitest";
import { parsePlayers } from "./leagues.functions";

// parsePlayers requires >= 2 players (a valid league snapshot), so each case
// pads with a second player unaffected by the case under test.
const filler = { name: "Bruno", round_prize: "☕" };

describe("parsePlayers — drink -> round_prize import backwards-compat", () => {
  it("reads the new round_prize key", () => {
    const players = parsePlayers([{ name: "Ana", round_prize: "🍷" }, filler]);
    expect(players[0]).toEqual({ name: "Ana", round_prize: "🍷" });
  });

  it("falls back to the legacy drink key when round_prize is absent", () => {
    const players = parsePlayers([{ name: "Ana", drink: "🍺" }, filler]);
    expect(players[0]).toEqual({ name: "Ana", round_prize: "🍺" });
  });

  it("prefers round_prize over drink when both are present", () => {
    const players = parsePlayers([{ name: "Ana", round_prize: "🍷", drink: "🍺" }, filler]);
    expect(players[0]).toEqual({ name: "Ana", round_prize: "🍷" });
  });

  it("defaults to the beer emoji when neither key is present", () => {
    const players = parsePlayers([{ name: "Ana" }, filler]);
    expect(players[0]).toEqual({ name: "Ana", round_prize: "🍺" });
  });
});
