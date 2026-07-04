/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StandingsTable, type StandingsColumn, type StandingsRow } from "./StandingsTable";

afterEach(cleanup);

const labels = {
  player: "Player",
  roundPrizes: "Rounds won",
  dinner: "Who takes the prize?",
  total: "Total",
  sortBy: (col: string) => `Sort by ${col}`,
};

// Mirrors the live board and example board: recencyRank 0 is the most
// recently played round, null means unplayed/no data.
function makeColumns(): StandingsColumn[] {
  return [
    { id: "r1", short: "MD1", fullTitle: "Matchday 1", locked: true, recencyRank: 2 },
    { id: "r2", short: "MD2", fullTitle: "Matchday 2", locked: true, recencyRank: 1 },
    { id: "r3", short: "MD3", fullTitle: "Matchday 3", locked: true, recencyRank: 0 },
    { id: "r4", short: "MD4", fullTitle: "Matchday 4", locked: false, recencyRank: null },
  ];
}

function makeRows(): StandingsRow[] {
  return ["Ana", "Bruno", "Carla"].map((name, i) => ({
    id: name,
    rank: i + 1,
    isLeader: i === 0,
    player: <span>{name}</span>,
    prizeCell: <span>{`prize-${name}`}</span>,
    dinnerCell: <span>{`dinner-${name}`}</span>,
    scores: {
      r1: { content: 10 + i },
      r2: { content: 20 + i },
      r3: { content: 30 + i },
      r4: { content: 40 + i },
    },
    total: <span>{100 + i}</span>,
  }));
}

describe("StandingsTable", () => {
  it("renders one row per player, in the given rank order", () => {
    const { container } = render(
      <StandingsTable columns={makeColumns()} rows={makeRows()} labels={labels} />,
    );
    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(3);
    const names = [...bodyRows].map((tr) => tr.querySelector("td:nth-child(2)")?.textContent);
    expect(names).toEqual(["Ana", "Bruno", "Carla"]);
  });

  it("applies the progressive-reveal visibility class per column's recency rank", () => {
    const { container } = render(
      <StandingsTable columns={makeColumns()} rows={makeRows()} labels={labels} />,
    );
    // Header cells: #, player, prizes, dinner, then the 4 round columns, then total.
    const roundHeaders = [...container.querySelectorAll("thead th")].slice(4, 8);
    expect(roundHeaders.map((th) => th.className)).toEqual([
      expect.stringContaining("hidden md:table-cell"),
      expect.stringContaining("hidden sm:table-cell"),
      expect.stringContaining("table-cell"),
      expect.stringContaining("hidden lg:table-cell"),
    ]);
    // recencyRank 0 (MD3) is visible at every width, no "hidden" prefix class.
    expect(roundHeaders[2].className).not.toMatch(/hidden (sm|md):/);

    // Score cells for a row carry the same visibility class as their header.
    const firstRowScoreCells = [
      ...[...container.querySelectorAll("tbody tr")][0].querySelectorAll(
        "td:nth-child(5), td:nth-child(6), td:nth-child(7), td:nth-child(8)",
      ),
    ];
    const scoreClasses = firstRowScoreCells.map((td) => td.className);
    expect(scoreClasses[0]).toContain("hidden md:table-cell");
    expect(scoreClasses[1]).toContain("hidden sm:table-cell");
    expect(scoreClasses[2]).not.toMatch(/hidden (sm|md):/);
    expect(scoreClasses[3]).toContain("hidden lg:table-cell");
  });

  it("renders plain (non-sortable) headers when no sort prop is given", () => {
    const { container } = render(
      <StandingsTable columns={makeColumns()} rows={makeRows()} labels={labels} />,
    );
    expect(container.querySelectorAll("thead button")).toHaveLength(0);
    expect(container.querySelector("thead")?.textContent).toContain("Total");
  });

  it("renders sortable header buttons and marks the active column when sort is given", () => {
    const { getByTitle } = render(
      <StandingsTable
        columns={makeColumns()}
        rows={makeRows()}
        labels={labels}
        sort={{ key: "total", dir: "desc", onSortBy: () => {} }}
      />,
    );
    const totalButton = getByTitle("Sort by Total");
    expect(totalButton.className.split(" ")).toContain("text-foreground");
    const prizesButton = getByTitle("Sort by Rounds won");
    expect(prizesButton.className.split(" ")).not.toContain("text-foreground");
  });

  it("shows the empty state only when there are no rows", () => {
    const { queryByText } = render(
      <StandingsTable
        columns={makeColumns()}
        rows={[]}
        labels={labels}
        emptyState={<span>No players yet.</span>}
      />,
    );
    expect(queryByText("No players yet.")).not.toBeNull();
  });

  it("matches the static (example-style) rendering snapshot", () => {
    const { container } = render(
      <StandingsTable columns={makeColumns()} rows={makeRows()} labels={labels} />,
    );
    expect(container.querySelector("table")?.outerHTML).toMatchSnapshot();
  });
});
