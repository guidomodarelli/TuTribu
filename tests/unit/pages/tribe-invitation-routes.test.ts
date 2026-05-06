import {
  GET,
  POST,
} from "@/app/api/tribes/[slug]/invitations/route";
import { DELETE } from "@/app/api/tribes/[slug]/invitations/[invitationId]/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const listTribeInvitations = jest.fn();
const createTribeInvitation = jest.fn();
const revokeTribeInvitation = jest.fn();

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
    })),
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

function buildRequest(): Request {
  return {
    headers: new Headers(),
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/invitations",
  } as unknown as Request;
}

function buildTribeContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

function buildInvitationContext() {
  return {
    params: Promise.resolve({
      invitationId: "invitation-1",
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe invitation routes", () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  const invitation = {
    createdAt: "2026-04-26T07:00:00.000Z",
    createdByName: "Grace Hopper",
    id: "invitation-1",
    invitationUrl: "https://tutribu.example.com/tribu/matematica-pro/invitar/token",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BETTER_AUTH_URL = "https://canonical.tutribu.example.com";
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
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
      tribes: {
        useCases: {
          createTribeInvitation,
          listTribeInvitations,
          revokeTribeInvitation,
        },
      },
    });
  });

  afterEach(() => {
    if (previousBetterAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
    }
  });

  it("lists active invitations", async () => {
    listTribeInvitations.mockResolvedValue([invitation]);

    const response = await GET(buildRequest(), buildTribeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      invitations: [invitation],
    });
    expect(listTribeInvitations).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("creates an invitation with the configured public app origin", async () => {
    createTribeInvitation.mockResolvedValue({
      invitation,
      invitationUrl:
        "https://canonical.tutribu.example.com/tribu/matematica-pro/invitar/token",
      status: "created",
    });

    const response = await POST(buildRequest(), buildTribeContext());

    expect(response.status).toBe(201);
    expect(createTribeInvitation).toHaveBeenCalledWith({
      baseUrl: "https://canonical.tutribu.example.com",
      tribeSlug: "matematica-pro",
    });
    await expect(response.json()).resolves.toEqual({
      invitation,
      invitationUrl:
        "https://canonical.tutribu.example.com/tribu/matematica-pro/invitar/token",
      message: "Link de invitación creado.",
    });
  });

  it("returns a safe forbidden message when a member cannot create invitations", async () => {
    createTribeInvitation.mockResolvedValue({
      status: "forbidden",
    });

    const response = await POST(buildRequest(), buildTribeContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "No tenés permisos para gestionar invitaciones.",
    });
  });

  it("returns a specific setup message when invitation storage is not migrated", async () => {
    createTribeInvitation.mockResolvedValue({
      status: "setup_required",
    });

    const response = await POST(buildRequest(), buildTribeContext());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message:
        "Las invitaciones todavía no están configuradas. Aplicá la migración de base de datos y volvé a intentar.",
    });
  });

  it("revokes an active invitation", async () => {
    revokeTribeInvitation.mockResolvedValue({
      status: "revoked",
    });

    const response = await DELETE(buildRequest(), buildInvitationContext());

    expect(response.status).toBe(200);
    expect(revokeTribeInvitation).toHaveBeenCalledWith({
      invitationId: "invitation-1",
      tribeSlug: "matematica-pro",
    });
    await expect(response.json()).resolves.toEqual({
      message: "Invitación revocada.",
    });
  });
});
