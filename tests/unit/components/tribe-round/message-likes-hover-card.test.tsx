import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageLikesHoverCard } from "@/components/tribe-round/message-likes-hover-card";

const HOVER_OPEN_DELAY_MS = 700;
const HOVER_CLOSE_DELAY_MS = 300;

type LikerFixture = {
  avatarFallback: string;
  id: string;
  image: string | null;
  name: string;
  role: "guardian" | "leader" | "tribemate";
};

function buildLiker(id: string, name: string, avatarFallback: string): LikerFixture {
  return {
    avatarFallback,
    id,
    image: null,
    name,
    role: "tribemate",
  };
}

function renderHoverCard(likeCount = 12) {
  return render(
    <MessageLikesHoverCard
      likeCount={likeCount}
      messageId="message-1"
      tribeSlug="matematica-pro"
    >
      <button type="button">{`Me gusta ${likeCount}`}</button>
    </MessageLikesHoverCard>
  );
}

function renderDisabledHoverCard(likeCount = 3) {
  const handleClick = vi.fn();

  render(
    <MessageLikesHoverCard
      isTriggerDisabled
      likeCount={likeCount}
      messageId="message-1"
      onTriggerClick={handleClick}
      tribeSlug="matematica-pro"
    >
      <button disabled type="button">{`Me gusta ${likeCount}`}</button>
    </MessageLikesHoverCard>
  );

  return { handleClick };
}

async function openHoverCard(user: ReturnType<typeof userEvent.setup>) {
  await user.hover(screen.getByRole("button", { name: /Me gusta/ }));
  await act(async () => {
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
  });
}

