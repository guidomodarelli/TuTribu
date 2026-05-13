import type { ReactElement, ReactNode } from "react";
import {
  act,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { TribeRound } from "@/components/tribe-round/tribe-round";
import { TooltipProvider } from "@/components/ui/tooltip";

const refreshMock = jest.fn();
const originalConsoleError = console.error;
const radixActWarningComponents = new Set([
  "DismissableLayer",
  "FocusScope",
  "Menu",
  "PopperContent",
  "Presence",
]);
let consoleErrorSpy: jest.SpyInstance;
let unexpectedConsoleErrors: unknown[][];

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

class ImageMock {
  complete = true;

  naturalWidth = 1;

  onerror: (() => void) | null = null;

  onload: (() => void) | null = null;

  private source = "";

  get src() {
    return this.source;
  }

  set src(nextSource: string) {
    this.source = nextSource;
    this.onload?.();
  }
}

globalThis.Image = ImageMock as unknown as typeof Image;

class FailingImagePreloadMock {
  complete = false;

  naturalWidth = 0;

  onerror: (() => void) | null = null;

  onload: (() => void) | null = null;

  private source = "";

  get src() {
    return this.source;
  }

  set src(nextSource: string) {
    this.source = nextSource;
    this.onerror?.();
  }
}

function render(ui: ReactElement) {
  return renderComponent(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <TooltipProvider>{children}</TooltipProvider>
    ),
  });
}

async function settleReactUpdates() {
  await act(async () => {
    await Promise.resolve();
  });
}

function isRadixActWarning(parameters: unknown[]) {
  return (
    typeof parameters[0] === "string" &&
    (
      (
        parameters[0].startsWith(
          "An update to %s inside a test was not wrapped in act"
        ) &&
        typeof parameters[1] === "string" &&
        radixActWarningComponents.has(parameters[1])
      ) ||
      parameters[0] ===
        "The current testing environment is not configured to support act(...)" ||
      parameters[0].startsWith("A component suspended inside an `act` scope")
    )
  );
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

const authenticatedMember = {
  id: "member-1",
  email: "grace.hopper@example.com",
  name: "Grace Hopper",
  role: "tribemate",
  avatarFallback: "GH",
  image: null,
};

const tribeChannels = [
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

const roundPagination = {
  currentPage: 1,
  hasNextPage: false,
  hasPreviousPage: false,
  pageSize: 15,
};

const createdMessage = {
  id: "message-2",
  author: {
    id: "member-1",
    name: "Grace Hopper",
    role: "tribemate" as const,
    avatarFallback: "GH",
    image: null,
  },
  channel: tribeChannels[0],
  replies: [],
  content: "Nos vemos el viernes.",
  createdAt: "2026-04-26T13:00:00.000Z",
  likedByViewer: false,
  likeCount: 0,
  title: "Nuevo encuentro",
};

const createdReply = {
  id: "reply-1",
  author: {
    id: "member-1",
    name: "Grace Hopper",
    role: "tribemate" as const,
    avatarFallback: "GH",
    image: null,
  },
  content: "Excelente clase",
  createdAt: "2026-04-26T13:05:00.000Z",
};

const existingReply = {
  ...createdReply,
  id: "reply-existing",
  content: "Respuesta anterior",
  createdAt: "2026-04-26T12:05:00.000Z",
};

const round = {
  activeChannelId: null,
  channels: tribeChannels,
  pagination: roundPagination,
  viewerPermissions: {
    canReply: true,
    canCreateMessage: true,
    canReact: true,
    canPinMessages: true,
  },
  messages: [
    {
      id: "message-1",
      author: {
        id: "leader-1",
        name: "Ada Lovelace",
        role: "leader" as const,
        avatarFallback: "AL",
        image: null,
      },
      channel: tribeChannels[1],
      replies: [],
      content: "Bienvenida a la tribu",
      createdAt: "2026-04-26T12:00:00.000Z",
      likedByViewer: false,
      likeCount: 2,
      title: "Anuncio inicial",
    },
  ],
};

const roundWithAuthorImages = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      author: {
        ...round.messages[0].author,
        image: "https://example.com/ada-lovelace.jpg",
      },
      replies: [
        {
          id: "reply-with-image",
          author: {
            id: "member-1",
            name: "Grace Hopper",
            role: "tribemate" as const,
            avatarFallback: "GH",
            image: "https://example.com/grace-hopper.jpg",
          },
          content: "Gracias por compartirlo.",
          createdAt: "2026-04-26T12:05:00.000Z",
        },
      ],
    },
  ],
};

const algebraRound = {
  activeChannelId: null,
  channels: tribeChannels,
  pagination: roundPagination,
  viewerPermissions: {
    canReply: true,
    canCreateMessage: true,
    canReact: true,
    canPinMessages: false,
  },
  messages: [
    {
      id: "message-algebra-1",
      author: {
        id: "leader-2",
        name: "Emmy Noether",
        role: "leader" as const,
        avatarFallback: "EN",
        image: null,
      },
      channel: tribeChannels[0],
      replies: [],
      content: "Ya esta disponible la guia de ejercicios.",
      createdAt: "2026-04-26T14:00:00.000Z",
      likedByViewer: false,
      likeCount: 1,
      title: "Guia de algebra",
    },
  ],
};

