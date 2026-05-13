import { POST as POST_CREATE } from "@/app/api/tribes/[slug]/messages/route";
import { POST as POST_REPLY } from "@/app/api/tribes/[slug]/messages/[messageId]/replies/route";
import { POST as POST_LIKE } from "@/app/api/tribes/[slug]/messages/[messageId]/like/route";
import { POST as POST_PIN } from "@/app/api/tribes/[slug]/messages/[messageId]/pin/route";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const getAuthenticatedMember = jest.fn();
const createTribeMessage = jest.fn();
const createMessageReply = jest.fn();
const toggleMessageLike = jest.fn();
const toggleMessagePin = jest.fn();
const listTribeChannels = jest.fn();
const createTribeChannel = jest.fn();
const updateTribeChannel = jest.fn();
const deleteTribeChannel = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(),
  })
);

class MockJsonResponse {
  status: number;

  constructor(
    private readonly body: Record<string, unknown>,
    init?: ResponseInit
  ) {
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockJsonResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

function buildJsonRequest(body: Record<string, string> = {}): Request {
  return {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    json: async () => body,
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro",
  } as unknown as Request;
}

function buildRouteContext(messageId: string) {
  return {
    params: Promise.resolve({
      messageId,
      slug: "matematica-pro",
    }),
  };
}

function buildCreateRouteContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe message routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    createTribeMessage.mockReset();
    createMessageReply.mockReset();
    toggleMessageLike.mockReset();
    toggleMessagePin.mockReset();
    listTribeChannels.mockReset();
    createTribeChannel.mockReset();
    updateTribeChannel.mockReset();
    deleteTribeChannel.mockReset();
    global.Response = MockJsonResponse as unknown as typeof Response;

    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "member@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      messages: {
        useCases: {
          createTribeMessage,
          createTribeChannel,
          createMessageReply,
          deleteTribeChannel,
          listTribeChannels,
          toggleMessageLike,
          toggleMessagePin,
          updateTribeChannel,
        },
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
    });
  });

  it("passes title and content to the tribe message use case", async () => {
    createTribeMessage.mockResolvedValue({
      message: {
        id: "message-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
        channel: {
          accessScope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sortOrder: 20,
        },
        replies: [],
        content: "Primera mensaje",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        title: "Anuncio inicial",
      },
      status: "created",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera mensaje",
        channelId: "channel-ronda",
        title: "Anuncio inicial",
      }),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      message: "Mensaje creado.",
      tribeMessage: {
        id: "message-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
        channel: {
          accessScope: "tribemates",
          emoji: "🔥",
          id: "channel-ronda",
          name: "Ronda",
          slug: "ronda",
          sortOrder: 20,
        },
        replies: [],
        content: "Primera mensaje",
        createdAt: "2026-04-26T12:00:00.000Z",
        likedByViewer: false,
        likeCount: 0,
        title: "Anuncio inicial",
      },
    });
    expect(createTribeMessage).toHaveBeenCalledWith({
      authorId: "member-1",
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      content: "Primera mensaje",
      title: "Anuncio inicial",
    });
  });

  it("returns a safe validation message when channel is missing", async () => {
    createTribeMessage.mockResolvedValue({
      status: "invalid_channel",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera mensaje",
        title: "Anuncio inicial",
      }),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: "Seleccioná un canal antes de publicar.",
    });
  });

  it("returns a safe validation message when the tribe message is invalid", async () => {
    createTribeMessage.mockResolvedValue({
      status: "invalid_content",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera mensaje",
        title: "",
      }),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: "Completá el título y el contenido antes de publicar.",
    });
  });

  it("returns not found when reply messageId is not a UUID", async () => {
    const response = await POST_REPLY(
      buildJsonRequest({ content: "Gracias" }),
      buildRouteContext("not-a-uuid")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "No pudimos encontrar el mensaje.",
    });
    expect(createMessageReply).not.toHaveBeenCalled();
  });

  it("returns the created reply payload", async () => {
    createMessageReply.mockResolvedValue({
      reply: {
        id: "reply-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
        content: "Gracias",
        createdAt: "2026-04-26T12:05:00.000Z",
      },
      status: "created",
    });

    const response = await POST_REPLY(
      buildJsonRequest({ content: "Gracias" }),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      reply: {
        id: "reply-1",
        author: {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
        content: "Gracias",
        createdAt: "2026-04-26T12:05:00.000Z",
      },
      message: "Respuesta creado.",
    });
  });

  it("returns not found when like messageId is not a UUID", async () => {
    const response = await POST_LIKE(
      buildJsonRequest(),
      buildRouteContext("not-a-uuid")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "No pudimos encontrar el mensaje.",
    });
    expect(toggleMessageLike).not.toHaveBeenCalled();
  });

  it("returns the like status and count payload", async () => {
    toggleMessageLike.mockResolvedValue({
      likedByViewer: true,
      likeCount: 3,
      status: "liked",
    });

    const response = await POST_LIKE(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      likedByViewer: true,
      likeCount: 3,
      message: "Reaccion actualizada.",
    });
  });

  it("returns not found when pin messageId is not a UUID", async () => {
    const response = await POST_PIN(
      buildJsonRequest(),
      buildRouteContext("not-a-uuid")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "No pudimos encontrar el mensaje.",
    });
    expect(toggleMessagePin).not.toHaveBeenCalled();
  });

  it("returns the pinned message state", async () => {
    toggleMessagePin.mockResolvedValue({
      isPinned: true,
      pinnedAt: "2026-04-26T13:00:00.000Z",
      status: "pinned",
    });

    const response = await POST_PIN(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      isPinned: true,
      message: "Mensaje pineado.",
      pinnedAt: "2026-04-26T13:00:00.000Z",
    });
    expect(toggleMessagePin).toHaveBeenCalledWith({
      messageId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("returns a safe warning when the pin limit is reached", async () => {
    toggleMessagePin.mockResolvedValue({
      isPinned: false,
      pinnedAt: null,
      status: "pin_limit_reached",
    });

    const response = await POST_PIN(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      message: "Solo podes pinear hasta 3 mensajes en el fogón.",
    });
  });
});
