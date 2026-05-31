import {
  GET,
  POST,
} from "@/app/api/tribes/[slug]/channels/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/tribes/[slug]/channels/[channelId]/route";
import { createRequestModules } from "@/src/modules/setup";
import {
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
} from "@/src/modules/shared/infrastructure/observability/request-context";
import { revalidateTag } from "next/cache";

const getAuthenticatedMember = jest.fn();
const listTribeChannels = jest.fn();
const createTribeChannel = jest.fn();
const updateTribeChannel = jest.fn();
const deleteTribeChannel = jest.fn();
const mockServerLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(() => mockServerLogger),
  })
);

class MockJsonResponse {
  headers: Headers;
  status: number;

  constructor(
    private readonly body: Record<string, unknown>,
    init?: ResponseInit
  ) {
    this.headers = new Headers(init?.headers);
    this.status = init?.status ?? 200;
  }

  static json(body: Record<string, unknown>, init?: ResponseInit) {
    return new MockJsonResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

function buildJsonRequest(
  body: Record<string, string | number> = {},
  headers: HeadersInit = {}
): Request {
  return {
    headers: new Headers({
      "Content-Type": "application/json",
      ...headers,
    }),
    json: async () => body,
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/channels",
  } as unknown as Request;
}

function buildTribeContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

function buildChannelContext() {
  return {
    params: Promise.resolve({
      channelId: "channel-ronda",
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe channel routes", () => {
  const channel = {
    accessScope: "tribemates" as const,
    emoji: "🔥",
    id: "channel-ronda",
    name: "Ronda",
    slug: "ronda",
    sortOrder: 20,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (revalidateTag as jest.Mock).mockReset();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      messages: {
        useCases: {
          createTribeChannel,
          deleteTribeChannel,
          listTribeChannels,
          updateTribeChannel,
        },
      },
    });
  });

  it("lists channels for the tribe", async () => {
    listTribeChannels.mockResolvedValue({
      channels: [channel],
    });

    const response = await GET(buildJsonRequest(), buildTribeContext());

    await expect(response.json()).resolves.toEqual({
      channels: [channel],
    });
    expect(response.status).toBe(200);
    expect(createRequestModules).toHaveBeenCalledWith({
      requestId: expect.any(String),
    });
    expect(listTribeChannels).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("attaches request and trace headers when listing channels", async () => {
    listTribeChannels.mockResolvedValue({
      channels: [channel],
    });

    const response = await GET(
      buildJsonRequest(
        {},
        {
          [REQUEST_ID_HEADER]: "request-1",
          [TRACE_ID_HEADER]: "trace-1",
        }
      ),
      buildTribeContext()
    );

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("request-1");
    expect(response.headers.get(TRACE_ID_HEADER)).toBe("trace-1");
  });

  it("returns a safe message when listing channels fails unexpectedly", async () => {
    listTribeChannels.mockRejectedValueOnce(new Error("database_down"));

    const response = await GET(buildJsonRequest(), buildTribeContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos cargar los canales. Intentá de nuevo.",
    });
  });

  it("creates a channel from request body fields", async () => {
    createTribeChannel.mockResolvedValue({
      channel,
      status: "created",
    });

    const response = await POST(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
      }),
      buildTribeContext()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      channel,
      message: "Canal creado.",
    });
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("returns a safe duplicate message when creating an existing channel slug", async () => {
    createTribeChannel.mockResolvedValue({
      status: "duplicate_slug",
    });

    const response = await POST(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
      }),
      buildTribeContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ya existe un canal con ese nombre.",
    });
    expect(mockServerLogger.warn).toHaveBeenCalledWith({
      message: "Tribe channel creation failed",
      metadata: expect.objectContaining({
        outcome: "duplicate_slug",
        slug: "matematica-pro",
        status: 400,
        viewerId: "member-1",
      }),
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("returns a specific validation message when channel creation input is invalid", async () => {
    createTribeChannel.mockResolvedValue({
      status: "invalid_name",
    });

    const response = await POST(
      buildJsonRequest({
        emoji: "",
        name: "Canal con nombre demasiado largo",
      }),
      buildTribeContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        "Definí un nombre de hasta 30 caracteres y elegí un ícono para el canal.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("updates a channel from request body fields", async () => {
    updateTribeChannel.mockResolvedValue({
      channel,
      status: "updated",
    });

    const response = await PATCH(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 20,
      }),
      buildChannelContext()
    );

    expect(response.status).toBe(200);
    expect(updateTribeChannel).toHaveBeenCalledWith({
      channelId: "channel-ronda",
      tribeSlug: "matematica-pro",
      emoji: "🔥",
      name: "Ronda",
      sortOrder: 20,
    });
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("returns a safe duplicate message when renaming to an existing channel slug", async () => {
    updateTribeChannel.mockResolvedValue({
      status: "duplicate_slug",
    });

    const response = await PATCH(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 20,
      }),
      buildChannelContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Ya existe un canal con ese nombre.",
    });
  });

  it("returns a specific validation message when channel update input is invalid", async () => {
    updateTribeChannel.mockResolvedValue({
      status: "invalid_name",
    });

    const response = await PATCH(
      buildJsonRequest({
        emoji: "🔥",
        name: "Canal con nombre demasiado largo",
        sortOrder: 20,
      }),
      buildChannelContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        "Definí un nombre de hasta 30 caracteres y elegí un ícono para el canal.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects updates with invalid sort order values", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
        sortOrder: Number.NaN,
      }),
      buildChannelContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden del canal es inválido.",
    });
    expect(updateTribeChannel).not.toHaveBeenCalled();
  });

  it("rejects updates when sort order is not an integer", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
        sortOrder: 20.5,
      }),
      buildChannelContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden del canal es inválido.",
    });
    expect(updateTribeChannel).not.toHaveBeenCalled();
  });

  it("rejects updates when sort order is missing", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
      }),
      buildChannelContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden del canal es inválido.",
    });
    expect(updateTribeChannel).not.toHaveBeenCalled();
  });

  it("rejects updates when sort order is an empty string", async () => {
    const response = await PATCH(
      buildJsonRequest({
        emoji: "🔥",
        name: "Ronda",
        sortOrder: "",
      }),
      buildChannelContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "El orden del canal es inválido.",
    });
    expect(updateTribeChannel).not.toHaveBeenCalled();
  });

  it("requires a target channel when deleting a channel with messages", async () => {
    deleteTribeChannel.mockResolvedValue({
      status: "channel_has_messages",
    });

    const response = await DELETE(buildJsonRequest(), buildChannelContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Elegí otro canal para mover las mensajes.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("revalidates the tribe round cache after deleting a channel", async () => {
    deleteTribeChannel.mockResolvedValue({
      status: "deleted",
    });

    const response = await DELETE(buildJsonRequest(), buildChannelContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Canal eliminado.",
    });
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });
});