const longMessageContent = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi ac iaculis ex.",
  "Morbi at commodo nulla. Ut finibus vel odio at efficitur.",
  "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",
  "Maecenas in ultricies odio, eget interdum nunc. Cras facilisis est et arcu finibus.",
  "Nulla dignissim enim sit amet elit vestibulum, eu mattis dui commodo.",
  "Praesent congue, metus vel tempus facilisis, orci ante mattis nunc.",
].join(" ");

const roundWithLongMessage = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      content: longMessageContent,
      title: "Lectura larga",
    },
  ],
};

const roundWithPoll = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      poll: {
        allowMultipleVotes: false,
        id: "poll-1",
        options: [
          {
            id: "option-1",
            percentage: 0,
            selectedByViewer: false,
            text: "Álgebra",
            voteCount: 0,
          },
          {
            id: "option-2",
            percentage: 0,
            selectedByViewer: false,
            text: "Geometría",
            voteCount: 0,
          },
        ],
        question: "¿Qué tema seguimos?",
        totalVoteCount: 0,
        viewerHasVoted: false,
      },
    },
  ],
};

const paginatedRound = {
  ...round,
  activeChannelId: tribeChannels[1].id,
  pagination: {
    currentPage: 2,
    hasNextPage: true,
    hasPreviousPage: true,
    pageSize: 15,
  },
};

const lastPaginatedRound = {
  ...round,
  activeChannelId: tribeChannels[1].id,
  pagination: {
    currentPage: 3,
    hasNextPage: false,
    hasPreviousPage: true,
    pageSize: 15,
  },
};

const fullFirstPageRound = {
  ...round,
  pagination: {
    currentPage: 1,
    hasNextPage: true,
    hasPreviousPage: false,
    pageSize: 1,
  },
};

const exhaustedFullFirstPageRound = {
  ...round,
  pagination: {
    currentPage: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    pageSize: 1,
  },
};

const secondPageRound = {
  ...round,
  pagination: {
    currentPage: 2,
    hasNextPage: false,
    hasPreviousPage: true,
    pageSize: 1,
  },
};

const roundWithDeferredReplies = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      hasLoadedReplies: false,
      replies: [],
    },
  ],
};

type DeferredResponse = {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
};

function createDeferredResponse(): DeferredResponse {
  let resolveResponse: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    promise,
    resolve: resolveResponse,
  };
}