describe("MessageLikesHoverCard", () => {
  beforeEach(() => {
    (global.fetch as Mock).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches likers on open and shows the preview with the collapsed remainder", async () => {
    const previewLikers = [
      buildLiker("member-1", "Guido Modarelli", "GM"),
      buildLiker("member-2", "Ana López", "AL"),
      buildLiker("member-3", "Juan Pérez", "JP"),
      buildLiker("member-4", "María Rodríguez", "MR"),
      buildLiker("member-5", "Carlos Sánchez", "CS"),
      buildLiker("member-6", "Lucía Fernández", "LF"),
      buildLiker("member-7", "Diego García", "DG"),
    ];
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({ likers: previewLikers, totalCount: 12 }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(12);

    expect(global.fetch).not.toHaveBeenCalled();

    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText("Guido Modarelli")).toBeInTheDocument();
    });
    expect(screen.getByText("Le gustó a")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages/message-1/likes",
      expect.objectContaining({ signal: expect.anything() })
    );
    previewLikers.forEach((liker) => {
      expect(screen.getByText(liker.name)).toBeInTheDocument();
    });
    expect(screen.getByText("y otros 5...")).toBeInTheDocument();
  });

  it("prefers opening the hover card above the like button", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        likers: [buildLiker("member-1", "Guido Modarelli", "GM")],
        totalCount: 1,
      }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(1);
    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText("Guido Modarelli")).toBeInTheDocument();
    });
    const hoverCardContent = document.querySelector(
      '[data-slot="hover-card-content"]'
    );

    expect(hoverCardContent).toHaveAttribute("data-side", "top");
  });

  it("does not render the remainder row when all likers fit in the preview", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        likers: [buildLiker("member-1", "Guido Modarelli", "GM")],
        totalCount: 1,
      }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(1);
    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText("Guido Modarelli")).toBeInTheDocument();
    });
    expect(screen.queryByText(/y otros/)).not.toBeInTheDocument();
  });

  it("opens from focus when the wrapped like button is disabled", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        likers: [buildLiker("member-1", "Guido Modarelli", "GM")],
        totalCount: 1,
      }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { handleClick } = renderDisabledHoverCard(3);

    await user.tab();

    await waitFor(() => {
      expect(screen.getByText("Guido Modarelli")).toBeInTheDocument();
    });
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("does not request likers when an open timer fires after unmounting", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = renderHoverCard(3);

    // Focus and hover each schedule a HoverCard open timer; the second one
    // replaces the first, so unmounting only cancels the latest timer.
    await user.tab();
    await user.hover(screen.getByRole("button", { name: /Me gusta/ }));
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not cancel touch starts on the wrapped like button", () => {
    const handleClick = vi.fn();

    render(
      <MessageLikesHoverCard
        likeCount={1}
        messageId="message-1"
        tribeSlug="matematica-pro"
      >
        <button onClick={handleClick} type="button">
          Me gusta 1
        </button>
      </MessageLikesHoverCard>
    );

    const likeButton = screen.getByRole("button", { name: "Me gusta 1" });

    expect(fireEvent.touchStart(likeButton)).toBe(true);

    fireEvent.click(likeButton);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when the message has no likes", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({ likers: [], totalCount: 0 }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(0);
    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText("Todavía nadie dio me gusta.")).toBeInTheDocument();
    });
  });

  it("shows the empty state when every liker was withdrawn after the count was rendered", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({ likers: [], totalCount: 0 }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(2);
    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText("Todavía nadie dio me gusta.")).toBeInTheDocument();
    });
  });

  it("announces loading and result feedback through a polite live region", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({ message: "boom" }),
      ok: false,
      statusText: "Internal Server Error",
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(3);
    await openHoverCard(user);

    const errorFeedback = await screen.findByText(
      "No pudimos cargar las reacciones."
    );

    expect(errorFeedback.closest("[aria-live]")).toHaveAttribute(
      "aria-live",
      "polite"
    );
  });

  it("shows a safe error message when the request fails", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({ message: "boom" }),
      ok: false,
      statusText: "Internal Server Error",
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(3);
    await openHoverCard(user);

    await waitFor(() => {
      expect(
        screen.getByText("No pudimos cargar las reacciones.")
      ).toBeInTheDocument();
    });
  });

  it("clears stale likers while a later request loads and fails", async () => {
    const firstLiker = buildLiker("member-1", "Guido Modarelli", "GM");
    let rejectLaterRequest: (error: Error) => void = () => {};
    const laterRequest = new Promise<never>((_, reject) => {
      rejectLaterRequest = reject;
    });
    (global.fetch as Mock)
      .mockResolvedValueOnce({
        json: async () => ({ likers: [firstLiker], totalCount: 1 }),
        ok: true,
      })
      .mockReturnValueOnce(laterRequest);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderHoverCard(1);

    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText(firstLiker.name)).toBeInTheDocument();
    });

    await user.unhover(screen.getByRole("button", { name: /Me gusta/ }));
    await act(async () => {
      vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
    });
    await waitFor(() => {
      expect(screen.queryByText(firstLiker.name)).not.toBeInTheDocument();
    });

    await user.hover(screen.getByRole("button", { name: /Me gusta/ }));
    await act(async () => {
      vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    });

    expect(screen.getByText("Cargando reacciones...")).toBeInTheDocument();
    expect(screen.queryByText(firstLiker.name)).not.toBeInTheDocument();

    await act(async () => {
      rejectLaterRequest(new Error("boom"));
    });

    await waitFor(() => {
      expect(
        screen.getByText("No pudimos cargar las reacciones.")
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(firstLiker.name)).not.toBeInTheDocument();
  });
});

describe("MessageLikesHoverCard on touch devices", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    (global.fetch as Mock).mockReset();
    window.matchMedia = function matchMediaTouchStub(query: string): MediaQueryList {
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: query === "(hover: none)",
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    };
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("opens the likers list from a dedicated tap target without toggling the like", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        likers: [buildLiker("liker-1", "Ana Torres", "AT")],
        totalCount: 1,
      }),
      ok: true,
    });
    const handleLike = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageLikesHoverCard
        likeCount={1}
        messageId="message-1"
        tribeSlug="matematica-pro"
      >
        <button onClick={handleLike} type="button">
          Me gusta 1
        </button>
      </MessageLikesHoverCard>
    );

    await user.click(
      screen.getByRole("button", { name: "Ver quiénes dieron me gusta" })
    );

    await waitFor(() => {
      expect(screen.getByText("Ana Torres")).toBeInTheDocument();
    });
    expect(handleLike).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-slot="popover-content"]')
    ).toHaveAttribute("data-side", "top");
  });

  it("keeps the like button working and hides the list trigger without likes", async () => {
    const handleLike = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageLikesHoverCard
        likeCount={0}
        messageId="message-1"
        tribeSlug="matematica-pro"
      >
        <button onClick={handleLike} type="button">
          Me gusta 0
        </button>
      </MessageLikesHoverCard>
    );

    expect(
      screen.queryByRole("button", { name: "Ver quiénes dieron me gusta" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Me gusta 0" }));

    expect(handleLike).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
