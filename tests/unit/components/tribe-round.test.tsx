import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance, type Mock } from "vitest";
import type { ReactElement, ReactNode } from "react";
import {
  act,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast, TooltipProvider } from "beez-ui";

import { TribeRound } from "@/components/tribe-round/tribe-round";

import { ATTACHMENT_FILE } from "@/src/constants/attachment-files";

const refreshMock = vi.fn();
const originalConsoleError = console.error;
const radixActWarningComponents = new Set([
  "DismissableLayer",
  "FocusScope",
  "Menu",
  "PopperContent",
  "Presence",
]);
let consoleErrorSpy: MockInstance;
let unexpectedConsoleErrors: unknown[][];

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

class IntersectionObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

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

function getTextBoundary(
  rootElement: HTMLElement,
  targetOffset: number
): { node: Node; offset: number } {
  const textNodeWalker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT
  );
  let remainingOffset = targetOffset;
  let currentNode = textNodeWalker.nextNode();

  while (currentNode) {
    const currentTextLength = currentNode.textContent?.length ?? 0;

    if (remainingOffset <= currentTextLength) {
      return {
        node: currentNode,
        offset: remainingOffset,
      };
    }

    remainingOffset -= currentTextLength;
    currentNode = textNodeWalker.nextNode();
  }

  return {
    node: rootElement,
    offset: rootElement.childNodes.length,
  };
}

function selectTextRange(
  rootElement: HTMLElement,
  startOffset: number,
  endOffset: number
) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  const startBoundary = getTextBoundary(rootElement, startOffset);
  const endBoundary = getTextBoundary(rootElement, endOffset);

  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTextInMessageEditor(rootElement: HTMLElement, text: string) {
  Array.from(text).forEach((character) => {
    fireEvent.keyDown(rootElement, { key: character });
  });
}

function replaceMessageEditorText(
  rootElement: HTMLElement,
  startOffset: number,
  endOffset: number,
  text: string
) {
  rootElement.focus();
  selectTextRange(rootElement, startOffset, endOffset);
  insertTextInMessageEditor(rootElement, text);
}

function deleteNextWordInMessageEditor(
  rootElement: HTMLElement,
  cursorOffset: number
) {
  rootElement.focus();
  selectTextRange(rootElement, cursorOffset, cursorOffset);
  fireEvent.keyDown(rootElement, {
    ctrlKey: true,
    key: "Delete",
  });
}

function deletePreviousCharacterInMessageEditor(
  rootElement: HTMLElement,
  cursorOffset: number
) {
  rootElement.focus();
  selectTextRange(rootElement, cursorOffset, cursorOffset);
  fireEvent.keyDown(rootElement, { key: "Backspace" });
}

function setMessageEditorContent(rootElement: HTMLElement, text: string) {
  replaceMessageEditorText(
    rootElement,
    0,
    rootElement.textContent?.length ?? 0,
    text
  );
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

// Preserve the existing Sonner double to isolate its timers and global notification store.
vi.mock("beez-ui", async () => ({
  ...await vi.importActual<typeof import("beez-ui")>("beez-ui"),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
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
  replyCount: 0,
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
      replyCount: 0,
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

const roundWithMessageImages = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      media: [
        {
          altText: "",
          id: "message-image-1",
          kind: "image" as const,
          sortOrder: 0,
          url: "https://imagedelivery.net/account-hash/message-image-1/public",
        },
      ],
      title: "Mensaje con imagen principal",
    },
    {
      ...round.messages[0],
      id: "message-2",
      media: [
        {
          altText: "",
          id: "message-image-2",
          kind: "image" as const,
          sortOrder: 0,
          url: "https://imagedelivery.net/account-hash/message-image-2/public",
        },
      ],
      title: "Mensaje con imagen secundaria",
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
      replyCount: 0,
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
  "Suspendisse potenti. Vivamus tristique magna in nulla dictum, vitae pretium nibh laoreet placerat finibus.",
  "Donec malesuada arcu vitae dictum gravida; integer sed lacus nec orci posuere consectetur in venenatis.",
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

const roundWithMarkdownLinkMessage = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      content:
        "Sumate desde [este link](https://meet.google.com/abc-defg-hij). También https://zoom.us/j/123456789.",
      title: "Clase en vivo",
    },
  ],
};

const roundWithMarkdownHeadingMessage = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      content: "# Título interno\nTexto de la publicación",
      title: "Mensaje con marca",
    },
  ],
};

const roundWithNonLinkMarkdownMessage = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      content: "Este **énfasis** queda como texto",
      title: "Mensaje sin estilos",
    },
  ],
};

