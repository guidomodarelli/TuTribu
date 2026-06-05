import { POST as POST_CREATE } from "@/app/api/tribes/[slug]/messages/route";
import {
  GET as GET_REPLIES,
  POST as POST_REPLY,
} from "@/app/api/tribes/[slug]/messages/[messageId]/replies/route";
import { GET as GET_LIKERS } from "@/app/api/tribes/[slug]/messages/[messageId]/likes/route";
import { POST as POST_LIKE } from "@/app/api/tribes/[slug]/messages/[messageId]/like/route";
import { POST as POST_PIN } from "@/app/api/tribes/[slug]/messages/[messageId]/pin/route";
import {
  DELETE as DELETE_MESSAGE,
  PATCH as PATCH_MESSAGE,
} from "@/app/api/tribes/[slug]/messages/[messageId]/route";
import { DELETE as DELETE_MESSAGE_IMAGE } from "@/app/api/tribes/[slug]/messages/images/[assetId]/route";
import { POST as POST_MESSAGE_IMAGE_UPLOAD } from "@/app/api/tribes/[slug]/messages/images/uploads/route";
import {
  DELETE as DELETE_POLL,
  PATCH as PATCH_POLL,
} from "@/app/api/tribes/[slug]/messages/[messageId]/poll/route";
import { POST as POST_POLL_VOTE } from "@/app/api/tribes/[slug]/messages/[messageId]/poll/votes/route";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { revalidateTag } from "next/cache";

const getAuthenticatedMember = jest.fn();
const createTribeMessage = jest.fn();
const createMessageReply = jest.fn();
const listMessageReplies = jest.fn();
const listMessageLikers = jest.fn();
const toggleMessageLike = jest.fn();
const toggleMessagePin = jest.fn();
const deleteTribeMessage = jest.fn();
const updateTribeMessageContent = jest.fn();
const createMessageImageUpload = jest.fn();
const deleteMessageImage = jest.fn();
const submitMessagePollVote = jest.fn();
const listTribeChannels = jest.fn();
const createTribeChannel = jest.fn();
const updateTribeChannel = jest.fn();
const deleteTribeChannel = jest.fn();
const loggerError = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
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

