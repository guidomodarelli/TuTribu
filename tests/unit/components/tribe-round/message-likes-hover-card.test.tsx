import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageLikesHoverCard } from "@/components/tribe-round/message-likes-hover-card";

const HOVER_OPEN_DELAY_MS = 700;

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
  const handleClick = jest.fn();

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
    jest.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
  });
}

describe("MessageLikesHoverCard", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ likers: previewLikers, totalCount: 12 }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        likers: [buildLiker("member-1", "Guido Modarelli", "GM")],
        totalCount: 1,
      }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

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
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        likers: [buildLiker("member-1", "Guido Modarelli", "GM")],
        totalCount: 1,
      }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderHoverCard(1);
    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText("Guido Modarelli")).toBeInTheDocument();
    });
    expect(screen.queryByText(/y otros/)).not.toBeInTheDocument();
  });

  it("opens from focus when the wrapped like button is disabled", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        likers: [buildLiker("member-1", "Guido Modarelli", "GM")],
        totalCount: 1,
      }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { handleClick } = renderDisabledHoverCard(3);

    await user.tab();

    await waitFor(() => {
      expect(screen.getByText("Guido Modarelli")).toBeInTheDocument();
    });
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("shows the empty state when the message has no likes", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ likers: [], totalCount: 0 }),
      ok: true,
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderHoverCard(0);
    await openHoverCard(user);

    await waitFor(() => {
      expect(screen.getByText("Todavía nadie dio me gusta.")).toBeInTheDocument();
    });
  });

  it("shows a safe error message when the request fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ message: "boom" }),
      ok: false,
      statusText: "Internal Server Error",
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderHoverCard(3);
    await openHoverCard(user);

    await waitFor(() => {
      expect(
        screen.getByText("No pudimos cargar las reacciones.")
      ).toBeInTheDocument();
    });
  });
});
