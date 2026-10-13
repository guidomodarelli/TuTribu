import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { act, fireEvent, render as renderComponent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "beez-ui";

import { TribeRound } from "@/components/tribe-round/tribe-round";

const refreshMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

globalThis.ResizeObserver = ResizeObserverMock;
globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

const TRIBE_PATH = "/matematica-pro";
const ROUND_API_PATH = "/api/tribes/matematica-pro/messages";

const authenticatedMember = {
  avatarFallback: "GH",
  email: "grace.hopper@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

const channels = [
  {
    accessScope: "tribemates" as const,
    emoji: "⭐",
    id: "channel-intro",
    name: "Intro and Goals",
    slug: "intro-and-goals",
    sortOrder: 10,
  },
  {
    accessScope: "tribemates" as const,
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
    sortOrder: 20,
  },
];

const viewerPermissions = {
  canCreateMessage: true,
  canPinMessages: false,
  canReact: true,
  canReply: true,
};

function buildMessage(id: string, title: string, channelIndex: number) {
  return {
    author: {
      avatarFallback: "AL",
      id: "leader-1",
      image: null,
      name: "Ada Lovelace",
      role: "leader" as const,
    },
    channel: channels[channelIndex],
    content: `Contenido de ${title}`,
    createdAt: "2026-04-26T12:00:00.000Z",
    id,
    likeCount: 0,
    likedByViewer: false,
    replies: [],
    replyCount: 0,
    title,
  };
}

function buildRound({
  activeChannelId = null,
  currentPage = 1,
  hasNextPage = false,
  messages,
}: {
  activeChannelId?: string | null;
  currentPage?: number;
  hasNextPage?: boolean;
  messages: ReturnType<typeof buildMessage>[];
}) {
  return {
    activeChannelId,
    channels,
    messages,
    pagination: {
      currentPage,
      hasNextPage,
      hasPreviousPage: currentPage > 1,
      pageSize: 15,
    },
    viewerPermissions,
  };
}

const firstPageRound = buildRound({
  hasNextPage: true,
  messages: [buildMessage("message-1", "Anuncio inicial", 1)],
});
const rondaRound = buildRound({
  activeChannelId: "channel-ronda",
  messages: [buildMessage("message-ronda", "Ronda del viernes", 1)],
});
const introRound = buildRound({
  activeChannelId: "channel-intro",
  messages: [buildMessage("message-intro", "Presentaciones", 0)],
});
const secondPageRound = buildRound({
  currentPage: 2,
  messages: [buildMessage("message-old", "Mensaje anterior", 1)],
});

type DeferredResponse = {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
};

function createDeferredResponse(): DeferredResponse {
  let resolveResponse: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return { promise, resolve: resolveResponse };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function roundResponse(round: unknown): Response {
  return jsonResponse({ round });
}

function render(ui: ReactElement) {
  return renderComponent(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>,
  });
}

function renderRound() {
  return render(
    <TribeRound
      authenticatedMember={authenticatedMember}
      round={firstPageRound}
      tribeSlug="matematica-pro"
    />
  );
}

function requestedUrls(): string[] {
  return (global.fetch as Mock).mock.calls.map(([url]) => String(url));
}

/** Types into the rich message editor, which inserts text on key presses. */
function typeInMessageEditor(editor: HTMLElement, text: string) {
  const selection = window.getSelection();
  const range = document.createRange();

  editor.focus();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
  Array.from(text).forEach((character) => {
    fireEvent.keyDown(editor, { key: character });
  });
}

async function goBackInHistory() {
  const popState = new Promise((resolve) => {
    window.addEventListener("popstate", resolve, { once: true });
  });

  await act(async () => {
    window.history.back();
    await popState;
  });
}

describe("TribeRound in-place navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as Mock).mockReset();
    window.history.replaceState(null, "", TRIBE_PATH);
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("loads a channel chip in place and mirrors it in the URL without a server navigation", async () => {
    const user = userEvent.setup();
    (global.fetch as Mock).mockResolvedValue(roundResponse(rondaRound));
    renderRound();

    await user.click(screen.getByRole("link", { name: "Ronda" }));

    expect(await screen.findByText("Ronda del viernes")).toBeInTheDocument();
    // The replaced message leaves through the list exit animation.
    await waitFor(() => {
      expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
    });
    expect(requestedUrls()).toEqual([`${ROUND_API_PATH}?channel=ronda`]);
    expect(window.location.pathname + window.location.search).toBe(`${TRIBE_PATH}?channel=ronda`);
    expect(screen.getByRole("link", { name: "Ronda" })).toHaveAttribute("aria-current", "page");
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("loads the next page in place and keeps the active channel in the request", async () => {
    const user = userEvent.setup();
    (global.fetch as Mock).mockResolvedValue(roundResponse(secondPageRound));
    renderRound();

    await user.click(screen.getByRole("link", { name: "Siguiente" }));

    expect(await screen.findByText("Mensaje anterior")).toBeInTheDocument();
    expect(requestedUrls()).toEqual([`${ROUND_API_PATH}?page=2`]);
    expect(window.location.search).toBe("?page=2");
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", TRIBE_PATH);
    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("leaves modified clicks to the browser so the link opens in a new tab", () => {
    renderRound();
    const rondaChip = screen.getByRole("link", { name: "Ronda" });
    const preventDocumentNavigation = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("click", preventDocumentNavigation);

    fireEvent.click(rondaChip, { ctrlKey: true });

    document.removeEventListener("click", preventDocumentNavigation);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("ignores a stale response and aborts the superseded request", async () => {
    const user = userEvent.setup();
    const rondaResponse = createDeferredResponse();
    const introResponse = createDeferredResponse();
    (global.fetch as Mock)
      .mockReturnValueOnce(rondaResponse.promise)
      .mockReturnValueOnce(introResponse.promise);
    renderRound();

    await user.click(screen.getByRole("link", { name: "Ronda" }));
    await user.click(screen.getByRole("link", { name: "Intro and Goals" }));

    const [, firstRequestInit] = (global.fetch as Mock).mock.calls[0] as [string, RequestInit];
    expect(firstRequestInit.signal?.aborted).toBe(true);

    await act(async () => {
      introResponse.resolve(roundResponse(introRound));
    });
    expect(await screen.findByText("Presentaciones")).toBeInTheDocument();

    await act(async () => {
      rondaResponse.resolve(roundResponse(rondaRound));
    });

    expect(screen.queryByText("Ronda del viernes")).not.toBeInTheDocument();
    expect(screen.getByText("Presentaciones")).toBeInTheDocument();
    expect(window.location.search).toBe("?channel=intro-and-goals");
  });

  it("shows a Spanish loading state while keeping the previous messages", async () => {
    const user = userEvent.setup();
    const rondaResponse = createDeferredResponse();
    (global.fetch as Mock).mockReturnValueOnce(rondaResponse.promise);
    renderRound();

    await user.click(screen.getByRole("link", { name: "Ronda" }));

    expect(screen.getByRole("status", { name: "Cargando mensajes..." })).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    await act(async () => {
      rondaResponse.resolve(roundResponse(rondaRound));
    });

    expect(await screen.findByText("Ronda del viernes")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Cargando mensajes..." })).not.toBeInTheDocument();
  });

  it("keeps the previous page and URL on failure and retries on demand", async () => {
    const user = userEvent.setup();
    (global.fetch as Mock)
      .mockResolvedValueOnce(jsonResponse({ message: "No pudimos cargar los mensajes. Intentá de nuevo." }, 500))
      .mockResolvedValueOnce(roundResponse(rondaRound));
    renderRound();

    await user.click(screen.getByRole("link", { name: "Ronda" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar los mensajes. Intentá de nuevo."
    );
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Todos" })).toHaveClass("RoundChannelFilters__chip--active");

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Ronda del viernes")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?channel=ronda");
  });

  it("follows Back to the previous round page", async () => {
    const user = userEvent.setup();
    (global.fetch as Mock)
      .mockResolvedValueOnce(roundResponse(rondaRound))
      .mockResolvedValueOnce(roundResponse(firstPageRound));
    renderRound();

    await user.click(screen.getByRole("link", { name: "Ronda" }));
    expect(await screen.findByText("Ronda del viernes")).toBeInTheDocument();

    await goBackInHistory();

    expect(await screen.findByText("Anuncio inicial")).toBeInTheDocument();
    expect(requestedUrls()).toEqual([`${ROUND_API_PATH}?channel=ronda`, ROUND_API_PATH]);
    expect(window.location.search).toBe("");
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the composer draft when the round changes behind it", async () => {
    const user = userEvent.setup();
    (global.fetch as Mock).mockResolvedValue(roundResponse(rondaRound));
    renderRound();

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(screen.getByRole("textbox", { name: "Título del mensaje" }), "Borrador en curso");

    // Back/Forward is the only way to change the round while the modal composer is open.
    await act(async () => {
      window.history.replaceState(null, "", `${TRIBE_PATH}?channel=ronda`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(await screen.findByText("Ronda del viernes")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Crear mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toHaveValue(
      "Borrador en curso"
    );
  });

  it("closes an open thread whose message is not on the new page", async () => {
    const user = userEvent.setup();
    (global.fetch as Mock).mockResolvedValue(roundResponse(rondaRound));
    renderRound();

    await user.click(screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i }));
    expect(screen.getByRole("dialog", { name: "Mensaje" })).toBeInTheDocument();

    await act(async () => {
      window.history.replaceState(null, "", `${TRIBE_PATH}?channel=ronda`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(await screen.findByText("Ronda del viernes")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Mensaje" })).not.toBeInTheDocument();
    });
  });

  it("never writes an in-flight creation rollback into a page loaded afterwards", async () => {
    const user = userEvent.setup();
    const creationResponse = createDeferredResponse();
    (global.fetch as Mock).mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "POST" ? creationResponse.promise : Promise.resolve(roundResponse(rondaRound))
    );
    renderRound();

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(screen.getByRole("textbox", { name: "Título del mensaje" }), "Nuevo encuentro");
    typeInMessageEditor(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));
    expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Ronda" }));
    expect(await screen.findByText("Ronda del viernes")).toBeInTheDocument();

    await act(async () => {
      creationResponse.resolve(jsonResponse({ message: "No pudimos publicar el mensaje." }, 400));
    });

    // The failed creation reopens its draft but leaves the loaded page alone.
    expect(await screen.findByRole("dialog", { name: "Crear mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toHaveValue(
      "Nuevo encuentro"
    );
    await waitFor(() => {
      expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Ronda del viernes")).toBeInTheDocument();
  });
});