function buildJsonRequest(body: Record<string, unknown> = {}): Request {
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

function buildImageRouteContext(assetId: string) {
  return {
    params: Promise.resolve({
      assetId,
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
    listMessageReplies.mockReset();
    listMessageLikers.mockReset();
    toggleMessageLike.mockReset();
    toggleMessagePin.mockReset();
    deleteTribeMessage.mockReset();
    updateTribeMessageContent.mockReset();
    createMessageImageUpload.mockReset();
    deleteMessageImage.mockReset();
    submitMessagePollVote.mockReset();
    listTribeChannels.mockReset();
    createTribeChannel.mockReset();
    updateTribeChannel.mockReset();
    deleteTribeChannel.mockReset();
    (revalidateTag as jest.Mock).mockReset();
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
          listMessageReplies,
          listMessageLikers,
          deleteTribeChannel,
          listTribeChannels,
          toggleMessageLike,
          toggleMessagePin,
          deleteTribeMessage,
          updateTribeMessageContent,
          createMessageImageUpload,
          deleteMessageImage,
          submitMessagePollVote,
          updateTribeChannel,
        },
      },
    });
    (createServerLogger as jest.Mock).mockReturnValue({
      error: loggerError,
      info: jest.fn(),
    });
    loggerError.mockReset();
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
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("passes optional poll data when creating a tribe message", async () => {
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
        poll: {
          allowMultipleVotes: true,
          id: "poll-1",
          options: [],
          totalVoteCount: 0,
          viewerHasVoted: false,
        },
      },
      status: "created",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera mensaje",
        channelId: "channel-ronda",
        title: "Anuncio inicial",
        poll: {
          allowMultipleVotes: true,
          options: ["Álgebra", "Geometría"],
        },
      } as never),
      buildCreateRouteContext()
    );

    expect(response.status).toBe(201);
    expect(createTribeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: {
          allowMultipleVotes: true,
          options: ["Álgebra", "Geometría"],
        },
      })
    );
  });

  it("passes image attachments when creating a tribe message", async () => {
    createTribeMessage.mockResolvedValue({
      message: {
        id: "message-1",
        images: [
          {
            altText: "",
            id: "asset-1",
            url: "https://imagedelivery.net/account-hash/image-1/public",
          },
        ],
      },
      status: "created",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        channelId: "channel-ronda",
        content: "Primera mensaje",
        images: [{ assetId: "asset-1" }],
        title: "Anuncio inicial",
      }),
      buildCreateRouteContext()
    );

    expect(response.status).toBe(201);
    expect(createTribeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ assetId: "asset-1" }],
      })
    );
  });

  it("creates a direct image upload for the authenticated member", async () => {
    createMessageImageUpload.mockResolvedValue({
      assetId: "asset-1",
      imageId: "cloudflare-image-1",
      status: "created",
      uploadUrl: "https://upload.imagedelivery.net/direct-upload",
    });

    const response = await POST_MESSAGE_IMAGE_UPLOAD(
      buildJsonRequest(),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      assetId: "asset-1",
      imageId: "cloudflare-image-1",
      uploadUrl: "https://upload.imagedelivery.net/direct-upload",
    });
    expect(createMessageImageUpload).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("updates a message image list through the message edit route", async () => {
    updateTribeMessageContent.mockResolvedValue({
      content: "Mensaje editado",
      images: [
        {
          altText: "",
          id: "asset-2",
          url: "https://imagedelivery.net/account-hash/image-2/public",
        },
      ],
      messageId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
      status: "updated",
      title: "Titulo editado",
    });

    const response = await PATCH_MESSAGE(
      buildJsonRequest({
        content: "Mensaje editado",
        images: [{ assetId: "asset-2" }],
        title: "Titulo editado",
      }),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      images: [{ id: "asset-2" }],
      message: "Mensaje actualizado.",
    });
    expect(updateTribeMessageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ assetId: "asset-2" }],
      })
    );
  });

  it("deletes a message image and revalidates the round cache", async () => {
    deleteMessageImage.mockResolvedValue({
      status: "deleted",
    });

    const response = await DELETE_MESSAGE_IMAGE(
      buildJsonRequest(),
      buildImageRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ message: "Imagen eliminada." });
    expect(deleteMessageImage).toHaveBeenCalledWith({
      assetId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("returns a specific validation message when poll options are duplicated", async () => {
    createTribeMessage.mockResolvedValue({
      status: "invalid_poll",
    });

    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera mensaje",
        channelId: "channel-ronda",
        title: "Anuncio inicial",
        poll: {
          allowMultipleVotes: false,
          options: ["Álgebra", "álgebra"],
        },
      } as never),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message: "Usá opciones distintas para publicar la encuesta.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
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
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("returns a safe validation message when the video payload is malformed", async () => {
    const response = await POST_CREATE(
      buildJsonRequest({
        content: "Primera mensaje",
        channelId: "channel-ronda",
        title: "Anuncio inicial",
        video: {
          url: "",
        },
      }),
      buildCreateRouteContext()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      message:
        "No pudimos reconocer ese link de video. Probá con YouTube, Vimeo, Wistia o Loom.",
    });
    expect(createTribeMessage).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
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
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("returns replies when opening a message detail", async () => {
    listMessageReplies.mockResolvedValue({
      status: "found",
      replies: [
        {
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
      ],
    });

    const response = await GET_REPLIES(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      replies: [
        {
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
      ],
    });
    expect(listMessageReplies).toHaveBeenCalledWith({
      messageId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns a safe loading message when listing replies fails unexpectedly", async () => {
    listMessageReplies.mockRejectedValue(new Error("database unavailable"));

    const response = await GET_REPLIES(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      message: "No pudimos cargar las respuestas. Intentalo de nuevo.",
    });
  });

  it("returns the likers preview and total count when listing likers", async () => {
    listMessageLikers.mockResolvedValue({
      status: "found",
      totalCount: 9,
      likers: [
        {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
      ],
    });

    const response = await GET_LIKERS(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      totalCount: 9,
      likers: [
        {
          id: "member-1",
          name: "Grace Hopper",
          role: "tribemate",
          avatarFallback: "GH",
          image: null,
        },
      ],
    });
    expect(listMessageLikers).toHaveBeenCalledWith({
      messageId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
      tribeSlug: "matematica-pro",
      viewerId: "member-1",
    });
  });

  it("returns not found when likers messageId is not a UUID", async () => {
    const response = await GET_LIKERS(
      buildJsonRequest(),
      buildRouteContext("not-a-uuid")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "No pudimos encontrar el mensaje.",
    });
    expect(listMessageLikers).not.toHaveBeenCalled();
  });

  it("hides likers when listing is forbidden", async () => {
    listMessageLikers.mockResolvedValue({ status: "forbidden" });

    const response = await GET_LIKERS(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      message: "No tenes permisos para ver las reacciones de este mensaje.",
    });
  });

  it("returns a safe loading message when listing likers fails unexpectedly", async () => {
    listMessageLikers.mockRejectedValue(new Error("database unavailable"));

    const response = await GET_LIKERS(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      message: "No pudimos cargar las reacciones. Intentalo de nuevo.",
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
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("does not expose like state when the like toggle is forbidden", async () => {
    toggleMessageLike.mockResolvedValue({
      status: "forbidden",
    });

    const response = await POST_LIKE(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      message: "No tenes permisos para reaccionar a esta mensaje.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
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
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("returns a safe warning when the pin limit is reached", async () => {
    toggleMessagePin.mockResolvedValue({
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

  it("does not expose pin state when the pin toggle is forbidden", async () => {
    toggleMessagePin.mockResolvedValue({
      status: "forbidden",
    });

    const response = await POST_PIN(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      message: "No tenes permisos para pinear este mensaje.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("keeps independent poll updates inaccessible", async () => {
    const response = await PATCH_POLL(
      buildJsonRequest({
        allowMultipleVotes: false,
        options: ["Álgebra", "Geometría"],
        resetVotes: true,
      } as never),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "La encuesta forma parte del mensaje.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("submits a poll vote and returns updated poll results", async () => {
    submitMessagePollVote.mockResolvedValue({
      poll: {
        allowMultipleVotes: false,
        id: "poll-1",
        options: [
          {
            id: "option-1",
            percentage: 100,
            selectedByViewer: true,
            text: "Álgebra",
            voteCount: 1,
          },
        ],
        totalVoteCount: 1,
        viewerHasVoted: true,
      },
      status: "voted",
    });

    const response = await POST_POLL_VOTE(
      buildJsonRequest({
        optionIds: ["option-1"],
      } as never),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      message: "Voto registrado.",
      poll: {
        id: "poll-1",
        viewerHasVoted: true,
      },
    });
    expect(submitMessagePollVote).toHaveBeenCalledWith({
      messageId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
      optionIds: ["option-1"],
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
  });

  it("returns a safe poll voting message when the vote use case fails unexpectedly", async () => {
    submitMessagePollVote.mockRejectedValue(new Error("database unavailable"));

    const response = await POST_POLL_VOTE(
      buildJsonRequest({
        optionIds: ["option-1"],
      } as never),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      message: "No pudimos registrar tu voto. Intentalo de nuevo.",
    });
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Message poll vote failed",
        metadata: {
          messageId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
          slug: "matematica-pro",
          viewerId: "member-1",
        },
      })
    );
  });

  it("deletes a full message and revalidates the round cache", async () => {
    deleteTribeMessage.mockResolvedValue({
      status: "deleted",
    });

    const response = await DELETE_MESSAGE(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: "Mensaje eliminado.",
    });
    expect(deleteTribeMessage).toHaveBeenCalledWith({
      messageId: "7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2",
      tribeSlug: "matematica-pro",
      userId: "member-1",
    });
    expect(revalidateTag).toHaveBeenCalledWith(
      "tribe-round:matematica-pro",
      { expire: 0 }
    );
  });

  it("keeps independent poll deletion inaccessible", async () => {
    const response = await DELETE_POLL(
      buildJsonRequest(),
      buildRouteContext("7a7850d3-8d4a-4ae9-ac94-6589c6a4d1e2")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      message: "La encuesta forma parte del mensaje.",
    });
    expect(deleteTribeMessage).not.toHaveBeenCalled();
  });
});
