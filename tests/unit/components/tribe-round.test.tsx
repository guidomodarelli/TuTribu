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
    emoji: "💬",
    id: "channel-general",
    name: "General",
    slug: "general",
    sortOrder: 20,
  },
];

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

const round = {
  activeChannelId: null,
  channels: tribeChannels,
  viewerPermissions: {
    canReply: true,
    canCreateMessage: true,
    canReact: true,
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
  viewerPermissions: {
    canReply: true,
    canCreateMessage: true,
    canReact: true,
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
      screen.getByRole("button", { name: "Escribí algo" })
    );
    expect(screen.getByRole("button", { name: "Escribí algo" })).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));

    expect(
      screen.getByRole("dialog", { name: "Crear mensaje" })
    ).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Contenido del mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "⭐ Intro and Goals" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
  });

  it("renders the channel with the timestamp metadata", async () => {
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

    const channelBadge = within(messageArticle as HTMLElement).getByText(
      (_, element) => element?.textContent === "💬 General"
    );
    const messageDate = within(messageArticle as HTMLElement).getByText("26 abr");

    expect(channelBadge.parentElement).not.toHaveTextContent("2026");
    expect(channelBadge.parentElement).toHaveTextContent("·");

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

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
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
    await user.click(screen.getByRole("button", { name: "Publicar" }));

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

  it("selects a channel using keyboard interactions", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
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

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );

    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Publicar" }));

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

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
    await user.click(screen.getByRole("button", { name: "Publicar" }));

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

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
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

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));

    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Contenido del mensaje" })
    ).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Canal del mensaje" })
    ).toHaveTextContent("Seleccionar canal");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
    });
  });

  it("filters messages by channel chips", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Intro and Goals" }));

    expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Escribí algo" }));
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
    await user.click(screen.getByRole("button", { name: "Publicar" }));

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