const roundWithUnsafeMarkdownMessage = {
  ...round,
  messages: [
    {
      ...round.messages[0],
      content: "No abrir [este atajo](javascript:alert('xss'))",
      title: "Link inseguro",
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
      replyCount: 1,
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
    vi.clearAllMocks();
    globalThis.Image = ImageMock as unknown as typeof Image;
    unexpectedConsoleErrors = [];
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(
      function (...parameters: unknown[]) {
        if (isRadixActWarning(parameters)) {
          return;
        }

        unexpectedConsoleErrors.push(parameters);
        originalConsoleError(...parameters);
      }
    );
    refreshMock.mockReset();
    (global.fetch as Mock).mockResolvedValue({
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

  it("renders full channel names in filters and composer menu items", async () => {
    const user = userEvent.setup();
    const longChannelName = "Intro and Goals for Advanced Algebra";

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          channels: [
            {
              ...round.channels[0],
              name: longChannelName,
            },
            ...round.channels.slice(1),
          ],
        }}
      />
    );

    expect(screen.getByRole("link", { name: longChannelName })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));

    expect(screen.getByRole("menuitem", { name: longChannelName })).toBeInTheDocument();
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
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
  });

  it("loads the first visible feed image eagerly and leaves later feed images lazy", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithMessageImages}
      />
    );

    expect(
      screen.getByRole("img", { name: "Mensaje con imagen principal" })
    ).toHaveAttribute("loading", "eager");
    expect(
      screen.getByRole("img", { name: "Mensaje con imagen secundaria" })
    ).toHaveAttribute("loading", "lazy");
  });

  it("shows only the first message media as a single feed thumbnail", () => {
    const multiImageRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              altText: "",
              id: "feed-image-first",
              kind: "image" as const,
              sortOrder: 0,
              url: "https://imagedelivery.net/account-hash/feed-image-first/public",
            },
            {
              altText: "",
              id: "feed-image-second",
              kind: "image" as const,
              sortOrder: 1,
              url: "https://imagedelivery.net/account-hash/feed-image-second/public",
            },
          ],
          title: "Mensaje con varias imagenes",
        },
      ],
    };

    const { container } = render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={multiImageRound}
      />
    );

    const feedMedia = container.querySelectorAll(".TribeRound__feedMedia");

    expect(feedMedia).toHaveLength(1);
    const feedImages = feedMedia[0].querySelectorAll("img");
    expect(feedImages).toHaveLength(1);
    expect(feedImages[0]).toHaveAttribute("alt", "Mensaje con varias imagenes");
  });

  it("shows the first message video as a single feed thumbnail with a play badge", () => {
    const videoFeedRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              externalId: "dQw4w9WgXcQ",
              id: "feed-video-first",
              kind: "video" as const,
              provider: "youtube" as const,
              sortOrder: 0,
              thumbnailUrl: null,
            },
            {
              altText: "",
              id: "feed-image-after-video",
              kind: "image" as const,
              sortOrder: 1,
              url: "https://imagedelivery.net/account-hash/feed-image-after-video/public",
            },
          ],
          title: "Mensaje con video al inicio",
        },
      ],
    };

    const { container } = render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={videoFeedRound}
      />
    );

    const feedMedia = container.querySelectorAll(".TribeRound__feedMedia");

    expect(feedMedia).toHaveLength(1);
    const thumbnails = feedMedia[0].querySelectorAll(".TribeRound__videoThumbnail");
    expect(thumbnails).toHaveLength(1);
    expect(thumbnails[0]).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
    expect(
      feedMedia[0].querySelector(".TribeRound__videoPlayBadge")
    ).not.toBeNull();
    expect(feedMedia[0].querySelectorAll("img")).toHaveLength(1);
  });

  it("shows a 'Video adjunto' fallback in the feed when the first video has no thumbnail", () => {
    const noThumbnailRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              externalId: "123456789",
              id: "feed-video-no-thumbnail",
              kind: "video" as const,
              provider: "vimeo" as const,
              sortOrder: 0,
              thumbnailUrl: null,
            },
          ],
          title: "Mensaje con video sin miniatura",
        },
      ],
    };

    const { container } = render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={noThumbnailRound}
      />
    );

    const feedMedia = container.querySelector(".TribeRound__feedMedia");

    expect(feedMedia).not.toBeNull();
    expect(
      within(feedMedia as HTMLElement).getByText("Video adjunto")
    ).toBeInTheDocument();
    expect(
      within(feedMedia as HTMLElement).queryByText("Miniatura no disponible")
    ).not.toBeInTheDocument();
    expect(
      (feedMedia as HTMLElement).querySelector(".TribeRound__videoThumbnail")
    ).toBeNull();
  });

  it("shows a thumbnail-unavailable hint in the message modal when the video has no thumbnail", async () => {
    const user = userEvent.setup();
    const noThumbnailRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              externalId: "123456789",
              id: "modal-video-no-thumbnail",
              kind: "video" as const,
              provider: "vimeo" as const,
              sortOrder: 0,
              thumbnailUrl: null,
            },
          ],
          title: "Mensaje con video sin miniatura",
        },
      ],
    };

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={noThumbnailRound}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /Abrir mensaje: Mensaje con video sin miniatura/i,
      })
    );

    const messageDetailsDialog = screen.getByRole("dialog", {
      name: "Mensaje",
    });

    expect(
      within(messageDetailsDialog).getByText("Video adjunto")
    ).toBeInTheDocument();
    expect(
      within(messageDetailsDialog).getByText("Miniatura no disponible")
    ).toBeInTheDocument();
  });

  it("shows a play hint below the modal placeholder when the video has no thumbnail", async () => {
    const user = userEvent.setup();
    const noThumbnailRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              externalId: "123456789",
              id: "modal-video-play-hint",
              kind: "video" as const,
              provider: "vimeo" as const,
              sortOrder: 0,
              thumbnailUrl: null,
            },
          ],
          title: "Mensaje con video sin miniatura",
        },
      ],
    };

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={noThumbnailRound}
      />
    );

    expect(
      screen.queryByText("Tocá para ver el video")
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Abrir mensaje: Mensaje con video sin miniatura/i,
      })
    );

    const messageDetailsDialog = screen.getByRole("dialog", {
      name: "Mensaje",
    });

    expect(
      within(messageDetailsDialog).getByText("Tocá para ver el video")
    ).toBeInTheDocument();
  });

  it("does not show the play hint in the modal when the video has a thumbnail", async () => {
    const user = userEvent.setup();
    const youtubeRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              externalId: "dQw4w9WgXcQ",
              id: "modal-video-with-thumbnail",
              kind: "video" as const,
              provider: "youtube" as const,
              sortOrder: 0,
              thumbnailUrl: null,
            },
          ],
          title: "Mensaje con video con miniatura",
        },
      ],
    };

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={youtubeRound}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /Abrir mensaje: Mensaje con video con miniatura/i,
      })
    );

    const messageDetailsDialog = screen.getByRole("dialog", {
      name: "Mensaje",
    });

    expect(
      within(messageDetailsDialog).queryByText("Tocá para ver el video")
    ).not.toBeInTheDocument();
  });

  it("opens message images in a fullscreen carousel from message details only", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...roundWithMessageImages,
          messages: [
            {
              ...roundWithMessageImages.messages[0],
              media: [
                ...(roundWithMessageImages.messages[0].media ?? []),
                {
                  altText: "",
                  id: "message-image-1b",
                  kind: "image" as const,
                  sortOrder: 1,
                  url: "https://imagedelivery.net/account-hash/message-image-1b/public",
                },
              ],
            },
          ],
        }}
      />
    );

    expect(
      screen.queryByRole("button", {
        name: "Abrir imagen 1: Mensaje con imagen principal",
      })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Abrir mensaje: Mensaje con imagen principal/i,
      })
    );

    const messageDetailsDialog = screen.getByRole("dialog", {
      name: "Mensaje",
    });

    await user.click(
      within(messageDetailsDialog).getByRole("button", {
        name: "Abrir imagen 1: Mensaje con imagen principal",
      })
    );

    const carouselDialog = screen.getByRole("dialog", {
      name: "Medios del mensaje",
    });

    expect(carouselDialog).toHaveClass(
      "TribeRound__imageCarouselDialog"
    );
    expect(within(carouselDialog).getByText("Medio 1 de 2")).toHaveClass(
      "TribeRound__srOnly"
    );
    expect(
      within(carouselDialog).getAllByRole("img", {
        name: "Mensaje con imagen principal",
      })
    ).toHaveLength(2);
    within(carouselDialog)
      .getAllByRole("img", { name: "Mensaje con imagen principal" })
      .forEach((image) => {
        expect(image).toHaveAttribute("fetchpriority", "high");
        expect(image).toHaveAttribute("loading", "eager");
      });

    const previousImageButton = within(carouselDialog).getByRole("button", {
      name: "Medio anterior",
    });
    const nextImageButton = within(carouselDialog).getByRole("button", {
      name: "Siguiente medio",
    });

    expect(previousImageButton).toBeEnabled();
    expect(nextImageButton).toBeEnabled();

    await user.click(nextImageButton);
    expect(carouselDialog).toBeInTheDocument();

    await user.click(
      within(carouselDialog).getAllByRole("img", {
        name: "Mensaje con imagen principal",
      })[0]
    );
    expect(carouselDialog).toBeInTheDocument();

    const imageCarouselProgressDot = carouselDialog.querySelector(
      ".TribeRound__imageCarouselProgressDot"
    );

    expect(imageCarouselProgressDot).not.toBeNull();

    await user.click(imageCarouselProgressDot as HTMLElement);
    expect(carouselDialog).toBeInTheDocument();

    const imageCarousel = carouselDialog.querySelector(
      ".TribeRound__imageCarousel"
    );

    expect(imageCarousel).not.toBeNull();

    await user.click(imageCarousel as HTMLElement);

    expect(
      screen.getByRole("dialog", { name: "Medios del mensaje" })
    ).toBeInTheDocument();

    await user.click(
      within(carouselDialog).getByRole("button", { name: "Cerrar" })
    );

    expect(
      screen.queryByRole("dialog", { name: "Medios del mensaje" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Mensaje" })
    ).toBeInTheDocument();
  });

  it("renders the timestamp under the message author name with the channel inline", async () => {
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

    const channelInline = (messageArticle as HTMLElement).querySelector(
      ".TribeRound__channelInline"
    );
    const messageDate = within(messageArticle as HTMLElement).getByText("26 abr");
    const messageMetaLine = messageDate.closest(".TribeRound__messageMetaLine");
    const authorBlock = messageDate.closest(".TribeRound__author");

    expect(channelInline).toHaveTextContent("🔥 Ronda");
    expect(messageMetaLine).not.toBeNull();
    expect(messageMetaLine).toContainElement(channelInline as HTMLElement);
    expect(messageMetaLine?.textContent ?? "").toContain("·");
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

  it("renders safe Markdown links in the message preview and details", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithMarkdownLinkMessage}
      />
    );

    const previewLink = screen.getByRole("link", { name: "este link" });

    expect(previewLink).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij"
    );
    expect(previewLink).toHaveAttribute("target", "_blank");
    expect(previewLink).toHaveAttribute("rel", "noreferrer");
    expect(previewLink.closest(".TribeRound__content")?.tagName).toBe("DIV");
    expect(
      screen.getByRole("link", { name: "https://zoom.us/j/123456789" })
    ).toHaveAttribute("href", "https://zoom.us/j/123456789");
    expect(screen.getByText(/También/)).toHaveTextContent(
      "También https://zoom.us/j/123456789."
    );

    await user.click(previewLink);

    expect(screen.queryByRole("dialog", { name: "Mensaje" })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Clase en vivo/i })
    );

    expect(
      within(screen.getByRole("dialog", { name: "Mensaje" })).getByRole("link", {
        name: "este link",
      })
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  });

  it("keeps email addresses as regular message text", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              content: "Escribinos a ana.maria@example.com para coordinar.",
            },
          ],
        }}
      />
    );

    expect(screen.getByText(/Escribinos a/)).toHaveTextContent(
      "Escribinos a ana.maria@example.com para coordinar."
    );
    expect(screen.queryByRole("link", { name: /example\.com/ })).not.toBeInTheDocument();
  });

  it("keeps parentheses in persisted Markdown link URLs", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              content: "Leé [doc](https://example.com/a(b)) antes del encuentro.",
            },
          ],
        }}
      />
    );

    expect(screen.getByRole("link", { name: "doc" })).toHaveAttribute(
      "href",
      "https://example.com/a(b)"
    );
  });

  it("renders protocol URLs with at signs as links", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              content: "Canal: https://youtube.com/@canal",
            },
          ],
        }}
      />
    );

    expect(
      screen.getByRole("link", { name: "https://youtube.com/@canal" })
    ).toHaveAttribute("href", "https://youtube.com/@canal");
  });

  it("keeps abbreviations like EE.UU. or China.Por as plain text without linkifying", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              content:
                "Hablamos sobre EE.UU. y China.Por eso revisamos el Nasdaq.",
            },
          ],
        }}
      />
    );

    expect(screen.queryByRole("link", { name: /EE\.UU/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /China\.Por/ })
    ).not.toBeInTheDocument();
  });

  it("auto-links bare URLs that start with www.", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              content: "Visitá www.latribu.app para mas info.",
            },
          ],
        }}
      />
    );

    expect(
      screen.getByRole("link", { name: "www.latribu.app" })
    ).toHaveAttribute("href", "https://www.latribu.app");
  });

  it("keeps Markdown headings as regular message text", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithMarkdownHeadingMessage}
      />
    );

    expect(screen.queryByRole("heading", { name: "Título interno" })).not.toBeInTheDocument();
    expect(screen.getByText(/# Título interno/)).toBeInTheDocument();
  });

  it("keeps non-link Markdown syntax as regular message text", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithNonLinkMarkdownMessage}
      />
    );

    expect(screen.queryByText("énfasis", { selector: "strong" })).not.toBeInTheDocument();
    expect(screen.getByText(/Este \*\*énfasis\*\* queda como texto/)).toBeInTheDocument();
  });

  it("does not render non-http Markdown links and keeps the original text inert", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={roundWithUnsafeMarkdownMessage}
      />
    );

    expect(screen.queryByRole("link", { name: "este atajo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /javascript/i })).not.toBeInTheDocument();
    expect(screen.getByText(/No abrir/).closest(".TribeRound__content")).toHaveTextContent(
      "No abrir [este atajo](javascript:alert('xss'))"
    );
  });

  it("applies a link inside the message editor when pasting an http URL over selected text", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Sumate al encuentro");
    selectTextRange(contentInput, 10, 19);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://meet.google.com/abc-defg-hij",
      },
    });

    expect(contentInput).toHaveTextContent("Sumate al encuentro");
    expect(
      within(contentInput).getByRole("link", { name: "encuentro" })
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  });

  it("keeps a directly pasted URL as editable text whose link follows character changes", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://meet.google.com/abc-defg-hij",
      },
    });

    expect(contentInput).toHaveTextContent("https://meet.google.com/abc-defg-hij");
    expect(
      within(contentInput).getByRole("link", {
        name: "https://meet.google.com/abc-defg-hij",
      })
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");

    replaceMessageEditorText(contentInput, 36, 36, "k");

    expect(
      within(contentInput).getByRole("link", {
        name: "https://meet.google.com/abc-defg-hijk",
      })
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hijk");
  });

  it("keeps email addresses as regular text in the message editor", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Escribinos a ana.maria@example.com");

    expect(contentInput).toHaveTextContent("Escribinos a ana.maria@example.com");
    expect(
      within(contentInput).queryByRole("link", { name: /example\.com/ })
    ).not.toBeInTheDocument();
  });

  it("keeps protocol URLs with at signs as links in the message editor", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://youtube.com/@canal",
      },
    });

    expect(
      within(contentInput).getByRole("link", {
        name: "https://youtube.com/@canal",
      })
    ).toHaveAttribute("href", "https://youtube.com/@canal");
  });

  it("keeps selected-text link targets stable when the visible text changes", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Sumate al encuentro");
    selectTextRange(contentInput, 10, 19);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://meet.google.com/abc-defg-hij",
      },
    });

    replaceMessageEditorText(contentInput, 10, 19, "reunion");

    expect(
      within(contentInput).getByRole("link", { name: "reunion" })
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
  });

  it("syncs selected-text links once visible text matches the URL without protocol", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "google.co");
    selectTextRange(contentInput, 0, 9);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://google.com",
      },
    });

    expect(
      within(contentInput).getByRole("link", { name: "google.co" })
    ).toHaveAttribute("href", "https://google.com");

    replaceMessageEditorText(contentInput, 9, 9, "m");

    expect(
      within(contentInput).getByRole("link", { name: "google.com" })
    ).toHaveAttribute("href", "https://google.com");

    replaceMessageEditorText(contentInput, 10, 10, "/docs");

    expect(
      within(contentInput).getByRole("link", { name: "google.com/docs" })
    ).toHaveAttribute("href", "https://google.com/docs");
  });

  it("keeps spaces added before or after a synced link outside the link text", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "google.com");
    selectTextRange(contentInput, 0, 10);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://google.com",
      },
    });

    replaceMessageEditorText(contentInput, 10, 10, " ");
    replaceMessageEditorText(contentInput, 0, 0, " ");

    expect(contentInput.textContent).toBe(" google.com ");
    expect(
      within(contentInput).getByRole("link", { name: "google.com" })
    ).toHaveAttribute("href", "https://google.com");

    replaceMessageEditorText(contentInput, 12, 12, "extra");

    expect(contentInput.textContent).toBe(" google.com extra");
    expect(
      within(contentInput).getByRole("link", { name: "google.com" })
    ).toHaveAttribute("href", "https://google.com");
  });

  it("keeps a link intact when deleting the separator before following text", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "curso");
    selectTextRange(contentInput, 0, 5);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://example.com/curso",
      },
    });

    replaceMessageEditorText(contentInput, 5, 5, " m");
    deletePreviousCharacterInMessageEditor(contentInput, 6);

    expect(contentInput.textContent).toBe("cursom");
    expect(
      within(contentInput).getByRole("link", { name: "curso" })
    ).toHaveAttribute("href", "https://example.com/curso");
  });

  it("keeps Ctrl Delete removals in editor state before typing again", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Sumate al encuentro hoy");
    deleteNextWordInMessageEditor(contentInput, 10);

    expect(contentInput.textContent).toBe("Sumate al  hoy");

    replaceMessageEditorText(contentInput, 10, 10, "reunion");

    expect(contentInput.textContent).toBe("Sumate al reunion hoy");
  });

  it("accepts selected bare-domain links and syncs them after the text catches up", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "google.co");
    selectTextRange(contentInput, 0, 9);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "google.com",
      },
    });

    expect(
      within(contentInput).getByRole("link", { name: "google.co" })
    ).toHaveAttribute("href", "https://google.com");

    replaceMessageEditorText(contentInput, 9, 9, "m");

    expect(
      within(contentInput).getByRole("link", { name: "google.com" })
    ).toHaveAttribute("href", "https://google.com");
  });

  it("edits and removes links from the message editor popover", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Sumate al encuentro");
    selectTextRange(contentInput, 10, 19);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://meet.google.com/abc-defg-hij",
      },
    });

    await user.click(screen.getByRole("link", { name: "encuentro" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByRole("textbox", { name: "Texto del link" }));
    await user.type(screen.getByRole("textbox", { name: "Texto del link" }), "Meet");
    await user.clear(screen.getByRole("textbox", { name: "Link" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link" }),
      "https://zoom.us/j/123456789"
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(contentInput).toHaveTextContent("Sumate al Meet");
    expect(screen.getByRole("link", { name: "Meet" })).toHaveAttribute(
      "href",
      "https://zoom.us/j/123456789"
    );

    await user.click(screen.getByRole("link", { name: "Meet" }));
    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(contentInput).toHaveTextContent("Sumate al Meet");
    expect(
      within(contentInput).queryByRole("link", { name: "Meet" })
    ).not.toBeInTheDocument();
  });

  it("keeps the current link when edited text is blank", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Sumate al encuentro");
    selectTextRange(contentInput, 10, 19);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://meet.google.com/abc-defg-hij",
      },
    });

    await user.click(screen.getByRole("link", { name: "encuentro" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByRole("textbox", { name: "Texto del link" }));
    await user.type(screen.getByRole("textbox", { name: "Texto del link" }), "   ");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(contentInput).toHaveTextContent("Sumate al encuentro");
    expect(screen.getByRole("link", { name: "encuentro" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij"
    );
  });

  it("submits editor links as Markdown while keeping the editor text readable", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Sumate al encuentro");
    selectTextRange(contentInput, 10, 19);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://meet.google.com/abc-defg-hij",
      },
    });
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content:
              "Sumate al [encuentro](https://meet.google.com/abc-defg-hij)",
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    await act(async () => {
      deferredResponse.resolve(
        {
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: createdMessage,
          }),
          ok: true,
          statusText: "Created",
        } as Response
      );
    });
  });

  it("escapes selected link text before submitting editor links", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
      "Nuevo material"
    );

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Revisá Clase [PDF]");
    selectTextRange(contentInput, 7, 18);

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://example.com/a(b)",
      },
    });
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "Revisá [Clase \\[PDF\\]](https://example.com/a(b))",
            title: "Nuevo material",
          }),
          method: "POST",
        })
      );
    });

    await act(async () => {
      deferredResponse.resolve(
        {
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: {
              ...createdMessage,
              content: "Revisá [Clase \\[PDF\\]](https://example.com/a(b))",
              title: "Nuevo material",
            },
          }),
          ok: true,
          statusText: "Created",
        } as Response
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Clase [PDF]" })).toHaveAttribute(
        "href",
        "https://example.com/a(b)"
      );
    });
  });

  it("uploads an image and submits the image asset in the message payload", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });
    const imageFile = new File(["image"], "captura.png", {
      type: "image/png",
    });

    (global.fetch as Mock).mockImplementation(
      async function (url: string) {
        if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
          return {
            json: async () => ({
              assetId: "asset-1",
              imageId: "cloudflare-image-1",
              uploadUrl: "https://upload.imagedelivery.net/direct-upload",
            }),
            ok: true,
            statusText: "Created",
          };
        }

        if (url === "https://upload.imagedelivery.net/direct-upload") {
          return {
            json: async () => ({}),
            ok: true,
            statusText: "OK",
          };
        }

        if (url === "/api/tribes/matematica-pro/messages") {
          return {
            json: async () => ({
              message: "Mensaje creado.",
              tribeMessage: {
                ...createdMessage,
                media: [
                  {
                    altText: "",
                    id: "asset-1",
                    kind: "image",
                    sortOrder: 0,
                    url: "https://imagedelivery.net/account-hash/image-1/public",
                  },
                ],
              },
            }),
            ok: true,
            statusText: "Created",
          };
        }

        throw new Error(`Unexpected fetch ${url}`);
      }
    );

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Sumate al encuentro"
    );
    await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "https://upload.imagedelivery.net/direct-upload",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "Sumate al encuentro",
            media: [{ altText: "", assetId: "asset-1", kind: "image" }],
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
  });

  it("shows loading feedback and blocks submission while an image is still uploading", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const directUploadResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return directUploadResponse.promise;
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Sumate al encuentro"
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      expect(
        screen.getByRole("status", { name: "Subiendo imagen" })
      ).toBeInTheDocument();
      expect(screen.getByText("Subiendo imagen")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      const missingRequirements = screen.getByRole("list", {
        name: "Requisitos pendientes",
      });

      expect(
        within(missingRequirements).getByText(
          "Esperá a que termine de subir la imagen."
        )
      ).toBeInTheDocument();
      expect(
        within(missingRequirements).queryByText("No pudimos subir la imagen.")
      ).not.toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({ method: "POST" })
      );
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("uploads a file attachment and submits its asset id in the message payload", async () => {
    const user = userEvent.setup();
    const attachmentFile = new File(["doc"], "guia.pdf", {
      type: "application/pdf",
    });

    (global.fetch as Mock).mockImplementation(async function (url: string) {
      if (url === "/api/tribes/matematica-pro/messages/files/uploads") {
        return {
          json: async () => ({
            assetId: "file-asset-1",
            uploadHeaders: { "x-upload-token": "upload-token-1" },
            uploadUrl: "https://uploads.example.com/file-asset-1",
          }),
          ok: true,
          statusText: "Created",
        };
      }

      if (url === "https://uploads.example.com/file-asset-1") {
        return {
          json: async () => ({}),
          ok: true,
          statusText: "OK",
        };
      }

      if (url === "/api/tribes/matematica-pro/messages") {
        return {
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: {
              ...createdMessage,
              files: [
                {
                  fileName: "guia.pdf",
                  fileSizeBytes: 3,
                  id: "file-asset-1",
                  mimeType: "application/pdf",
                  sortOrder: 0,
                },
              ],
            },
          }),
          ok: true,
          statusText: "Created",
        };
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Sumate al encuentro"
    );
    await user.upload(screen.getByLabelText("Adjuntar archivo"), attachmentFile);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "https://uploads.example.com/file-asset-1",
        expect.objectContaining({
          body: attachmentFile,
          headers: expect.objectContaining({
            "Content-Type": "application/pdf",
            "x-upload-token": "upload-token-1",
          }),
          method: "PUT",
        })
      );
    });

    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "Sumate al encuentro",
            files: [{ assetId: "file-asset-1" }],
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    expect(
      screen.getByRole("link", { name: "Descargar archivo: guia.pdf (3 B)" })
    ).toHaveAttribute(
      "href",
      "/api/tribes/matematica-pro/messages/files/file-asset-1/download"
    );
  });

  it("blocks submission while a file attachment is still uploading", async () => {
    const user = userEvent.setup();
    const directUploadResponse = createDeferredResponse();
    const attachmentFile = new File(["doc"], "guia.pdf", {
      type: "application/pdf",
    });

    (global.fetch as Mock).mockImplementation(async function (url: string) {
      if (url === "/api/tribes/matematica-pro/messages/files/uploads") {
        return {
          json: async () => ({
            assetId: "file-asset-1",
            uploadHeaders: {},
            uploadUrl: "https://uploads.example.com/file-asset-1",
          }),
          ok: true,
          statusText: "Created",
        };
      }

      if (url === "https://uploads.example.com/file-asset-1") {
        return directUploadResponse.promise;
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Título del mensaje" }),
      "Nuevo encuentro"
    );
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Sumate al encuentro"
    );
    await user.upload(screen.getByLabelText("Adjuntar archivo"), attachmentFile);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "https://uploads.example.com/file-asset-1",
        expect.objectContaining({ method: "PUT" })
      );
    });

    expect(screen.getByRole("status")).toHaveTextContent("Subiendo archivo");

    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    const missingRequirements = screen.getByRole("list", {
      name: "Requisitos pendientes",
    });

    expect(
      within(missingRequirements).getByText(
        "Esperá a que termine de subir el archivo."
      )
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages",
      expect.objectContaining({ method: "POST" })
    );
    expect(toast.error).not.toHaveBeenCalled();

    await act(async () => {
      directUploadResponse.resolve({
        json: async () => ({}),
        ok: true,
        statusText: "OK",
      } as Response);
    });
  });

  it("rejects disallowed and oversized files with a toast before uploading", async () => {
    // `applyAccept: false` lets the test hand the input a file the picker
    // filter would normally exclude, exercising the client-side validation.
    const user = userEvent.setup({ applyAccept: false });
    const executableFile = new File(["binary"], "instalador.exe", {
      type: "application/x-msdownload",
    });
    const oversizedFile = new File(["pdf"], "manual.pdf", {
      type: "application/pdf",
    });

    Object.defineProperty(oversizedFile, "size", {
      configurable: true,
      value: ATTACHMENT_FILE.maxFileSizeBytes + 1,
    });

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );
    await user.upload(
      screen.getByLabelText("Adjuntar archivo"),
      executableFile
    );

    expect(toast.error).toHaveBeenCalledWith(
      "Ese tipo de archivo no está permitido."
    );

    await user.upload(screen.getByLabelText("Adjuntar archivo"), oversizedFile);

    expect(toast.error).toHaveBeenCalledWith("El archivo supera los 25 MB.");
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages/files/uploads",
      expect.anything()
    );
  });

  it("retries a failed file upload with a fresh draft asset", async () => {
    const user = userEvent.setup();
    let uploadReservationCount = 0;
    const attachmentFile = new File(["doc"], "guia.pdf", {
      type: "application/pdf",
    });

    (global.fetch as Mock).mockImplementation(
      async function (url: string, init?: RequestInit) {
        if (url === "/api/tribes/matematica-pro/messages/files/uploads") {
          uploadReservationCount += 1;
          return {
            json: async () => ({
              assetId: `file-asset-${uploadReservationCount}`,
              uploadHeaders: {},
              uploadUrl: `https://uploads.example.com/file-asset-${uploadReservationCount}`,
            }),
            ok: true,
            statusText: "Created",
          };
        }

        if (url === "https://uploads.example.com/file-asset-1") {
          return {
            json: async () => ({}),
            ok: false,
            statusText: "Forbidden",
          };
        }

        if (url === "https://uploads.example.com/file-asset-2") {
          return {
            json: async () => ({}),
            ok: true,
            statusText: "OK",
          };
        }

        if (
          url === "/api/tribes/matematica-pro/messages/files/file-asset-1" &&
          init?.method === "DELETE"
        ) {
          return {
            json: async () => ({}),
            ok: true,
            statusText: "OK",
          };
        }

        throw new Error(`Unexpected fetch ${url}`);
      }
    );

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );
    await user.upload(screen.getByLabelText("Adjuntar archivo"), attachmentFile);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("No pudimos subir el archivo.");
    });
    expect(screen.getByText("No pudimos subir el archivo.")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Reintentar subida" })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "https://uploads.example.com/file-asset-2",
        expect.objectContaining({ method: "PUT" })
      );
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/files/file-asset-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByText("No pudimos subir el archivo.")
      ).not.toBeInTheDocument();
    });
  });

  it("renders message attachments as download links with name and size", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              files: [
                {
                  fileName: "guia-algebra.pdf",
                  fileSizeBytes: 1536,
                  id: "persisted-file-1",
                  mimeType: "application/pdf",
                  sortOrder: 0,
                },
              ],
            },
          ],
        }}
      />
    );

    const attachmentList = screen.getByRole("list", {
      name: "Archivos adjuntos",
    });
    const downloadLink = within(attachmentList).getByRole("link", {
      name: "Descargar archivo: guia-algebra.pdf (1,5 KB)",
    });

    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/tribes/matematica-pro/messages/files/persisted-file-1/download"
    );
    expect(downloadLink).toHaveTextContent("guia-algebra.pdf");
    expect(downloadLink).toHaveTextContent("1,5 KB");
  });

  it("omits the files field when editing without touching attachments", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockImplementation(async function (url: string) {
      if (url === "/api/tribes/matematica-pro/messages/message-1") {
        return {
          json: async () => ({
            content: "Bienvenida a la tribu",
            message: "Mensaje actualizado.",
            messageId: "message-1",
            title: "Anuncio inicial",
          }),
          ok: true,
          statusText: "OK",
        };
      }

      throw new Error(`Unexpected fetch ${url}`);
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
              files: [
                {
                  fileName: "guia-algebra.pdf",
                  fileSizeBytes: 1536,
                  id: "persisted-file-1",
                  mimeType: "application/pdf",
                  sortOrder: 0,
                },
              ],
              permissions: {
                canDelete: false,
                canEdit: true,
              },
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Acciones del mensaje" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar mensaje" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1",
        expect.objectContaining({
          body: JSON.stringify({
            content: "Bienvenida a la tribu",
            media: [],
            title: "Anuncio inicial",
          }),
          method: "PATCH",
        })
      );
    });
  });

  it("sends the updated files list after removing an attachment while editing", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockImplementation(async function (url: string) {
      if (url === "/api/tribes/matematica-pro/messages/message-1") {
        return {
          json: async () => ({
            content: "Bienvenida a la tribu",
            files: [],
            message: "Mensaje actualizado.",
            messageId: "message-1",
            title: "Anuncio inicial",
          }),
          ok: true,
          statusText: "OK",
        };
      }

      throw new Error(`Unexpected fetch ${url}`);
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
              files: [
                {
                  fileName: "guia-algebra.pdf",
                  fileSizeBytes: 1536,
                  id: "persisted-file-1",
                  mimeType: "application/pdf",
                  sortOrder: 0,
                },
              ],
              permissions: {
                canDelete: false,
                canEdit: true,
              },
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Acciones del mensaje" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar mensaje" }));
    await user.click(screen.getByRole("button", { name: "Quitar archivo" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1",
        expect.objectContaining({
          body: JSON.stringify({
            content: "Bienvenida a la tribu",
            files: [],
            media: [],
            title: "Anuncio inicial",
          }),
          method: "PATCH",
        })
      );
    });
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages/files/persisted-file-1",
      expect.objectContaining({ method: "DELETE" })
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("link", {
          name: "Descargar archivo: guia-algebra.pdf (1,5 KB)",
        })
      ).not.toBeInTheDocument();
    });
  });

  it("shows a new message optimistically before the create message request resolves", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();
    expect(screen.getByText("Nos vemos el viernes.")).toBeInTheDocument();

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "Mensaje creado.",
          tribeMessage: {
            ...createdMessage,
            title: "Mensaje confirmado",
          },
        }),
        ok: true,
        statusText: "Created",
      } as Response);
    });

    await waitFor(() => {
      expect(screen.getByText("Mensaje confirmado")).toBeInTheDocument();
    });
    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
  });

  it("keeps pending optimistic message actions disabled before creation resolves", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    const optimisticMessageArticle = screen
      .getByText("Nuevo encuentro")
      .closest("article");

    expect(optimisticMessageArticle).not.toBeNull();
    expect(
      within(optimisticMessageArticle as HTMLElement).getByRole("button", {
        name: "Me gusta 0",
      })
    ).toBeDisabled();
    expect(
      within(optimisticMessageArticle as HTMLElement).getByRole("button", {
        name: "Pinear mensaje",
      })
    ).toBeDisabled();
    expect(
      within(optimisticMessageArticle as HTMLElement).queryByRole("button", {
        name: "Acciones del mensaje",
      })
    ).not.toBeInTheDocument();
  });

  it("preserves concurrent message interactions when optimistic creation fails", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    try {
      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Nos vemos el viernes."
      );
      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(await screen.findByRole("button", { name: "Compartir" }));

      expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();

      await user.click(await screen.findByRole("button", { name: "Me gusta 2" }));

      expect(screen.getByRole("button", { name: "Me gusta 3" })).toBeInTheDocument();

      await act(async () => {
        deferredResponse.resolve({
          json: async () => ({
            message: "No pudimos publicar el mensaje.",
          }),
          ok: false,
          statusText: "Bad Request",
        } as Response);
      });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { hidden: true, name: "Me gusta 3" })
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores a displaced visible message when optimistic creation fails on a full page", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();
    expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();

    await act(async () => {
      deferredResponse.resolve({
        json: async () => ({
          message: "No pudimos publicar el mensaje.",
        }),
        ok: false,
        statusText: "Bad Request",
      } as Response);
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
  });

  it("shows uploaded image previews optimistically while creating a message", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const messageCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages") {
            return messageCreationResponse.promise;
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Sumate al encuentro"
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Nuevo encuentro" })).toHaveAttribute(
        "src",
        "blob:message-image"
      );
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/images/asset-1",
        expect.objectContaining({ method: "DELETE" })
      );

      await act(async () => {
        messageCreationResponse.resolve({
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: {
              ...createdMessage,
              media: [
                {
                  altText: "",
                  id: "asset-1",
                  kind: "image",
                  sortOrder: 0,
                  url: "https://imagedelivery.net/account-hash/image-1/public",
                },
              ],
            },
          }),
          ok: true,
          statusText: "Created",
        } as Response);
      });
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("keeps optimistic image previews when the created message response has no images yet", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const messageCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages") {
            return messageCreationResponse.promise;
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Sumate al encuentro"
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      expect(screen.getByRole("img", { name: "Nuevo encuentro" })).toHaveAttribute(
        "src",
        "blob:message-image"
      );

      await act(async () => {
        messageCreationResponse.resolve({
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: {
              ...createdMessage,
              media: [],
            },
          }),
          ok: true,
          statusText: "Created",
        } as Response);
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Mensaje creado.");
      });
      expect(screen.getByRole("img", { name: "Nuevo encuentro" })).toHaveAttribute(
        "src",
        "blob:message-image"
      );
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("reopens the message draft without images when optimistic message creation fails", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const messageCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string, init?: RequestInit) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages") {
            return messageCreationResponse.promise;
          }

          if (
            url === "/api/tribes/matematica-pro/messages/images/asset-1" &&
            init?.method === "DELETE"
          ) {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Sumate al encuentro"
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();

      await act(async () => {
        messageCreationResponse.resolve({
          json: async () => ({
            message: "No pudimos publicar el mensaje.",
          }),
          ok: false,
          statusText: "Bad Request",
        } as Response);
      });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toHaveValue(
        "Nuevo encuentro"
      );
      expect(
        screen.getByRole("textbox", { name: "Contenido del mensaje" })
      ).toHaveTextContent("Sumate al encuentro");
      expect(screen.getByRole("button", { name: "Canal del mensaje" })).toHaveTextContent(
        "⭐ Intro and Goals"
      );
      expect(
        screen.queryByRole("img", { name: "Descripción de la imagen" })
      ).not.toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("No pudimos publicar el mensaje.");
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/images/asset-1",
        expect.objectContaining({ method: "DELETE" })
      );
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("deletes uploaded image drafts when obsolete optimistic creation fails", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const messageCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string, init?: RequestInit) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages") {
            return messageCreationResponse.promise;
          }

          if (
            url === "/api/tribes/matematica-pro/messages/images/asset-1" &&
            init?.method === "DELETE"
          ) {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      const { unmount } = render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Sumate al encuentro"
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages",
          expect.objectContaining({ method: "POST" })
        );
      });

      unmount();

      await act(async () => {
        messageCreationResponse.resolve({
          json: async () => ({
            message: "No pudimos publicar el mensaje.",
          }),
          ok: false,
          statusText: "Bad Request",
        } as Response);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/asset-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("keeps submitted image drafts while message creation is pending during unmount", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const revokeObjectUrl = vi.fn();
    const messageCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages") {
            return messageCreationResponse.promise;
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      const { unmount } = render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Sumate al encuentro"
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages",
          expect.objectContaining({ method: "POST" })
        );
      });

      unmount();

      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:message-image");
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/images/asset-1",
        expect.objectContaining({ method: "DELETE" })
      );

      await act(async () => {
        messageCreationResponse.resolve({
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: {
              ...createdMessage,
              media: [
                {
                  altText: "",
                  id: "asset-1",
                  kind: "image",
                  sortOrder: 0,
                  url: "https://imagedelivery.net/account-hash/image-1/public",
                },
              ],
            },
          }),
          ok: true,
          statusText: "Created",
        } as Response);
      });

      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/images/asset-1",
        expect.objectContaining({ method: "DELETE" })
      );
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }
  });

  it("keeps submitted image drafts while optimistic message creation is pending", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const messageCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages") {
            return messageCreationResponse.promise;
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Nuevo encuentro"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Sumate al encuentro"
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages",
          expect.objectContaining({ method: "POST" })
        );
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("Nuevo encuentro")).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/images/asset-1",
        expect.objectContaining({ method: "DELETE" })
      );

      await act(async () => {
        messageCreationResponse.resolve({
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: {
              ...createdMessage,
              media: [
                {
                  altText: "",
                  id: "asset-1",
                  kind: "image",
                  sortOrder: 0,
                  url: "https://imagedelivery.net/account-hash/image-1/public",
                },
              ],
            },
          }),
          ok: true,
          statusText: "Created",
        } as Response);
      });

      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/images/asset-1",
        expect.objectContaining({ method: "DELETE" })
      );
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("keeps submitted image drafts when an edit dialog closes while the request is pending", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const messageUpdateResponse = createDeferredResponse();
    let deleteRequestCount = 0;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string, init?: RequestInit) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (
            url === "/api/tribes/matematica-pro/messages/images/asset-1" &&
            init?.method === "DELETE"
          ) {
            deleteRequestCount += 1;

            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages/message-1") {
            return messageUpdateResponse.promise;
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

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
                  canDelete: false,
                  canEdit: true,
                },
              },
            ],
          }}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Acciones del mensaje" })
      );
      await user.click(screen.getByRole("menuitem", { name: "Editar mensaje" }));
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/message-1",
          expect.objectContaining({
            body: JSON.stringify({
              content: "Bienvenida a la tribu",
              media: [{ altText: "", assetId: "asset-1", kind: "image" }],
              title: "Anuncio inicial",
            }),
            method: "PATCH",
          })
        );
      });

      await user.keyboard("{Escape}");

      expect(deleteRequestCount).toBe(0);

      await act(async () => {
        messageUpdateResponse.resolve({
          json: async () => ({
            content: "Bienvenida a la tribu",
            media: [
              {
                altText: "",
                id: "asset-1",
                kind: "image",
                sortOrder: 0,
                url: "https://imagedelivery.net/account-hash/image-1/public",
              },
            ],
            message: "Mensaje actualizado.",
            title: "Anuncio inicial",
          }),
          ok: true,
          statusText: "OK",
        } as Response);
      });

      expect(deleteRequestCount).toBe(0);
      expect(toast.success).toHaveBeenCalledWith("Mensaje actualizado.");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("deletes newly uploaded image drafts when editing a message fails", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const messageUpdateResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string, init?: RequestInit) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (
            url === "/api/tribes/matematica-pro/messages/images/asset-1" &&
            init?.method === "DELETE"
          ) {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages/message-1") {
            return messageUpdateResponse.promise;
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={{
            ...round,
            messages: [
              {
                ...round.messages[0],
                media: [
                  {
                    altText: "Adjunto existente",
                    id: "persisted-asset-1",
                    kind: "image" as const,
                    sortOrder: 0,
                    url: "https://imagedelivery.net/account-hash/existing/public",
                  },
                ],
                permissions: {
                  canDelete: false,
                  canEdit: true,
                },
              },
            ],
          }}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Acciones del mensaje" })
      );
      await user.click(screen.getByRole("menuitem", { name: "Editar mensaje" }));
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/message-1",
          expect.objectContaining({
            body: JSON.stringify({
              content: "Bienvenida a la tribu",
              media: [
                {
                  altText: "Adjunto existente",
                  assetId: "persisted-asset-1",
                  kind: "image",
                },
                { altText: "", assetId: "asset-1", kind: "image" },
              ],
              title: "Anuncio inicial",
            }),
            method: "PATCH",
          })
        );
      });

      await act(async () => {
        messageUpdateResponse.resolve({
          json: async () => ({
            message: "No pudimos actualizar el mensaje.",
          }),
          ok: false,
          statusText: "Bad Request",
        } as Response);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/asset-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
      expect(global.fetch).not.toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/images/persisted-asset-1",
        expect.objectContaining({ method: "DELETE" })
      );
      expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar el mensaje.");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("deletes uploaded image drafts when the composer is cancelled", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const revokeObjectUrl = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages/images/asset-1") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/asset-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:message-image");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }
  });

  it("deletes uploaded image drafts when the component unmounts", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const revokeObjectUrl = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages/images/asset-1") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      const { unmount } = render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      unmount();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/asset-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:message-image");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }
  });

  it("deletes an image draft created after the composer was cancelled", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const uploadCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return uploadCreationResponse.promise;
          }

          if (url === "/api/tribes/matematica-pro/messages/images/asset-1") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/uploads",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      await act(async () => {
        uploadCreationResponse.resolve({
          json: async () => ({
            assetId: "asset-1",
            imageId: "cloudflare-image-1",
            uploadUrl: "https://upload.imagedelivery.net/direct-upload",
          }),
          ok: true,
          statusText: "Created",
        } as Response);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/asset-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
      expect(global.fetch).not.toHaveBeenCalledWith(
        "https://upload.imagedelivery.net/direct-upload",
        expect.anything()
      );
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("retries image draft cleanup when the first delete fails before upload completion", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const directUploadResponse = createDeferredResponse();
    let deleteRequestCount = 0;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return directUploadResponse.promise;
          }

          if (url === "/api/tribes/matematica-pro/messages/images/asset-1") {
            deleteRequestCount += 1;

            return {
              json: async () => ({}),
              ok: deleteRequestCount > 1,
              statusText: "Delete Failed",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Cancelar" }));

      await waitFor(() => {
        expect(deleteRequestCount).toBe(1);
      });

      await act(async () => {
        directUploadResponse.resolve({
          json: async () => ({}),
          ok: true,
          statusText: "OK",
        } as Response);
      });

      await waitFor(() => {
        expect(deleteRequestCount).toBe(2);
      });
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("deletes an image draft created after the draft was removed", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const uploadCreationResponse = createDeferredResponse();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return uploadCreationResponse.promise;
          }

          if (url === "/api/tribes/matematica-pro/messages/images/asset-1") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/uploads",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Quitar imagen" }));

      await act(async () => {
        uploadCreationResponse.resolve({
          json: async () => ({
            assetId: "asset-1",
            imageId: "cloudflare-image-1",
            uploadUrl: "https://upload.imagedelivery.net/direct-upload",
          }),
          ok: true,
          statusText: "Created",
        } as Response);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/asset-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
      expect(global.fetch).not.toHaveBeenCalledWith(
        "https://upload.imagedelivery.net/direct-upload",
        expect.anything()
      );
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("keeps the image asset available for cleanup when the direct upload fails", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const revokeObjectUrl = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    try {
      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      (global.fetch as Mock).mockImplementation(
        async function (url: string) {
          if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
            return {
              json: async () => ({
                assetId: "asset-1",
                imageId: "cloudflare-image-1",
                uploadUrl: "https://upload.imagedelivery.net/direct-upload",
              }),
              ok: true,
              statusText: "Created",
            };
          }

          if (url === "https://upload.imagedelivery.net/direct-upload") {
            return {
              json: async () => ({}),
              ok: false,
              statusText: "Upload Failed",
            };
          }

          if (url === "/api/tribes/matematica-pro/messages/images/asset-1") {
            return {
              json: async () => ({}),
              ok: true,
              statusText: "OK",
            };
          }

          throw new Error(`Unexpected fetch ${url}`);
        }
      );

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("No pudimos subir la imagen.");
      });

      await user.click(screen.getByRole("button", { name: "Quitar imagen" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages/images/asset-1",
          expect.objectContaining({ method: "DELETE" })
        );
      });
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:message-image");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }
  });

  it("preserves removed automatic links when submitting editor content", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://zoom.us/j/123456789",
      },
    });
    await user.click(
      within(contentInput).getByRole("link", {
        name: "https://zoom.us/j/123456789",
      })
    );
    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(
      within(contentInput).queryByRole("link", {
        name: "https://zoom.us/j/123456789",
      })
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "[https://zoom.us/j/123456789](#)",
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    await act(async () => {
      deferredResponse.resolve(
        {
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: createdMessage,
          }),
          ok: true,
          statusText: "Created",
        } as Response
      );
    });
  });

  it("preserves removed explicit links when visible text is also a URL", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "https://zoom.us/j/123456789");
    selectTextRange(contentInput, 0, 29);
    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://example.com/reunion",
      },
    });

    await user.click(
      within(contentInput).getByRole("link", {
        name: "https://zoom.us/j/123456789",
      })
    );
    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(
      within(contentInput).queryByRole("link", {
        name: "https://zoom.us/j/123456789",
      })
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "[https://zoom.us/j/123456789](#)",
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    await act(async () => {
      deferredResponse.resolve(
        {
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: createdMessage,
          }),
          ok: true,
          statusText: "Created",
        } as Response
      );
    });
  });

  it("preserves removed automatic links after reopening the message editor", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        content: "[https://zoom.us/j/123456789](#)",
        message: "Mensaje actualizado.",
        title: "Nuevo encuentro",
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
              content: "[https://zoom.us/j/123456789](#)",
              permissions: {
                canDelete: false,
                canEdit: true,
              },
              title: "Nuevo encuentro",
            },
          ],
        }}
      />
    );

    expect(
      screen.queryByRole("link", { name: "https://zoom.us/j/123456789" })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Acciones del mensaje" })
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar mensaje" }));

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    expect(contentInput).toHaveTextContent("https://zoom.us/j/123456789");
    expect(
      within(contentInput).queryByRole("link", {
        name: "https://zoom.us/j/123456789",
      })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1",
        expect.objectContaining({
          body: JSON.stringify({
            content: "[https://zoom.us/j/123456789](#)",
            media: [],
            title: "Nuevo encuentro",
          }),
          method: "PATCH",
        })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Mensaje actualizado.");
    });
  });

  it("keeps later editor link ranges after changing the first link text", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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

    const contentInput = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });

    setMessageEditorContent(contentInput, "Curso uno y curso dos");
    selectTextRange(contentInput, 0, 5);
    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://example.com/curso",
      },
    });
    selectTextRange(contentInput, 12, 21);
    fireEvent.paste(contentInput, {
      clipboardData: {
        getData: () => "https://example.com/segundo",
      },
    });

    await user.click(within(contentInput).getByRole("link", { name: "Curso" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.clear(screen.getByRole("textbox", { name: "Texto del link" }));
    await user.type(
      screen.getByRole("textbox", { name: "Texto del link" }),
      "Curso avanzado"
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      within(contentInput).getByRole("link", { name: "curso dos" })
    ).toHaveAttribute("href", "https://example.com/segundo");

    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content:
              "[Curso avanzado](https://example.com/curso) uno y [curso dos](https://example.com/segundo)",
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });

    await act(async () => {
      deferredResponse.resolve(
        {
          json: async () => ({
            message: "Mensaje creado.",
            tribeMessage: createdMessage,
          }),
          ok: true,
          statusText: "Created",
        } as Response
      );
    });
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

    // jsdom does not load native images; the real primitive reveals them after load.
    fireEvent.load(screen.getByAltText("Ada Lovelace"));
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveAttribute(
      "src",
      "https://example.com/ada-lovelace.jpg"
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    fireEvent.load(screen.getByAltText("Grace Hopper"));
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

    const authorImage = screen.getByAltText("Ada Lovelace");
    expect(authorImage).toHaveAttribute(
      "src",
      "https://example.com/ada-lovelace.jpg"
    );
    fireEvent.load(authorImage);
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toBeInTheDocument();
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

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Agregar encuesta" }));
    const optionInputs = [
      screen.getByRole("textbox", { name: "Opción 1" }),
      screen.getByRole("textbox", { name: "Opción 2" }),
    ];

    await user.type(optionInputs[0], "Álgebra");
    await user.type(optionInputs[1], "Geometría");
    await user.click(screen.getByLabelText("Voto múltiple"));
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
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
            },
            title: "Nuevo encuentro",
          }),
          method: "POST",
        })
      );
    });
  });

  it("shows duplicate poll option validation before submitting a message", async () => {
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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Agregar encuesta" }));
    await user.type(screen.getByRole("textbox", { name: "Opción 1" }), "Álgebra");
    await user.type(screen.getByRole("textbox", { name: "Opción 2" }), "álgebra");
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    const missingRequirements = screen.getByRole("list", {
      name: "Requisitos pendientes",
    });

    expect(
      within(missingRequirements).getByText("Usar opciones distintas")
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows two poll option fields by default when composing a survey", async () => {
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
    expect(
      screen.queryByRole("textbox", { name: "Pregunta de la encuesta" })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /Opción/ })).toHaveLength(2);
    expect(screen.queryByText("Opción 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Opción 2")).not.toBeInTheDocument();
  });

  it("submits a poll vote and reveals percentages with counts", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
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

    expect(screen.getByText("Votación")).toBeInTheDocument();
    expect(screen.getByText("0 votos")).toBeInTheDocument();
    expect(screen.queryByLabelText("Álgebra")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    expect(
      within(screen.getByRole("dialog", { name: "Mensaje" })).getByText("0 votos")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar encuesta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar encuesta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reabrir encuesta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar encuesta" })).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Votar" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Álgebra"));

    expect(await screen.findByText("100% · 1")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog", { name: "Mensaje" })).getByText("1 voto")
    ).toBeInTheDocument();

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

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    expect(screen.getByLabelText("Álgebra")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Votar" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Álgebra"));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not submit when a multiple-choice poll selection becomes empty", async () => {
    const user = userEvent.setup();
    const roundWithPersistedPollVote = {
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

    (global.fetch as Mock).mockResolvedValueOnce({
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

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    await user.click(screen.getByRole("checkbox", { name: /Álgebra/ }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("Votar");
    });
    expect(global.fetch).not.toHaveBeenCalled();
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

    (global.fetch as Mock).mockResolvedValueOnce({
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

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    await user.click(screen.getByRole("checkbox", { name: /Álgebra/ }));

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

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
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

  it("keeps the composer open while creating a message outside the active channel", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(screen.getByRole("dialog", { name: "Crear mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toHaveValue(
      "Nuevo encuentro"
    );
    expect(screen.getByRole("button", { name: "Compartir" })).toBeDisabled();
    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();

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

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Crear mensaje" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Nuevo encuentro")).not.toBeInTheDocument();
    expect(screen.getByText("Anuncio inicial")).toBeInTheDocument();
  });

  it("keeps the visible first page within its page size when creating a message", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
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

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
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
      "/matematica-pro?page=2"
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps a created message out of later pages because the server places it on page one", async () => {
    const user = userEvent.setup();
    const deferredResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
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
    setMessageEditorContent(
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

  it("marks every missing composer field as invalid before submitting", async () => {
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

    const titleInput = screen.getByRole("textbox", {
      name: "Título del mensaje",
    });
    const contentEditor = screen.getByRole("textbox", {
      name: "Contenido del mensaje",
    });
    const channelTrigger = screen.getByRole("button", {
      name: "Canal del mensaje",
    });

    expect(titleInput).toHaveAttribute("aria-invalid", "true");
    expect(titleInput).toHaveClass("TribeRound__titleInput--invalid");
    expect(contentEditor).toHaveAttribute("aria-invalid", "true");
    expect(contentEditor).toHaveClass("RichLinkEditor__editor--invalid");
    expect(channelTrigger).toHaveAttribute("aria-invalid", "true");
    expect(channelTrigger).toHaveClass("TribeRound__channelTrigger--invalid");
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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Contenido temporal"
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
    });

    await user.click(screen.getByRole("button", { name: "Compartí algo en la ronda" }));

    expect(screen.getByRole("textbox", { name: "Título del mensaje" })).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Contenido del mensaje" })
    ).toHaveTextContent("");
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
      "/matematica-pro"
    );
    expect(screen.getByRole("link", { name: "Ronda" })).toHaveAttribute(
      "href",
      "/matematica-pro?channel=ronda"
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
      "/matematica-pro?channel=ronda"
    );
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
      "href",
      "/matematica-pro?channel=ronda&page=3"
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
      "/matematica-pro?channel=ronda&page=2"
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

    (global.fetch as Mock).mockReturnValueOnce(deferredResponse.promise);

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
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Nos vemos el viernes."
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
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
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    (global.fetch as Mock).mockResolvedValueOnce({
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
        vi.advanceTimersByTime(300);
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
      vi.useRealTimers();
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

  it("renders a comments action with the current reply count", async () => {
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
              replies: [],
              replyAuthorsPreview: [
                {
                  avatarFallback: "GH",
                  id: "member-1",
                  image: "https://example.com/grace.png",
                  name: "Grace Hopper",
                  role: "tribemate",
                },
                {
                  avatarFallback: "KJ",
                  id: "member-2",
                  image: null,
                  name: "Katherine Johnson",
                  role: "tribemate",
                },
              ],
              replyCount: 2,
            },
          ],
        }}
      />
    );

    const commentButton = screen.getByRole("button", { name: "Comentarios 2" });

    expect(commentButton).toHaveClass("TribeRound__commentButton");
    expect(
      screen.getByRole("group", {
        name: "Comentaron Grace Hopper, Katherine Johnson",
      })
    ).toHaveClass("TribeRound__commentAuthors");
    expect(screen.getByAltText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("KJ")).toBeInTheDocument();

    await user.click(commentButton);

    const dialog = await screen.findByRole("dialog", { name: "Mensaje" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Comentarios 2" })).toHaveClass(
      "TribeRound__commentButton"
    );
  });

  it("keeps remote comment author previews when local replies are partial", () => {
    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={{
          ...round,
          messages: [
            {
              ...round.messages[0],
              hasLoadedReplies: false,
              replies: [createdReply],
              replyAuthorsPreview: [
                {
                  avatarFallback: "AL",
                  id: "member-2",
                  image: null,
                  name: "Ada Lovelace",
                  role: "tribemate",
                },
              ],
              replyCount: 2,
            },
          ],
        }}
      />
    );

    expect(
      screen.getByRole("group", {
        name: "Comentaron Grace Hopper, Ada Lovelace",
      })
    ).toHaveClass("TribeRound__commentAuthors");
  });

  it("renders the active pin toggle inside the message meta area", () => {
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

    expect(messageMeta).not.toBeNull();

    const pinButton = within(messageMeta as HTMLElement).getByRole("button", {
      name: "Despinear mensaje",
    });

    expect(pinButton).toHaveClass("TribeRound__pinButton--active");
    expect(
      (messageMeta as HTMLElement).querySelector(".TribeRound__channelBadge")
    ).toBeNull();
    expect(
      (messageMeta as HTMLElement).querySelector(".TribeRound__channelInline")
    ).toBeNull();
  });

  it("renders pinned messages with a visible indicator and toggles pin without refreshing", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    (global.fetch as Mock).mockResolvedValueOnce({
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
        vi.advanceTimersByTime(300);
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
      vi.useRealTimers();
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
                canEdit: false,
              },
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Acciones del mensaje" })
    );

    const deleteMenuItem = screen.getByRole("menuitem", {
      name: "Eliminar mensaje",
    });

    expect(deleteMenuItem).toHaveClass("TribeRound__messageMenuItem");
    expect(deleteMenuItem).toHaveClass("TribeRound__messageMenuItem--destructive");
    expect(deleteMenuItem).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByRole("menu")).toHaveClass("TribeRound__messageMenuContent");
  });

  it("asks for confirmation before deleting a feed message", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        message: "Mensaje eliminado.",
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
              permissions: {
                canDelete: true,
                canEdit: false,
              },
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Acciones del mensaje" })
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Eliminar mensaje" })
    );

    expect(global.fetch).not.toHaveBeenCalled();

    const confirmationDialog = screen.getByRole("dialog", {
      name: "Eliminar mensaje",
    });

    expect(confirmationDialog).toBeInTheDocument();
    expect(
      within(confirmationDialog).getByText(
        "Esta acción elimina el mensaje del feed y no se puede deshacer."
      )
    ).toBeInTheDocument();

    const confirmButton = within(confirmationDialog).getByRole("button", {
      name: "Eliminar",
    });

    expect(confirmButton).toHaveClass("TribeRound__deleteMessageConfirmButton");

    await user.click(confirmButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
    expect(screen.queryByText("Anuncio inicial")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Mensaje eliminado.");
  });

  it("preserves timestamp precision and refreshes pagination after editing message date", async () => {
    const user = userEvent.setup();
    const originalCreatedAt = "2026-04-26T12:00:30.456Z";

    (global.fetch as Mock).mockResolvedValueOnce({
      json: async () => ({
        createdAt: originalCreatedAt,
        message: "Fecha del mensaje actualizada.",
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
          viewerPermissions: {
            ...round.viewerPermissions,
            canEditMessageCreatedAt: true,
          },
          messages: [
            {
              ...round.messages[0],
              createdAt: originalCreatedAt,
              permissions: {
                canDelete: false,
                canEdit: false,
              },
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Acciones del mensaje" })
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Editar fecha de creación" })
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages/message-1/created-at",
        expect.objectContaining({
          body: JSON.stringify({ createdAt: originalCreatedAt }),
          method: "PATCH",
        })
      );
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows a warning when the pinned message limit is reached", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    (global.fetch as Mock).mockResolvedValueOnce({
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
        vi.advanceTimersByTime(300);
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
      vi.useRealTimers();
    }
  });

  it("keeps the last debounced pin intent and skips the request when clicks cancel out", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
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
        vi.advanceTimersByTime(300);
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the last debounced like intent and skips the request when clicks cancel out", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
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
        vi.advanceTimersByTime(300);
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
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

  it("renders long message details with an inline expansion toggle that reveals the full content", async () => {
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

    expect(dialog).toHaveClass("TribeRound__composerDialog--messageDetails");
    expect(dialogBody).toHaveClass("TribeRound__messageDetailsBody");
    expect(stickyHeader).toHaveClass("TribeRound__messageDetailsHeader");

    const dialogContent = dialog.querySelector<HTMLElement>("[data-expanded]");

    expect(dialogContent).not.toBeNull();
    expect(dialogContent).toHaveAttribute("data-expanded", "false");
    expect(dialogContent).not.toHaveClass("TribeRound__content--collapsed");
    expect(dialogContent).not.toHaveClass("TribeRound__content--detailsPreview");

    const inlineShowMoreButton = within(dialog).getByRole("button", {
      name: "Ver más",
    });

    expect(dialogContent).toContainElement(inlineShowMoreButton);
    expect(dialogContent?.textContent ?? "").toContain("…Ver más");
    expect(dialogContent?.textContent ?? "").not.toEqual(
      expect.stringContaining(longMessageContent)
    );

    await user.click(inlineShowMoreButton);

    const expandedDialogContent = within(dialog).getByText(longMessageContent);

    expect(expandedDialogContent).toHaveAttribute("data-expanded", "true");
    expect(expandedDialogContent).not.toHaveClass("TribeRound__content--collapsed");
    expect(expandedDialogContent).not.toHaveClass("TribeRound__content--detailsPreview");
    expect(within(dialog).queryByRole("button", { name: "Ver menos" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
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

    const reopenedDialog = screen.getByRole("dialog", { name: "Mensaje" });
    const reopenedDialogContent =
      reopenedDialog.querySelector<HTMLElement>("[data-expanded]");

    expect(reopenedDialogContent).not.toBeNull();
    expect(reopenedDialogContent).toHaveAttribute("data-expanded", "false");
    expect(
      within(reopenedDialog).getByRole("button", { name: "Ver más" })
    ).toBeInTheDocument();
  });

  it("reverts an optimistic like when the request fails", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    (global.fetch as Mock).mockResolvedValueOnce({
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
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar la reaccion.");
      });
      expect(screen.getByRole("button", { name: "Me gusta 2" })).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reverts an optimistic pin when the request fails", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    (global.fetch as Mock).mockResolvedValueOnce({
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
        vi.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar el pin.");
      });
      expect(screen.getByRole("button", { name: "Pinear mensaje" })).not.toHaveClass(
        "TribeRound__pinButton--active"
      );
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("appends the returned reply without refreshing the route", async () => {
    const user = userEvent.setup();

    (global.fetch as Mock).mockResolvedValueOnce({
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

    expect(screen.getByRole("button", { name: "Comentarios 0" })).toBeInTheDocument();
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

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Comentarios 1" })).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("loads replies only after opening a message detail", async () => {
    const user = userEvent.setup();
    const deferredRepliesResponse = createDeferredResponse();

    (global.fetch as Mock).mockReturnValueOnce(deferredRepliesResponse.promise);

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

    expect(
      screen.getByRole("status", { name: "Cargando respuestas..." })
    ).toBeInTheDocument();

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

  it("does not load replies when the message has no comments", async () => {
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
              hasLoadedReplies: false,
              replyCount: 0,
              replies: [],
            },
          ],
        }}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Anuncio inicial/i })
    );

    expect(
      screen.queryByRole("status", { name: "Cargando respuestas..." })
    ).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/tribes/matematica-pro/messages/message-1/replies",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(
      screen.getByRole("textbox", {
        name: "Escribir una respuesta",
      })
    ).toBeEnabled();
  });

  it("reloads existing replies after creating a reply from a failed deferred load", async () => {
    const user = userEvent.setup();
    const failedLoadMessage = "No pudimos cargar las respuestas.";

    (global.fetch as Mock).mockImplementation(
      async function (url: string, init?: RequestInit) {
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

        const getRepliesCalls = (global.fetch as Mock).mock.calls.filter(
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
        (global.fetch as Mock).mock.calls.filter(
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

    (global.fetch as Mock).mockImplementation(
      async function (url: string, init?: RequestInit) {
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

    (global.fetch as Mock).mockReturnValueOnce(createReplyRequest);

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
    expect(
      screen.getAllByRole("group", { name: "Comentaron Grace Hopper" }).length
    ).toBeGreaterThan(0);
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

    (global.fetch as Mock).mockReturnValueOnce(createReplyRequest);

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

    (global.fetch as Mock).mockReturnValueOnce(createReplyRequest);

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

  it("submits a video link with a new message", async () => {
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
      "Recurso"
    );
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Miren este video."
    );
    await user.click(screen.getByRole("button", { name: "Agregar video" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link del video" }),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    expect(screen.getByText("Proveedor detectado: YouTube")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/messages",
        expect.objectContaining({
          body: JSON.stringify({
            channelId: "channel-intro",
            content: "Miren este video.",
            media: [
              {
                kind: "video",
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              },
            ],
            title: "Recurso",
          }),
          method: "POST",
        })
      );
    });
  });

  it("scrolls the whole video block into view and focuses its input when a video draft is added", async () => {
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView =
      scrollIntoViewSpy as unknown as typeof HTMLElement.prototype.scrollIntoView;

    try {
      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      scrollIntoViewSpy.mockClear();
      await user.click(screen.getByRole("button", { name: "Agregar video" }));

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      const [scrollOptions] = scrollIntoViewSpy.mock.calls.at(-1) ?? [];
      expect(scrollOptions).toMatchObject({
        behavior: "smooth",
        block: "nearest",
      });

      const scrolledElement = scrollIntoViewSpy.mock.instances.at(
        -1
      ) as unknown as HTMLElement;
      expect(
        within(scrolledElement).getByRole("textbox", {
          name: "Link del video",
        })
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByRole("textbox", { name: "Link del video" })
        ).toHaveFocus();
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("scrolls the whole image block into view and focuses its input when an image draft is added", async () => {
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView =
      scrollIntoViewSpy as unknown as typeof HTMLElement.prototype.scrollIntoView;
    const imageFile = new File(["image"], "captura.png", {
      type: "image/png",
    });

    (global.fetch as Mock).mockImplementation(async function (url: string) {
      if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
        return {
          json: async () => ({
            assetId: "asset-scroll-1",
            imageId: "cloudflare-image-scroll-1",
            uploadUrl: "https://upload.imagedelivery.net/direct-upload",
          }),
          ok: true,
          statusText: "Created",
        };
      }

      if (url === "https://upload.imagedelivery.net/direct-upload") {
        return { json: async () => ({}), ok: true, statusText: "OK" };
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    try {
      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      scrollIntoViewSpy.mockClear();
      await user.upload(
        screen.getByLabelText("Agregar imagen"),
        imageFile
      );

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      const [scrollOptions] = scrollIntoViewSpy.mock.calls.at(-1) ?? [];
      expect(scrollOptions).toMatchObject({
        behavior: "smooth",
        block: "nearest",
      });

      const scrolledElement = scrollIntoViewSpy.mock.instances.at(
        -1
      ) as unknown as HTMLElement;
      expect(
        within(scrolledElement).getByRole("textbox", {
          name: "Descripción de la imagen",
        })
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByRole("textbox", { name: "Descripción de la imagen" })
        ).toHaveFocus();
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("scrolls the whole poll block into view and focuses the first option when the poll composer is enabled", async () => {
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView =
      scrollIntoViewSpy as unknown as typeof HTMLElement.prototype.scrollIntoView;

    try {
      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      scrollIntoViewSpy.mockClear();
      await user.click(screen.getByRole("button", { name: "Agregar encuesta" }));

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      const [scrollOptions] = scrollIntoViewSpy.mock.calls.at(-1) ?? [];
      expect(scrollOptions).toMatchObject({
        behavior: "smooth",
        block: "nearest",
      });

      const scrolledElement = scrollIntoViewSpy.mock.instances.at(
        -1
      ) as unknown as HTMLElement;
      expect(
        within(scrolledElement).getByRole("textbox", { name: "Opción 1" })
      ).toBeInTheDocument();
      expect(
        within(scrolledElement).getByRole("textbox", { name: "Opción 2" })
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByRole("textbox", { name: "Opción 1" })
        ).toHaveFocus();
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("scrolls the poll composer into view when a poll option is added", async () => {
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView =
      scrollIntoViewSpy as unknown as typeof HTMLElement.prototype.scrollIntoView;

    try {
      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.click(screen.getByRole("button", { name: "Agregar encuesta" }));
      await waitFor(() => {
        expect(
          screen.getByRole("textbox", { name: "Opción 1" })
        ).toHaveFocus();
      });
      scrollIntoViewSpy.mockClear();
      await user.click(screen.getByRole("button", { name: "Agregar opción" }));

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      const [scrollOptions] = scrollIntoViewSpy.mock.calls.at(-1) ?? [];
      expect(scrollOptions).toMatchObject({ behavior: "smooth", block: "end" });

      const scrolledElement = scrollIntoViewSpy.mock.instances.at(
        -1
      ) as unknown as HTMLElement;
      expect(
        within(scrolledElement).getByRole("textbox", { name: "Opción 3" })
      ).toBeInTheDocument();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("shows the required-option error inline on each of the first two poll options and keeps the summary", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );
    await user.click(screen.getByRole("button", { name: "Agregar encuesta" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(screen.getAllByText("Completar esta opción")).toHaveLength(2);

    const missingRequirements = screen.getByRole("list", {
      name: "Requisitos pendientes",
    });

    expect(
      within(missingRequirements).getByText("Agregar al menos 2 opciones")
    ).toBeInTheDocument();
  });

  it("shows the missing-video error inline next to the video input and keeps the summary", async () => {
    const user = userEvent.setup();

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );
    await user.click(screen.getByRole("button", { name: "Agregar video" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(
      screen.getAllByText("Pegar un link de video válido")
    ).toHaveLength(2);
    expect(
      screen.getByRole("textbox", { name: "Link del video" })
    ).toBeInvalid();
  });

  it("scrolls the first errored field into view on a failed submit", async () => {
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView =
      scrollIntoViewSpy as unknown as typeof HTMLElement.prototype.scrollIntoView;

    try {
      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      scrollIntoViewSpy.mockClear();
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      const [scrollOptions] = scrollIntoViewSpy.mock.calls.at(-1) ?? [];
      expect(scrollOptions).toMatchObject({
        behavior: "smooth",
        block: "nearest",
      });

      const scrolledElement = scrollIntoViewSpy.mock.instances.at(
        -1
      ) as unknown as HTMLElement;
      expect(
        within(scrolledElement).getByRole("textbox", {
          name: "Título del mensaje",
        })
      ).toBeInTheDocument();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("blocks submission when the video URL is not recognized", async () => {
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
      "Recurso"
    );
    setMessageEditorContent(
      screen.getByRole("textbox", { name: "Contenido del mensaje" }),
      "Algo"
    );
    await user.click(screen.getByRole("button", { name: "Agregar video" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link del video" }),
      "https://www.dailymotion.com/video/x7tgad0"
    );
    await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
    await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(
      screen.getByText(
        "No pudimos reconocer este link. Probá con YouTube, Vimeo, Wistia o Loom."
      )
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("disables the media buttons once the combined limit is reached", async () => {
    const user = userEvent.setup();
    const combinedMediaLimit = 10;

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={round}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Compartí algo en la ronda" })
    );

    const addVideoButton = screen.getByRole("button", {
      name: "Agregar video",
    });

    for (let videoIndex = 0; videoIndex < combinedMediaLimit; videoIndex += 1) {
      await user.click(addVideoButton);
    }

    expect(
      screen.getAllByRole("textbox", { name: "Link del video" })
    ).toHaveLength(combinedMediaLimit);
    expect(addVideoButton).toBeDisabled();

    const imageFileInput = screen
      .getByLabelText("Agregar imagen")
      .querySelector('input[type="file"]');

    expect(imageFileInput).toBeDisabled();
  });

  it("shows the dynamic combined media limit error when uploading too many files", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      (global.fetch as Mock).mockImplementation(async function (url: string) {
        if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
          return {
            json: async () => ({
              assetId: "asset-1",
              imageId: "cloudflare-image-1",
              uploadUrl: "https://upload.imagedelivery.net/direct-upload",
            }),
            ok: true,
            statusText: "Created",
          };
        }

        if (url === "https://upload.imagedelivery.net/direct-upload") {
          return {
            json: async () => ({}),
            ok: true,
            statusText: "OK",
          };
        }

        throw new Error(`Unexpected fetch ${url}`);
      });

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );

      const addVideoButton = screen.getByRole("button", {
        name: "Agregar video",
      });

      for (let videoIndex = 0; videoIndex < 9; videoIndex += 1) {
        await user.click(addVideoButton);
      }

      const twoImageFiles = [
        new File(["a"], "uno.png", { type: "image/png" }),
        new File(["b"], "dos.png", { type: "image/png" }),
      ];

      await user.upload(screen.getByLabelText("Agregar imagen"), twoImageFiles);

      const missingRequirements = screen.getByRole("list", {
        name: "Requisitos pendientes",
      });

      expect(
        within(missingRequirements).getByText(
          "Podés adjuntar hasta 10 archivos entre imágenes y videos."
        )
      ).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("submits images and videos as a single ordered media list", async () => {
    const user = userEvent.setup();
    const originalCreateObjectUrl = URL.createObjectURL;

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:message-image"),
    });

    try {
      (global.fetch as Mock).mockImplementation(async function (url: string) {
        if (url === "/api/tribes/matematica-pro/messages/images/uploads") {
          return {
            json: async () => ({
              assetId: "asset-1",
              imageId: "cloudflare-image-1",
              uploadUrl: "https://upload.imagedelivery.net/direct-upload",
            }),
            ok: true,
            statusText: "Created",
          };
        }

        if (url === "https://upload.imagedelivery.net/direct-upload") {
          return {
            json: async () => ({}),
            ok: true,
            statusText: "OK",
          };
        }

        if (url === "/api/tribes/matematica-pro/messages") {
          return {
            json: async () => ({
              message: "Mensaje creado.",
              tribeMessage: {
                ...createdMessage,
                media: [
                  {
                    altText: "",
                    id: "asset-1",
                    kind: "image",
                    sortOrder: 0,
                    url: "https://imagedelivery.net/account-hash/image-1/public",
                  },
                  {
                    externalId: "dQw4w9WgXcQ",
                    id: "message-video-1",
                    kind: "video",
                    provider: "youtube",
                    sortOrder: 1,
                  },
                ],
              },
            }),
            ok: true,
            statusText: "Created",
          };
        }

        throw new Error(`Unexpected fetch ${url}`);
      });

      const imageFile = new File(["image"], "captura.png", {
        type: "image/png",
      });

      render(
        <TribeRound
          authenticatedMember={authenticatedMember}
          tribeSlug="matematica-pro"
          round={round}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Compartí algo en la ronda" })
      );
      await user.type(
        screen.getByRole("textbox", { name: "Título del mensaje" }),
        "Recurso mixto"
      );
      setMessageEditorContent(
        screen.getByRole("textbox", { name: "Contenido del mensaje" }),
        "Imagen y video."
      );
      await user.upload(screen.getByLabelText("Agregar imagen"), imageFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "https://upload.imagedelivery.net/direct-upload",
          expect.objectContaining({ method: "POST" })
        );
      });

      await user.click(screen.getByRole("button", { name: "Agregar video" }));
      await user.type(
        screen.getByRole("textbox", { name: "Link del video" }),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      );

      await user.click(screen.getByRole("button", { name: "Canal del mensaje" }));
      await user.click(screen.getByRole("menuitem", { name: "Intro and Goals" }));
      await user.click(screen.getByRole("button", { name: "Compartir" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tribes/matematica-pro/messages",
          expect.objectContaining({
            body: JSON.stringify({
              channelId: "channel-intro",
              content: "Imagen y video.",
              media: [
                { altText: "", assetId: "asset-1", kind: "image" },
                {
                  kind: "video",
                  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                },
              ],
              title: "Recurso mixto",
            }),
            method: "POST",
          })
        );
      });
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    }
  });

  it("renders a unified carousel with image and video slides for mixed media", async () => {
    const user = userEvent.setup();
    const mixedMediaRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              altText: "Captura del recurso",
              id: "message-image-1",
              kind: "image" as const,
              sortOrder: 0,
              url: "https://imagedelivery.net/account-hash/message-image-1/public",
            },
            {
              externalId: "dQw4w9WgXcQ",
              id: "message-video-1",
              kind: "video" as const,
              provider: "youtube" as const,
              sortOrder: 1,
            },
          ],
          title: "Mensaje con media mixto",
        },
      ],
    };

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={mixedMediaRound}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /Abrir mensaje: Mensaje con media mixto/i,
      })
    );

    const messageDetailsDialog = screen.getByRole("dialog", {
      name: "Mensaje",
    });

    expect(
      within(messageDetailsDialog).getByRole("button", {
        name: "Abrir video 2: YouTube",
      })
    ).toBeInTheDocument();

    await user.click(
      within(messageDetailsDialog).getByRole("button", {
        name: "Abrir imagen 1: Captura del recurso",
      })
    );

    const carouselDialog = screen.getByRole("dialog", {
      name: "Medios del mensaje",
    });

    expect(
      within(carouselDialog).getByRole("img", { name: "Captura del recurso" })
    ).toBeInTheDocument();
    // The carousel opens on the image (slide 0). The inactive video slide must
    // not mount its provider iframe yet; it shows a lightweight poster instead.
    expect(
      carouselDialog.querySelector(".TribeRound__videoEmbedIframe")
    ).toBeNull();
    expect(
      carouselDialog.querySelector(".TribeRound__videoThumbnail")
    ).toHaveAttribute("src", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(within(carouselDialog).getByText("Medio 1 de 2")).toHaveClass(
      "TribeRound__srOnly"
    );
  });

  it("shows video thumbnail previews in the message modal and keeps playback in the carousel", async () => {
    const user = userEvent.setup();
    const videoPreviewRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              externalId: "dQw4w9WgXcQ",
              id: "message-video-youtube",
              kind: "video" as const,
              provider: "youtube" as const,
              sortOrder: 0,
              thumbnailUrl: null,
            },
            {
              externalId: "123456789",
              id: "message-video-vimeo",
              kind: "video" as const,
              provider: "vimeo" as const,
              sortOrder: 1,
              thumbnailUrl: "https://i.vimeocdn.com/video/123456789.jpg",
            },
          ],
          title: "Mensaje con videos",
        },
      ],
    };

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={videoPreviewRound}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Abrir mensaje: Mensaje con videos/i })
    );

    const messageDetailsDialog = screen.getByRole("dialog", {
      name: "Mensaje",
    });

    const thumbnails = messageDetailsDialog.querySelectorAll(
      ".TribeRound__videoThumbnail"
    );

    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0]).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
    expect(thumbnails[1]).toHaveAttribute(
      "src",
      "https://i.vimeocdn.com/video/123456789.jpg"
    );
    expect(
      messageDetailsDialog.querySelector(".TribeRound__videoEmbedIframe")
    ).toBeNull();

    await user.click(
      within(messageDetailsDialog).getByRole("button", {
        name: "Abrir video 1: YouTube",
      })
    );

    const carouselDialog = screen.getByRole("dialog", {
      name: "Medios del mensaje",
    });

    // The carousel opens on the YouTube video (active slide), so only that
    // provider iframe mounts. The inactive Vimeo slide stays a poster, proving
    // the carousel never boots every player at once.
    const carouselIframes = carouselDialog.querySelectorAll(
      ".TribeRound__videoEmbedIframe"
    );

    expect(carouselIframes).toHaveLength(1);
    expect(carouselIframes[0]).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );

    const carouselPosters = carouselDialog.querySelectorAll(
      ".TribeRound__videoThumbnail"
    );

    expect(carouselPosters).toHaveLength(1);
    expect(carouselPosters[0]).toHaveAttribute(
      "src",
      "https://i.vimeocdn.com/video/123456789.jpg"
    );
  });

  it("navega el carrusel con las flechas aunque el foco no esté en un control del carrusel", async () => {
    const user = userEvent.setup();
    const mixedMediaRound = {
      ...round,
      messages: [
        {
          ...round.messages[0],
          media: [
            {
              altText: "Captura del recurso",
              id: "message-image-1",
              kind: "image" as const,
              sortOrder: 0,
              url: "https://imagedelivery.net/account-hash/message-image-1/public",
            },
            {
              externalId: "dQw4w9WgXcQ",
              id: "message-video-1",
              kind: "video" as const,
              provider: "youtube" as const,
              sortOrder: 1,
              thumbnailUrl: null,
            },
          ],
          title: "Mensaje con media mixto",
        },
      ],
    };

    render(
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug="matematica-pro"
        round={mixedMediaRound}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: /Abrir mensaje: Mensaje con media mixto/i,
      })
    );

    const messageDetailsDialog = screen.getByRole("dialog", {
      name: "Mensaje",
    });

    await user.click(
      within(messageDetailsDialog).getByRole("button", {
        name: "Abrir imagen 1: Captura del recurso",
      })
    );

    const carouselDialog = screen.getByRole("dialog", {
      name: "Medios del mensaje",
    });
    const closeButton = within(carouselDialog).getByRole("button", {
      name: "Cerrar",
    });

    closeButton.focus();

    // With focus outside the carousel controls, the dialog still intercepts the
    // arrow keys (handled = preventDefault), so navigation does not depend on
    // where focus landed inside the dialog.
    expect(fireEvent.keyDown(closeButton, { key: "ArrowRight" })).toBe(false);
    expect(fireEvent.keyDown(closeButton, { key: "ArrowLeft" })).toBe(false);

    expect(carouselDialog).toBeInTheDocument();
  });
});
