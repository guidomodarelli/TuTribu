import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RoundChannelFilters } from "@/components/tribe-round/round-channel-filters";

const channels = [
  {
    accessScope: "tribemates" as const,
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
    sortOrder: 10,
  },
  {
    accessScope: "tribemates" as const,
    emoji: "📚",
    id: "channel-resources",
    name: "Recursos",
    slug: "recursos",
    sortOrder: 20,
  },
];

const ACTIVE_CHIP_CLASS = "RoundChannelFilters__chip--active";

function buildChannelHref(channelSlug: string | null): string {
  return channelSlug ? `/matematica-pro?channel=${channelSlug}` : "/matematica-pro";
}

/** jsdom cannot navigate; cancel the default action after React handles the click. */
function preventDocumentNavigation(event: MouseEvent) {
  event.preventDefault();
}

describe("RoundChannelFilters", () => {
  beforeEach(() => {
    document.addEventListener("click", preventDocumentNavigation);
  });

  afterEach(() => {
    document.removeEventListener("click", preventDocumentNavigation);
  });

  it("links every chip to its filtered page and marks the server active one as current", () => {
    render(
      <RoundChannelFilters
        activeChannelId="channel-resources"
        allChannelsLabel="Todos"
        buildChannelHref={buildChannelHref}
        channels={channels}
        navigationLabel="Canal del mensaje"
      />
    );

    expect(screen.getByRole("navigation", { name: "Canal del mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("href", "/matematica-pro");
    expect(screen.getByRole("link", { name: "Recursos" })).toHaveAttribute(
      "href",
      "/matematica-pro?channel=recursos"
    );
    expect(screen.getByRole("link", { name: "Recursos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Recursos" })).toHaveClass(ACTIVE_CHIP_CLASS);
    expect(screen.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current");
  });

  it("highlights the tapped chip right away while the filtered page loads", async () => {
    const user = userEvent.setup();

    render(
      <RoundChannelFilters
        activeChannelId={null}
        allChannelsLabel="Todos"
        buildChannelHref={buildChannelHref}
        channels={channels}
        navigationLabel="Canal del mensaje"
      />
    );

    await user.click(screen.getByRole("link", { name: "Ronda" }));

    expect(screen.getByRole("link", { name: "Ronda" })).toHaveClass(ACTIVE_CHIP_CLASS);
    expect(screen.getByRole("link", { name: "Todos" })).not.toHaveClass(ACTIVE_CHIP_CLASS);
    // The current page only changes once the server renders the filtered round.
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page");
  });

  it("follows the server active channel after navigating back from a tapped chip", async () => {
    const user = userEvent.setup();
    const filtersProps = {
      allChannelsLabel: "Todos",
      buildChannelHref,
      channels,
      navigationLabel: "Canal del mensaje",
    };
    const { rerender } = render(<RoundChannelFilters activeChannelId={null} {...filtersProps} />);

    await user.click(screen.getByRole("link", { name: "Ronda" }));
    // The server renders the filtered round, then the browser goes back to all channels.
    rerender(<RoundChannelFilters activeChannelId="channel-ronda" {...filtersProps} />);
    rerender(<RoundChannelFilters activeChannelId={null} {...filtersProps} />);

    expect(screen.getByRole("link", { name: "Todos" })).toHaveClass(ACTIVE_CHIP_CLASS);
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ronda" })).not.toHaveClass(ACTIVE_CHIP_CLASS);
  });

  it("keeps the current highlight when a chip is opened in a new tab", () => {
    render(
      <RoundChannelFilters
        activeChannelId={null}
        allChannelsLabel="Todos"
        buildChannelHref={buildChannelHref}
        channels={channels}
        navigationLabel="Canal del mensaje"
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Ronda" }), { ctrlKey: true });

    expect(screen.getByRole("link", { name: "Ronda" })).not.toHaveClass(ACTIVE_CHIP_CLASS);
    expect(screen.getByRole("link", { name: "Todos" })).toHaveClass(ACTIVE_CHIP_CLASS);
  });

  it("hands a plain click to the in-place loader instead of following the link", async () => {
    const user = userEvent.setup();
    const onChannelSelect = vi.fn(() => Promise.resolve());
    const followedLinks: boolean[] = [];
    const recordDefaultAction = (event: MouseEvent) => {
      followedLinks.push(!event.defaultPrevented);
    };
    document.addEventListener("click", recordDefaultAction);

    render(
      <RoundChannelFilters
        activeChannelId={null}
        allChannelsLabel="Todos"
        buildChannelHref={buildChannelHref}
        channels={channels}
        navigationLabel="Canal del mensaje"
        onChannelSelect={onChannelSelect}
      />
    );

    await user.click(screen.getByRole("link", { name: "Recursos" }));
    await user.click(screen.getByRole("link", { name: "Todos" }));

    document.removeEventListener("click", recordDefaultAction);
    expect(onChannelSelect.mock.calls).toEqual([["recursos"], [null]]);
    expect(followedLinks).toEqual([false, false]);
  });

  it("returns the highlight to the active channel when the in-place load does not land", async () => {
    const user = userEvent.setup();
    let settleSelection: () => void = () => undefined;
    const onChannelSelect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settleSelection = resolve;
        })
    );

    render(
      <RoundChannelFilters
        activeChannelId={null}
        allChannelsLabel="Todos"
        buildChannelHref={buildChannelHref}
        channels={channels}
        navigationLabel="Canal del mensaje"
        onChannelSelect={onChannelSelect}
      />
    );

    await user.click(screen.getByRole("link", { name: "Ronda" }));
    expect(screen.getByRole("link", { name: "Ronda" })).toHaveClass(ACTIVE_CHIP_CLASS);

    await act(async () => {
      settleSelection();
    });

    expect(screen.getByRole("link", { name: "Ronda" })).not.toHaveClass(ACTIVE_CHIP_CLASS);
    expect(screen.getByRole("link", { name: "Todos" })).toHaveClass(ACTIVE_CHIP_CLASS);
  });

  it("keeps the newest tapped chip highlighted when an older selection settles", async () => {
    const user = userEvent.setup();
    const settleSelections: Array<() => void> = [];
    const onChannelSelect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settleSelections.push(resolve);
        })
    );

    render(
      <RoundChannelFilters
        activeChannelId={null}
        allChannelsLabel="Todos"
        buildChannelHref={buildChannelHref}
        channels={channels}
        navigationLabel="Canal del mensaje"
        onChannelSelect={onChannelSelect}
      />
    );

    await user.click(screen.getByRole("link", { name: "Ronda" }));
    await user.click(screen.getByRole("link", { name: "Recursos" }));
    await act(async () => {
      settleSelections[0]();
    });

    expect(screen.getByRole("link", { name: "Recursos" })).toHaveClass(ACTIVE_CHIP_CLASS);
    expect(screen.getByRole("link", { name: "Ronda" })).not.toHaveClass(ACTIVE_CHIP_CLASS);
  });
});