describe("TribeRound", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.Image = ImageMock as unknown as typeof Image;
    unexpectedConsoleErrors = [];
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(
      (...parameters: unknown[]) => {
        if (isRadixActWarning(parameters)) {
          return;
        }

        unexpectedConsoleErrors.push(parameters);
        originalConsoleError(...parameters);
      }
    );
    refreshMock.mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        message: "Mensaje creado.",
        tribeMessage: createdMessage,
      }),
      ok: true,
      statusText: "Created",
    });
  });

  afterEach(async () => {
    await settleReactUpdates();
    expect(unexpectedConsoleErrors).toEqual([]);
    consoleErrorSpy.mockRestore();
  });

  it("opens a centered composer modal from the collapsed composer", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    const roundSection = container.querySelector("section");

    expect(roundSection?.firstElementChild).toBe(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );
    expect(screen.getByRole("button", { name: "Compartí algo en la ronda" })).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    expect(
      screen.getByRole("dialog", { name: "Crear mensaje" })
    ).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Contenido del mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compartir" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
  });

  it("renders the timestamp under the message author name", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    const messageArticle = screen.getByText("Anuncio inicial").closest("article");

    expect(messageArticle).not.toBeNull();

    const channelBadge = (messageArticle as HTMLElement).querySelector(
      ".TribeRound__channelBadge"
    );
    const messageDate = within(messageArticle as HTMLElement).getByText("26 abr");

    const authorBlock = messageDate.closest(".TribeRound__author");

    expect(channelBadge).toHaveTextContent("🔥 Ronda");
    expect(channelBadge?.parentElement).not.toHaveTextContent("26 abr");
    expect(authorBlock).toHaveTextContent("Ada Lovelace");
    expect(authorBlock).toHaveTextContent("Líder");

    await user.hover(messageDate);

    expect(
      await screen.findAllByText((_, element) =>
        Boolean(
          element?.textContent?.startsWith("Mensaje creado: 26 abr 2026")
        )
      )
    ).not.toHaveLength(0);
  });

  it("renders the message timestamp with the relative time custom element", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    const messageArticle = screen.getByText("Anuncio inicial").closest("article");

    expect(messageArticle).not.toBeNull();

    const relativeTime = (messageArticle as HTMLElement).querySelector("relative-time");

    expect(relativeTime).not.toBeNull();
    expect(relativeTime).toHaveAttribute("datetime", round.messages[0].createdAt);
    expect(relativeTime).toHaveAttribute("no-title", "");
    expect(relativeTime).toHaveTextContent("26 abr");
  });

  it("uses author images for messages and replies when available", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithAuthorImages}
      />
    );

    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveAttribute(
      "src",
      "https://example.com/ada-lovelace.jpg"
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    expect(screen.getByRole("img", { name: "Grace Hopper" })).toHaveAttribute(
      "src",
      "https://example.com/grace-hopper.jpg"
    );
  });

  it("keeps author images mounted when avatar preloading reports an error", () => {
    globalThis.Image = FailingImagePreloadMock as unknown as typeof Image;

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithAuthorImages}
      />
    );

    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveAttribute(
      "src",
      "https://example.com/ada-lovelace.jpg"
    );
  });

  it("renders the channel with the previous year timestamp metadata", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              createdAt: "2025-04-26T12:00:00.000Z",
            },
          ],
        }}
      />
    );

    const messageArticle = screen.getByText("Anuncio inicial").closest("article");

    expect(messageArticle).not.toBeNull();
    expect(within(messageArticle as HTMLElement).getByText("abr 2025")).toBeInTheDocument();
  });

  it("submits title and content from the expanded composer", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredResponse.promise);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "Nos vemos el viernes.",
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Mensaje creado.",
          tribeMessage: createdMessage,
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    expect(toast.success).toHaveBeenCalledWith("Mensaje creado.");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
    expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();
    expect(screen.getByText("Nos vemos el viernes.")).toBeInTheDocument();
  });

  it("submits a poll draft with a new message", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Agregar encuesta" }));
    await user.type(
      screen.getByRole("textbox", { name: "Pregunta de la encuesta" }),
      "¿Qué tema seguimos?"
    );
    const optionInputs = [
      screen.getByRole("textbox", { name: "Opción 1" }),
      screen.getByRole("textbox", { name: "Opción 2" }),
    ];

    await user.type(optionInputs[0], "Álgebra");
    await user.type(optionInputs[1], "Geometría");
    await user.click(screen.getByLabelText("Permitir varias opciones"));
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "Nos vemos el viernes.",
            poll: {
              allowMultipleVotes: true,
              options: ["Álgebra", "Geometría"],
              question: "¿Qué tema seguimos?",
            },
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });
  });

  it("shows three poll option fields when composing a survey", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByLabelText("Compartí algo en la ronda"));
    await user.click(screen.getByRole("button", { name: "Agregar encuesta" }));

    expect(screen.getByLabelText("Quitar encuesta")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /Opción/ })).toHaveLength(3);
    expect(screen.getByText("Opción 1")).toBeInTheDocument();
    expect(screen.getByText("Opción 2")).toBeInTheDocument();
    expect(screen.getByText("Opción 3")).toBeInTheDocument();
  });

  it("submits a poll vote and reveals percentages with counts", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "Voto registrado.",
        poll: {
          ...roundWithPoll.messages[0].poll,
          options: [
            {
              id: "option-1",
              percentage: 100,
              selectedByViewer: true,
              text: "Álgebra",
              voteCount: 1,
            },
            {
              id: "option-2",
              percentage: 0,
              selectedByViewer: false,
              text: "Geometría",
              voteCount: 0,
            },
          ],
          totalVoteCount: 1,
          viewerHasVoted: true,
        },
      }),
      ok: true,
      statusText: "OK",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithPoll}
      />
    );

    expect(screen.getByText("0 votos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar encuesta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar encuesta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reabrir encuesta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar encuesta" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Álgebra"));
    await user.click(screen.getAllByRole("button", { name: "Votar" })[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1/poll/votes",
        expect.objectContaining({
          body: JSON.stringify({
            optionIds: ["option-1"],
          }),
          method: "POST",
        })
      );
    });
    expect(await screen.findByText("100% · 1")).toBeInTheDocument();
  });

  it("disables poll voting when the viewer cannot react", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...roundWithPoll,
          viewerPermissions: {
            ...roundWithPoll.viewerPermissions,
            canReact: false,
          },
        }}
      />
    );

    expect(screen.getByLabelText("Álgebra")).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Votar" })[0]).toBeDisabled();

    await user.click(screen.getByLabelText("Álgebra"));
    await user.click(screen.getAllByRole("button", { name: "Votar" })[0]);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits persisted poll selection when voting without changing options", async () => {
    const user = userEvent.setup();
    const roundWithPersistedPollVote = {
      ...roundWithPoll,
      messages: [
        {
          ...roundWithPoll.messages[0],
          poll: {
            ...roundWithPoll.messages[0].poll,
            options: [
              {
                id: "option-1",
                percentage: 100,
                selectedByViewer: true,
                text: "Álgebra",
                voteCount: 1,
              },
              {
                id: "option-2",
                percentage: 0,
                selectedByViewer: false,
                text: "Geometría",
                voteCount: 0,
              },
            ],
            totalVoteCount: 1,
            viewerHasVoted: true,
          },
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "Voto registrado.",
        poll: roundWithPersistedPollVote.messages[0].poll,
      }),
      ok: true,
      statusText: "OK",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithPersistedPollVote}
      />
    );

    await user.click(screen.getAllByRole("button", { name: "Votar" })[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1/poll/votes",
        expect.objectContaining({
          body: JSON.stringify({
            optionIds: ["option-1"],
          }),
          method: "POST",
        })
      );
    });
    expect(toast.warning).not.toHaveBeenCalledWith("Votar");
  });

  it("preserves persisted multiple poll selections when changing one vote", async () => {
    const user = userEvent.setup();
    const roundWithPersistedMultiplePollVotes = {
      ...roundWithPoll,
      messages: [
        {
          ...roundWithPoll.messages[0],
          poll: {
            ...roundWithPoll.messages[0].poll,
            allowMultipleVotes: true,
            options: [
              {
                id: "option-1",
                percentage: 50,
                selectedByViewer: true,
                text: "Álgebra",
                voteCount: 1,
              },
              {
                id: "option-2",
                percentage: 50,
                selectedByViewer: true,
                text: "Geometría",
                voteCount: 1,
              },
            ],
            totalVoteCount: 2,
            viewerHasVoted: true,
          },
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "Voto registrado.",
        poll: {
          ...roundWithPersistedMultiplePollVotes.messages[0].poll,
          options: [
            {
              id: "option-1",
              percentage: 0,
              selectedByViewer: false,
              text: "Álgebra",
              voteCount: 0,
            },
            {
              id: "option-2",
              percentage: 100,
              selectedByViewer: true,
              text: "Geometría",
              voteCount: 1,
            },
          ],
          totalVoteCount: 1,
          viewerHasVoted: true,
        },
      }),
      ok: true,
      statusText: "OK",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithPersistedMultiplePollVotes}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /Álgebra/ }));
    await user.click(screen.getAllByRole("button", { name: "Votar" })[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1/poll/votes",
        expect.objectContaining({
          body: JSON.stringify({
            optionIds: ["option-2"],
          }),
          method: "POST",
        })
      );
    });
  });

  it("keeps a created message out of the visible list when another channel is active", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredResponse.promise);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          activeChannelId: tribeChannels[1].id,
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "Nos vemos el viernes.",
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Mensaje creado.",
          tribeMessage: createdMessage,
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    expect(toast.success).toHaveBeenCalledWith("Mensaje creado.");
    expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
    expect(screen.queryByText("Nos vemos el viernes.")).not.toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps the visible first page within its page size when creating a message", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredResponse.promise);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={fullFirstPageRound}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Mensaje creado.",
          tribeMessage: createdMessage,
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();
    expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
    const messageList = screen.getByText("Nuevo encuentro").closest("ol");

    expect(messageList).not.toBeNull();
    expect(within(messageList as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps an exhausted first page within its page size when creating a message", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredResponse.promise);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={exhaustedFullFirstPageRound}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Mensaje creado.",
          tribeMessage: createdMessage,
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    const messageList = screen.getByText("Nuevo encuentro").closest("ol");

    expect(messageList).not.toBeNull();
    expect(within(messageList as HTMLElement).queryByText("Anuncio inicial")).not.toBeInTheDocument();
    expect(within(messageList as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
      "href",
      "/tribu/matematica-pro?page=2"
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps a created message out of later pages because the server places it on page one", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredResponse.promise);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={secondPageRound}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Mensaje creado.",
          tribeMessage: createdMessage,
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
    expect(screen.queryByText("Nos vemos el viernes.")).not.toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("selects a channel using keyboard interactions", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(
      screen.getByRole("button", { name: "Canal del mensaje" })
    ).toHaveTextContent("⭐ Intro and Goals");
  });

  it("shows visible missing item validation when submitting an incomplete message", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );

    expect(screen.getByRole("button", { name: "Compartir" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(screen.getByText("Falta completar:")).toBeInTheDocument();
    const missingRequirements = screen.getByRole("list", {
      name: "Requisitos pendientes",
    });

    expect(within(missingRequirements).getByText("Seleccionar canal")).toBeInTheDocument();
    expect(within(missingRequirements).getByRole("listitem")).toHaveTextContent(
      "-Seleccionar canal"
    );
    expect(within(missingRequirements).queryByText("Completar título")).not.toBeInTheDocument();
    expect(within(missingRequirements).queryByText("Publicar el contenido")).not.toBeInTheDocument();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lists every missing composer requirement before submitting", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    const missingRequirements = screen.getByRole("list", {
      name: "Requisitos pendientes",
    });

    expect(within(missingRequirements).getByText("Completar título")).toBeInTheDocument();
    expect(within(missingRequirements).getByText("Publicar el contenido")).toBeInTheDocument();
    expect(within(missingRequirements).getByText("Seleccionar canal")).toBeInTheDocument();
    expect(within(missingRequirements).getAllByRole("listitem")).toEqual([
      expect.objectContaining({ textContent: "-Completar título" }),
      expect.objectContaining({ textContent: "-Publicar el contenido" }),
      expect.objectContaining({ textContent: "-Seleccionar canal" }),
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("starts with a blank composer every time the modal opens", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Borrador temporal"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Contenido temporal"
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
    });

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Contenido del mensaje" })
    ).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Canal del mensaje" })
    ).toHaveTextContent("Elegir canal");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
    });
  });

  it("links channel chips to server-filtered round pages", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute(
      "href",
      "/tribu/matematica-pro"
    );
    expect(screen.getByRole("link", { name: "Ronda" })).toHaveAttribute(
      "href",
      "/tribu/matematica-pro?channel=ronda"
    );
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
  });

  it("keeps channel filters visible when the round has only one channel", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          channels: [tribeChannels[1]],
        }}
      />
    );

    expect(screen.getByRole("link", { name: "Todos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ronda" })).toBeInTheDocument();
  });

  it("renders pagination links that preserve the active channel", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={paginatedRound}
      />
    );

    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute(
      "href",
      "/tribu/matematica-pro?channel=ronda"
    );
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
      "href",
      "/tribu/matematica-pro?channel=ronda&page=3"
    );
  });

  it("renders the unavailable next page control without a navigable link", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={lastPaginatedRound}
      />
    );

    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute(
      "href",
      "/tribu/matematica-pro?channel=ronda&page=2"
    );
    expect(screen.queryByRole("link", { name: "Siguiente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("syncs local messages when the server round changes", async () => {
    const { rerender } = render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    await act(async () => {
      rerender(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="algebra-lineal"
          round={algebraRound}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Guia de algebra")).toBeInTheDocument();
    });
    expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
  });

  it("ignores a stale message response after moving to another tribe", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredResponse.promise);

    const { rerender } = render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.any(Object)
      );
    });

    rerender(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="algebra-lineal"
        round={algebraRound}
      />
    );

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Mensaje creado.",
          tribeMessage: createdMessage,
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    expect(screen.getByText("Guia de algebra")).toBeInTheDocument();
    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("updates likes optimistically and reconciles without refreshing the route", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        likedByViewer: true,
        likeCount: 3,
        message: "Reaccion actualizada.",
      }),
      ok: true,
      statusText: "OK",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    try {
      expect(screen.getByRole("button", { name: "Me gusta 2" })).not.toHaveClass(
        "TribeRound__likeButton--active"
      );
      expect(
        screen.queryByRole("dialog", { name: "Mensaje" })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Me gusta 2" }));

      expect(screen.getByRole("button", { name: "Me gusta 3" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Me gusta 3" })).toHaveClass(
        "TribeRound__likeButton--active"
      );
      expect(global.fetch).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("dialog", { name: "Mensaje" })
      ).not.toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/message-1/like",
          expect.objectContaining({
            method: "POST",
          })
        );
      });
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("renders a filled like heart when the viewer already liked the message", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              likedByViewer: true,
            },
          ],
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Me gusta 2" })).toHaveClass(
      "TribeRound__likeButton--active"
    );
  });

  it("renders the active pin toggle after the channel badge", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              isPinned: true,
              pinnedAt: "2026-04-26T13:00:00.000Z",
            },
          ],
        }}
      />
    );

    const messageArticle = screen.getByText("Anuncio inicial").closest("article");

    expect(messageArticle).not.toBeNull();

    const messageMeta = (messageArticle as HTMLElement).querySelector(
      ".TribeRound__messageMeta"
    );
    const channelBadge = within(messageMeta as HTMLElement).getByText("🔥 Ronda");
    const pinButton = within(messageMeta as HTMLElement).getByRole("button", {
      name: "Despinear mensaje",
    });

    expect(pinButton).toHaveClass("TribeRound__pinButton--active");
    expect(channelBadge.nextElementSibling).toBe(pinButton);
  });

  it("renders pinned messages with a visible indicator and toggles pin without refreshing", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        isPinned: false,
        pinnedAt: null,
        message: "Mensaje despineado.",
      }),
      ok: true,
      statusText: "OK",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              isPinned: true,
              pinnedAt: "2026-04-26T13:00:00.000Z",
            },
          ],
        }}
      />
    );

    try {
      expect(screen.getByRole("button", { name: "Despinear mensaje" })).toHaveClass(
        "TribeRound__pinButton--active"
      );

      await user.click(screen.getByRole("button", { name: "Despinear mensaje" }));

      expect(screen.getByRole("button", { name: "Pinear mensaje" })).not.toHaveClass(
        "TribeRound__pinButton--active"
      );
      expect(global.fetch).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/message-1/pin",
          expect.objectContaining({
            method: "POST",
          })
        );
      });
      expect(toast.success).toHaveBeenCalledWith("Mensaje despineado.");
      expect(screen.getByRole("button", { name: "Pinear mensaje" })).not.toHaveClass(
        "TribeRound__pinButton--active"
      );
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("hides pin actions when the viewer cannot pin messages", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          viewerPermissions: {
            ...round.viewerPermissions,
            canPinMessages: false,
          },
        }}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Pinear mensaje" })
    ).not.toBeInTheDocument();
  });

  it("renders message menu actions with a non-wrapping item class", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              permissions: {
                canDelete: true,
              },
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Acciones del mensaje" })
    );

    expect(
      screen.getByRole("menuitem", { name: "Eliminar mensaje" })
    ).toHaveClass("TribeRound__messageMenuItem");
    expect(screen.getByRole("menu")).toHaveClass("TribeRound__messageMenuContent");
  });

  it("shows a warning when the pinned message limit is reached", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "Solo podes pinear hasta 3 mensajes en el fogón.",
      }),
      ok: false,
      statusText: "Conflict",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    try {
      await user.click(screen.getByRole("button", { name: "Pinear mensaje" }));

      expect(screen.getByRole("button", { name: "Despinear mensaje" })).toHaveClass(
        "TribeRound__pinButton--active"
      );

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          "Solo podes pinear hasta 3 mensajes en el fogón."
        );
      });
      expect(screen.getByRole("button", { name: "Pinear mensaje" })).not.toHaveClass(
        "TribeRound__pinButton--active"
      );
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the last debounced pin intent and skips the request when clicks cancel out", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    try {
      await user.click(screen.getByRole("button", { name: "Pinear mensaje" }));
      expect(screen.getByRole("button", { name: "Despinear mensaje" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Despinear mensaje" })).toHaveClass(
        "TribeRound__pinButton--active"
      );

      await user.click(screen.getByRole("button", { name: "Despinear mensaje" }));
      expect(screen.getByRole("button", { name: "Pinear mensaje" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Pinear mensaje" })).not.toHaveClass(
        "TribeRound__pinButton--active"
      );

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the last debounced like intent and skips the request when clicks cancel out", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    try {
      await user.click(screen.getByRole("button", { name: "Me gusta 2" }));
      expect(screen.getByRole("button", { name: "Me gusta 3" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Me gusta 3" })).toHaveClass(
        "TribeRound__likeButton--active"
      );

      await user.click(screen.getByRole("button", { name: "Me gusta 3" }));
      expect(screen.getByRole("button", { name: "Me gusta 2" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Me gusta 2" })).not.toHaveClass(
        "TribeRound__likeButton--active"
      );

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("opens the message details dialog from the message content without nesting action buttons", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    const messageDetailsButton = screen.getByRole("button", {
      name: /Abrir mensaje: Anuncio inicial/i,
    });

    await user.click(messageDetailsButton);

    expect(
      screen.getByRole("dialog", { name: "Mensaje" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Mensaje" })
      ).not.toBeInTheDocument();
    });

    await user.click(messageDetailsButton.closest('[data-slot="card"]') as HTMLElement);

    expect(
      screen.getByRole("dialog", { name: "Mensaje" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Mensaje" })
      ).not.toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Me gusta 2" }).parentElement as HTMLElement
    );

    expect(
      screen.getByRole("dialog", { name: "Mensaje" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Mensaje" })
      ).not.toBeInTheDocument();
    });

    messageDetailsButton.focus();

    expect(messageDetailsButton).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("dialog", { name: "Mensaje" })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Mensaje" })
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Me gusta 2" }));

    expect(
      screen.queryByRole("dialog", { name: "Mensaje" })
    ).not.toBeInTheDocument();
  });

  it("keeps long message content collapsed in the round without an inline toggle", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithLongMessage}
      />
    );

    const content = screen.getByText(longMessageContent);

    expect(content).toHaveAttribute("data-expanded", "false");
    expect(content).toHaveClass("TribeRound__content--collapsed");
    expect(content).toHaveClass("TribeRound__content--roundPreview");
    expect(screen.queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
  });

  it("renders long message details in a scrollable dialog body with an expansion toggle", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithLongMessage}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Lectura larga/i })
    );

    const dialog = screen.getByRole("dialog", { name: "Mensaje" });
    const dialogBody = within(dialog).getByRole("region", {
      name: "Contenido del mensaje",
    });
    const stickyHeader = within(dialogBody).getByText("Ada Lovelace")
      .closest('[data-slot="card-header"]');

    expect(dialogBody).toHaveClass("TribeRound__messageDetailsBody");
    expect(stickyHeader).toHaveClass("TribeRound__messageDetailsHeader");

    const dialogContent = within(dialog).getByText(longMessageContent);

    expect(dialogContent).toHaveAttribute("data-expanded", "false");
    expect(dialogContent).toHaveClass("TribeRound__content--collapsed");
    expect(dialogContent).toHaveClass("TribeRound__content--detailsPreview");

    await user.click(within(dialog).getByRole("button", { name: "Ver más" }));

    expect(dialogContent).toHaveAttribute("data-expanded", "true");
    expect(dialogContent).not.toHaveClass("TribeRound__content--collapsed");
    expect(dialogContent).not.toHaveClass("TribeRound__content--detailsPreview");
    expect(within(dialog).getByRole("button", { name: "Ver menos" })).toBeInTheDocument();
  });

  it("reopens long message details collapsed after reading the full content", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithLongMessage}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Lectura larga/i })
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "Mensaje" })).getByRole(
        "button",
        { name: "Ver más" }
      )
    );

    expect(
      within(screen.getByRole("dialog", { name: "Mensaje" })).getByText(
        longMessageContent
      )
    ).toHaveAttribute("data-expanded", "true");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Mensaje" })
      ).not.toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Lectura larga/i })
    );

    expect(
      within(screen.getByRole("dialog", { name: "Mensaje" })).getByText(
        longMessageContent
      )
    ).toHaveAttribute("data-expanded", "false");
  });

  it("reverts an optimistic like when the request fails", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "No pudimos actualizar la reaccion.",
      }),
      ok: false,
      statusText: "Server Error",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    try {
      await user.click(screen.getByRole("button", { name: "Me gusta 2" }));
      expect(screen.getByRole("button", { name: "Me gusta 3" })).toBeEnabled();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar la reaccion.");
      });
      expect(screen.getByRole("button", { name: "Me gusta 2" })).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("reverts an optimistic pin when the request fails", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "No pudimos actualizar el pin.",
      }),
      ok: false,
      statusText: "Server Error",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    try {
      await user.click(screen.getByRole("button", { name: "Pinear mensaje" }));
      expect(screen.getByRole("button", { name: "Despinear mensaje" })).toHaveClass(
        "TribeRound__pinButton--active"
      );

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar el pin.");
      });
      expect(screen.getByRole("button", { name: "Pinear mensaje" })).not.toHaveClass(
        "TribeRound__pinButton--active"
      );
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("appends the returned reply without refreshing the route", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        reply: createdReply,
        message: "Respuesta creado.",
      }),
      ok: true,
      statusText: "Created",
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    expect(
      screen.queryByRole("textbox", {
        name: "Escribir una respuesta",
      })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Respuestas" })).not.toBeInTheDocument();

    const messageDetailsButton = screen.getByRole("button", {
      name: /Abrir mensaje: Anuncio inicial/i,
    });

    await user.click(messageDetailsButton);

    expect(
      screen.getByRole("dialog", { name: "Mensaje" })
    ).toBeInTheDocument();

    const replyInput = screen.getByRole("textbox", {
      name: "Escribir una respuesta",
    });
    await user.type(replyInput, "Excelente clase");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1/replies",
        expect.objectContaining({
          body: JSON.stringify({
            content: "Excelente clase",
          }),
          method: "POST",
        })
      );
    });

    const repliesSection = screen.getByRole("region", { name: "Respuestas" });
    expect(within(repliesSection).getByText("Excelente clase")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("loads replies only after opening a message detail", async () => {
    const user = userEvent.setup();
    const deferredRepliesResponse = createDeferredResponse();

    (global.fetch as jest.Mock).mockReturnValueOnce(deferredRepliesResponse.promise);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithDeferredReplies}
      />
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Excelente clase")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    expect(screen.getByText("Cargando respuestas...")).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1/replies",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    deferredRepliesResponse.resolve({
      json: async () => ({
        replies: [createdReply],
      }),
      ok: true,
      statusText: "OK",
    } as Response);

    const repliesSection = screen.getByRole("region", { name: "Respuestas" });

    expect(
      await within(repliesSection).findByText("Excelente clase")
    ).toBeInTheDocument();
  });

  it("reloads existing replies after creating a reply from a failed deferred load", async () => {
    const user = userEvent.setup();
    const failedLoadMessage = "No pudimos cargar las respuestas.";

    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            json: async () => ({
              reply: createdReply,
              message: "Respuesta creado.",
            }),
            ok: true,
            statusText: "Created",
          };
        }

        const getRepliesCalls = (global.fetch as jest.Mock).mock.calls.filter(
          ([calledUrl, calledInit]) =>
            calledUrl === "/api/tribes/matematica-pro/messages/message-1/replies" &&
            (calledInit as RequestInit | undefined)?.method !== "POST"
        );

        if (getRepliesCalls.length === 1) {
          return {
            json: async () => ({
              message: failedLoadMessage,
            }),
            ok: false,
            statusText: "Server Error",
          };
        }

        return {
          json: async () => ({
            replies: [existingReply, createdReply],
          }),
          ok: true,
          statusText: "OK",
        };
      }
    );

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithDeferredReplies}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(failedLoadMessage);
    });

    const replyInput = screen.getByRole("textbox", {
      name: "Escribir una respuesta",
    });

    await user.type(replyInput, "Excelente clase");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.filter(
          ([calledUrl, calledInit]) =>
            calledUrl ===
              "/api/tribes/matematica-pro/messages/message-1/replies" &&
            (calledInit as RequestInit | undefined)?.method !== "POST"
        )
      ).toHaveLength(2);
    });

    const repliesSection = screen.getByRole("region", { name: "Respuestas" });

    expect(
      await within(repliesSection).findByText("Respuesta anterior")
    ).toBeInTheDocument();
    expect(within(repliesSection).getByText("Excelente clase")).toBeInTheDocument();
  });

  it("preserves a created reply when the failed deferred load retry returns stale replies first", async () => {
    const user = userEvent.setup();
    const failedLoadMessage = "No pudimos cargar las respuestas.";
    const createReplyResponse = createDeferredResponse();
    let getRepliesCallCount = 0;

    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return createReplyResponse.promise;
        }

        if (url === "/api/tribes/matematica-pro/messages/message-1/replies") {
          getRepliesCallCount += 1;

          if (getRepliesCallCount === 1) {
            return {
              json: async () => ({
                message: failedLoadMessage,
              }),
              ok: false,
              statusText: "Server Error",
            };
          }

          return {
            json: async () => ({
              replies: [existingReply],
            }),
            ok: true,
            statusText: "OK",
          };
        }

        throw new Error("Unexpected request");
      }
    );

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithDeferredReplies}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(failedLoadMessage);
    });

    const replyInput = screen.getByRole("textbox", {
      name: "Escribir una respuesta",
    });

    await user.type(replyInput, "Excelente clase");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(getRepliesCallCount).toBe(2);
    });

    await act(async () => {
      createReplyResponse.resolve({
        json: async () => ({
          reply: createdReply,
          message: "Respuesta creado.",
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    const repliesSection = screen.getByRole("region", { name: "Respuestas" });

    expect(
      await within(repliesSection).findByText("Respuesta anterior")
    ).toBeInTheDocument();
    expect(within(repliesSection).getByText("Excelente clase")).toBeInTheDocument();
  });

  it("shows a reply optimistically before the create reply request resolves", async () => {
    const user = userEvent.setup();
    let resolveCreateReply: (response: Response) => void = () => {};
    const createReplyRequest = new Promise<Response>((resolve) => {
      resolveCreateReply = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValueOnce(createReplyRequest);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    const replyInput = screen.getByRole("textbox", {
      name: "Escribir una respuesta",
    });

    await user.type(replyInput, "Respuesta optimista");
    await user.keyboard("{Enter}");

    const repliesSection = screen.getByRole("region", { name: "Respuestas" });

    expect(
      within(repliesSection).getByText("Respuesta optimista")
    ).toBeInTheDocument();
    expect(replyInput).toHaveValue("");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages/message-1/replies",
      expect.objectContaining({
        body: JSON.stringify({
          content: "Respuesta optimista",
        }),
        method: "POST",
      })
    );

    resolveCreateReply({
      json: async () => ({
        reply: {
          ...createdReply,
          content: "Respuesta optimista",
        },
        message: "Respuesta creado.",
      }),
      ok: true,
      statusText: "Created",
    } as Response);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Respuesta publicada.");
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("renders an optimistic reply with the viewer tribe role without showing a member badge first", async () => {
    const user = userEvent.setup();
    let resolveCreateReply: (response: Response) => void = () => {};
    const createReplyRequest = new Promise<Response>((resolve) => {
      resolveCreateReply = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValueOnce(createReplyRequest);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              author: {
                ...round.messages[0].author,
                id: authenticatedMember.id,
                name: authenticatedMember.name,
                role: "leader" as const,
              },
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    const replyInput = screen.getByRole("textbox", {
      name: "Escribir una respuesta",
    });

    await user.type(replyInput, "Respuesta como líder");
    await user.keyboard("{Enter}");

    const repliesSection = screen.getByRole("region", { name: "Respuestas" });

    expect(
      within(repliesSection).getByText("Respuesta como líder")
    ).toBeInTheDocument();
    expect(within(repliesSection).getAllByText("Líder")).toHaveLength(1);
    expect(within(repliesSection).queryByText("Integrante")).not.toBeInTheDocument();

    resolveCreateReply({
      json: async () => ({
        reply: {
          ...createdReply,
          author: {
            ...createdReply.author,
            id: authenticatedMember.id,
            name: authenticatedMember.name,
            role: "leader" as const,
          },
          content: "Respuesta como líder",
        },
        message: "Respuesta creado.",
      }),
      ok: true,
      statusText: "Created",
    } as Response);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Respuesta publicada.");
    });
    expect(within(repliesSection).getAllByText("Líder")).toHaveLength(1);
    expect(within(repliesSection).queryByText("Integrante")).not.toBeInTheDocument();
  });

  it("removes an optimistic reply and restores the draft when the request fails", async () => {
    const user = userEvent.setup();
    let rejectCreateReply: (response: Response) => void = () => {};
    const createReplyRequest = new Promise<Response>((resolve) => {
      rejectCreateReply = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValueOnce(createReplyRequest);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    const replyInput = screen.getByRole("textbox", {
      name: "Escribir una respuesta",
    });

    await user.type(replyInput, "Respuesta fallida");
    await user.keyboard("{Enter}");

    const repliesSection = screen.getByRole("region", { name: "Respuestas" });

    expect(within(repliesSection).getByText("Respuesta fallida")).toBeInTheDocument();

    rejectCreateReply({
      json: async () => ({
        message: "No pudimos publicar la respuesta.",
      }),
      ok: false,
      statusText: "Server Error",
    } as Response);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No pudimos publicar la respuesta."
      );
    });

    expect(
      within(repliesSection).queryByText("Respuesta fallida")
    ).not.toBeInTheDocument();
    expect(replyInput).toHaveValue("Respuesta fallida");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("opens the message details dialog with keyboard interactions", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    const messageDetailsButton = screen.getByRole("button", {
      name: /Abrir mensaje: Anuncio inicial/i,
    });

    messageDetailsButton.focus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("dialog", { name: "Mensaje" })
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Respuestas" })).toBeInTheDocument();
  });

  it("describes the message details dialog for assistive technologies", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    expect(screen.getByText("Detalle del mensaje y sus respuestas.")).toBeInTheDocument();
  });
});
