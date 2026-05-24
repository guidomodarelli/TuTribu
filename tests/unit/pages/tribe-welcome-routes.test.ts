import {
  GET,
  PUT,
} from "@/app/api/tribes/[slug]/welcome/route";
import { createRequestModules } from "@/src/modules/setup";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getTribeWelcome = jest.fn();
const saveTribeWelcome = jest.fn();

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

const DEFAULT_SELECTION_MODAL_PAYLOAD = {
  linksHeading: "Recursos para empezar",
  selectionModalBenefit: null,
  selectionModalDescription:
    "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
  selectionModalTitle: "Elegí una opción para empezar",
};

function buildRequest(body: unknown = {}): Request {
  const mergedBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? { ...DEFAULT_SELECTION_MODAL_PAYLOAD, ...(body as Record<string, unknown>) }
      : body;

  return {
    headers: new Headers(),
    json: jest.fn(async () => mergedBody),
    method: "PUT",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/welcome",
  } as unknown as Request;
}

function buildContext() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("Tribe welcome routes", () => {
  const welcome = {
    linksHeading: "Recursos para empezar",
    links: [
      {
        badgeLabel: "Soporte",
        id: "link-1",
        isActive: true,
        label: "Grupo de soporte",
        message: null,
        phoneNumber: null,
        sortOrder: 1,
        type: TRIBE_WELCOME_LINK_TYPE.customButton,
        url: "https://soporte.example.com",
      },
    ],
    rules: [
      {
        id: "rule-1",
        isActive: true,
        label: "Presentate al entrar",
        sortOrder: 1,
      },
    ],
    selectionModalBenefit: null,
    selectionModalDescription:
      "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
    selectionModalTitle: "Elegí una opción para empezar",
    welcomeMessage: "Bienvenido/a a la tribu",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "leader@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    getTribePageAccess.mockResolvedValue({
      status: TRIBE_PAGE_ACCESS_STATUS.visible,
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getTribeWelcome.mockResolvedValue(welcome);
    saveTribeWelcome.mockResolvedValue({ status: "updated" });
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      tribes: {
        useCases: {
          getTribePageAccess,
          getTribeWelcome,
          saveTribeWelcome,
        },
      },
    });
  });

  it("returns the welcome configuration for authenticated members", async () => {
    const response = await GET(buildRequest(), buildContext());

    expect(response.status).toBe(200);
    expect(getTribePageAccess).toHaveBeenCalledWith({
      isAuthenticated: true,
      slug: "matematica-pro",
    });
    expect(getTribeWelcome).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    await expect(response.json()).resolves.toEqual({
      welcome,
    });
  });

  it("returns not found when authenticated members cannot see the tribe welcome", async () => {
    getTribePageAccess.mockResolvedValue({
      reason: TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible,
      status: TRIBE_PAGE_ACCESS_STATUS.hidden,
    });

    const response = await GET(buildRequest(), buildContext());

    expect(response.status).toBe(404);
    expect(getTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "No pudimos encontrar la tribu.",
    });
  });

  it("returns forbidden when blocked members try to load the tribe welcome", async () => {
    getTribePageAccess.mockResolvedValue({
      blockedReason: "conduct_blocked",
      reason: TRIBE_PAGE_ACCESS_REASON.blockedHidden,
      status: TRIBE_PAGE_ACCESS_STATUS.hidden,
    });

    const response = await GET(buildRequest(), buildContext());

    expect(response.status).toBe(403);
    expect(getTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "No tenés acceso a esta bienvenida.",
    });
  });

  it("saves leader welcome edits with safe response copy", async () => {
    const response = await PUT(
      buildRequest({
        links: [],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(saveTribeWelcome).toHaveBeenCalledWith({
      linksHeading: "Recursos para empezar",
      links: [],
      rules: [],
      selectionModalBenefit: null,
      selectionModalDescription:
        "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
      selectionModalTitle: "Elegí una opción para empezar",
      tribeSlug: "matematica-pro",
      welcomeMessage: "Bienvenido/a",
    });
    await expect(response.json()).resolves.toEqual({
      message: "Bienvenida actualizada.",
    });
  });

  it("normalizes legacy link types to custom buttons before saving", async () => {
    const response = await PUT(
      buildRequest({
        links: [
          {
            badgeLabel: "Soporte",
            id: "11111111-1111-4111-8111-111111111111",
            isActive: true,
            label: "Soporte",
            sortOrder: 1,
            type: "support_link",
            url: "https://soporte.example.com",
          },
        ],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(200);
    expect(saveTribeWelcome).toHaveBeenCalledWith({
      linksHeading: "Recursos para empezar",
      links: [
        expect.objectContaining({
          type: TRIBE_WELCOME_LINK_TYPE.customButton,
        }),
      ],
      rules: [],
      selectionModalBenefit: null,
      selectionModalDescription:
        "Elegí una opción para empezar. Cualquiera te da acceso a los recursos del grupo. Podés cerrar y elegir más tarde.",
      selectionModalTitle: "Elegí una opción para empezar",
      tribeSlug: "matematica-pro",
      welcomeMessage: "Bienvenido/a",
    });
  });

  it("rejects invalid welcome payloads before saving", async () => {
    const response = await PUT(
      buildRequest({
        links: [
          {
            badgeLabel: "WhatsApp",
            isActive: true,
            label: "WhatsApp",
            phoneNumber: "",
            sortOrder: 1,
            type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
          },
        ],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Completá el teléfono de WhatsApp para guardar ese botón.",
    });
  });

  it("rejects links without a badge label before saving", async () => {
    const response = await PUT(
      buildRequest({
        links: [
          {
            badgeLabel: " ",
            id: "11111111-1111-4111-8111-111111111111",
            isActive: true,
            label: "Soporte",
            sortOrder: 1,
            type: TRIBE_WELCOME_LINK_TYPE.customButton,
            url: "https://soporte.example.com",
          },
        ],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Revisá los campos de la bienvenida antes de guardar.",
    });
  });

  it("rejects links with badge labels that exceed the database limit", async () => {
    const response = await PUT(
      buildRequest({
        links: [
          {
            badgeLabel: "Un badge demasiado largo para guardar",
            id: "11111111-1111-4111-8111-111111111111",
            isActive: true,
            label: "Soporte",
            sortOrder: 1,
            type: TRIBE_WELCOME_LINK_TYPE.customButton,
            url: "https://soporte.example.com",
          },
        ],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Revisá los campos de la bienvenida antes de guardar.",
    });
  });

  it("rejects WhatsApp links without normalized phone digits", async () => {
    const response = await PUT(
      buildRequest({
        links: [
          {
            badgeLabel: "WhatsApp",
            isActive: true,
            label: "WhatsApp",
            phoneNumber: "sin digitos",
            sortOrder: 1,
            type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
          },
        ],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Completá el teléfono de WhatsApp para guardar ese botón.",
    });
  });

  it("rejects WhatsApp links with invalid international phone format", async () => {
    const response = await PUT(
      buildRequest({
        links: [
          {
            badgeLabel: "WhatsApp",
            isActive: true,
            label: "WhatsApp",
            phoneNumber: "123",
            sortOrder: 1,
            type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
          },
        ],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message:
        "Ingresá un número válido en formato internacional (ej.: +54 9 11 1234 5678).",
    });
  });

  it("rejects null welcome collection items before saving", async () => {
    const response = await PUT(
      buildRequest({
        links: [null],
        rules: [null],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Revisá los campos de la bienvenida antes de guardar.",
    });
  });

  it("rejects non-object welcome payloads before saving", async () => {
    const response = await PUT(buildRequest(null), buildContext());

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Revisá los campos de la bienvenida antes de guardar.",
    });
  });

  it("rejects malformed welcome item ids before saving", async () => {
    const response = await PUT(
      buildRequest({
        links: [
          {
            id: "link-1",
            isActive: true,
            label: "Soporte",
            sortOrder: 1,
            type: TRIBE_WELCOME_LINK_TYPE.customButton,
            url: "https://soporte.example.com",
          },
        ],
        rules: [
          {
            id: "rule-1",
            isActive: true,
            label: "Presentate al entrar",
            sortOrder: 1,
          },
        ],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(400);
    expect(saveTribeWelcome).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: "Revisá los campos de la bienvenida antes de guardar.",
    });
  });

  it("returns a forbidden response when the member is not the leader", async () => {
    saveTribeWelcome.mockResolvedValue({ status: "forbidden" });

    const response = await PUT(
      buildRequest({
        links: [],
        rules: [],
        welcomeMessage: "Bienvenido/a",
      }),
      buildContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Solo el líder puede editar la bienvenida.",
    });
  });
});
