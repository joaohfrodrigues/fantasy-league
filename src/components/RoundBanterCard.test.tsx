/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RoundBanterCard, type RoundBanterCardLabels } from "./RoundBanterCard";

afterEach(cleanup);

const labels: RoundBanterCardLabels = {
  afterRound: (name: string) => `After ${name}`,
  shareRound: "Share recap",
  shareRoundTitle: "Share this round's recap card",
  banterPrevRound: "Previous round summary",
  banterNextRound: "Next round summary",
};

describe("RoundBanterCard", () => {
  it("shows the Share button for a locked round", () => {
    const { getByTitle } = render(
      <RoundBanterCard
        roundName="Round 3"
        text="Alice edges out Bob."
        locked
        onShare={() => {}}
        labels={labels}
      />,
    );
    expect(getByTitle("Share this round's recap card")).not.toBeNull();
  });

  it("hides the Share button for an unlocked round", () => {
    const { queryByTitle } = render(
      <RoundBanterCard
        roundName="Round 4"
        text="Still in progress."
        locked={false}
        onShare={() => {}}
        labels={labels}
      />,
    );
    expect(queryByTitle("Share this round's recap card")).toBeNull();
  });

  it("calls onShare when the Share button is clicked", () => {
    const onShare = vi.fn();
    const { getByTitle } = render(
      <RoundBanterCard
        roundName="Round 3"
        text="Alice edges out Bob."
        locked
        onShare={onShare}
        labels={labels}
      />,
    );
    fireEvent.click(getByTitle("Share this round's recap card"));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("omits pagination controls when there's nothing to page through", () => {
    const { queryByTitle } = render(
      <RoundBanterCard
        roundName="Round 3"
        text="Alice edges out Bob."
        locked
        onShare={() => {}}
        labels={labels}
      />,
    );
    expect(queryByTitle("Previous round summary")).toBeNull();
    expect(queryByTitle("Next round summary")).toBeNull();
  });

  it("disables the older/newer controls at each end and calls the right handler", () => {
    const onGoOlder = vi.fn();
    const onGoNewer = vi.fn();
    const { getByTitle } = render(
      <RoundBanterCard
        roundName="Round 3"
        text="Alice edges out Bob."
        locked
        onShare={() => {}}
        labels={labels}
        pagination={{ atOldest: true, atNewest: false, onGoOlder, onGoNewer }}
      />,
    );
    const older = getByTitle("Previous round summary");
    const newer = getByTitle("Next round summary");
    expect(older.hasAttribute("disabled")).toBe(true);
    expect(newer.hasAttribute("disabled")).toBe(false);

    fireEvent.click(newer);
    expect(onGoNewer).toHaveBeenCalledTimes(1);
    fireEvent.click(older); // disabled — should not fire
    expect(onGoOlder).not.toHaveBeenCalled();
  });
});
