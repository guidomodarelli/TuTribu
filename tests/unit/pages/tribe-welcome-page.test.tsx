import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeWelcomePage from "@/app/(platform)/tribu/[slug]/bienvenida/page";
import { createRequestModules } from "@/src/modules/setup";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const getTribeWelcome = jest.fn();
const getEditableTribeWelcome = jest.fn();
const listTribeWelcomeSelections = jest.fn();
const listCurrentMemberTribeWelcomeSelections = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/tribes/tribe-welcome-management", () => ({
  TribeWelcomeManagement: ({
    canRecordSelections,
    canEdit,
    welcome,
  }: {
    canRecordSelections: boolean;
    canEdit: boolean;
    welcome: { welcomeMessage: string };
  }) => (
    <section>
      <h1>Bienvenida</h1>
      <p>{welcome.welcomeMessage}</p>
      <p>{canEdit ? "Modo edición" : "Solo lectura"}</p>
      <p>{canRecordSelections ? "Registra selecciones" : "No registra selecciones"}</p>
    </section>
  ),
}));

jest.mock("@/components/tribes/tribe-welcome-selection-modal", () => ({
  TribeWelcomeSelectionModal: ({
    links,
    open,
  }: {
    links: Array<{ id: string; label: string }>;
    open: boolean;
  }) => (
    <div>
      <p>{open ? "Modal abierta" : "Modal cerrada"}</p>
      <ul>
        {links.map((link) => (
          <li key={link.id}>{link.label}</li>
        ))}
      </ul>
    </div>
  ),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(() => ({
      error: mockLoggerError,
      info: jest.fn(),
    })),
  })
);

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
  };
}

describe("TribeWelcomePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeWelcome.mockResolvedValue({
      links: [
        {
          badgeLabel: "Instagram",
          description: null,
          id: "link-1",
          isActive: true,
          label: "Instagram",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: TRIBE_WELCOME_LINK_TYPE.customButton,
          url: "https://instagram.example.com",
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
      linksHeading: "Recursos para empezar",
      selectionModalBenefit: null,
      selectionModalDescription:
        "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
      selectionModalTitle: "Elegí cómo querés empezar",
      welcomeMessage: "Bienvenido/a a Matematica Pro",
    });
    getEditableTribeWelcome.mockResolvedValue({
      linksHeading: "Recursos para empezar",
      links: [],
      rules: [],
      selectionModalBenefit: null,
      selectionModalDescription:
        "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
      selectionModalTitle: "Elegí cómo querés empezar",
      welcomeMessage: "Bienvenido/a a Matematica Pro",
    });
    listTribeWelcomeSelections.mockResolvedValue([]);
    listCurrentMemberTribeWelcomeSelections.mockResolvedValue([]);
    (headers as jest.Mock).mockResolvedValue(
      new Headers({
        host: "tutribu.example.com",
        "x-forwarded-proto": "https",
      })
    );
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember: jest.fn(async () => ({
            avatarFallback: "GH",
            email: "leader@example.com",
            id: "member-1",
            image: null,
            name: "Grace Hopper",
            role: "tribemate",
          })),
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getEditableTribeWelcome,
          getMemberTribes,
          getTribePageAccess,
          getTribeWelcome,
          listCurrentMemberTribeWelcomeSelections,
          listTribeWelcomeSelections,
        },
      },
    });
  });

  it("renders the internal welcome page in edit mode for leaders", async () => {
    render(await TribeWelcomePage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Bienvenida" })).toBeInTheDocument();
    expect(screen.getByText("Bienvenido/a a Matematica Pro")).toBeInTheDocument();
    expect(screen.getByText("Modo edición")).toBeInTheDocument();
    expect(getEditableTribeWelcome).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    expect(getTribeWelcome).not.toHaveBeenCalled();
    expect(listCurrentMemberTribeWelcomeSelections).not.toHaveBeenCalled();
  });

  it("loads only current member welcome selections for the selection modal", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeWelcomePage(buildPageProps()));

    expect(listCurrentMemberTribeWelcomeSelections).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    expect(listTribeWelcomeSelections).not.toHaveBeenCalled();
  });

  it("renders the internal welcome page as read-only for tribemates", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeWelcomePage(buildPageProps()));

    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(getTribeWelcome).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    expect(getEditableTribeWelcome).not.toHaveBeenCalled();
  });

  it("keeps the selection modal open with every active link even when the viewer already accessed some", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeWelcome.mockResolvedValueOnce({
      links: [
        {
          badgeLabel: "Instagram",
          description: null,
          id: "link-1",
          isActive: true,
          label: "Instagram",
          message: null,
          phoneNumber: null,
          sortOrder: 1,
          type: TRIBE_WELCOME_LINK_TYPE.customButton,
          url: "https://instagram.example.com",
        },
        {
          badgeLabel: "WhatsApp",
          description: null,
          id: "link-2",
          isActive: true,
          label: "WhatsApp",
          message: null,
          phoneNumber: "+5491155555555",
          sortOrder: 2,
          type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
          url: null,
        },
      ],
      linksHeading: "Recursos para empezar",
      rules: [],
      selectionModalBenefit: null,
      selectionModalDescription:
        "Tocá la opción que más te sirva. Con cualquiera obtenés acceso a los recursos del grupo. Si necesitás más tiempo, podés cerrar y volver más tarde.",
      selectionModalTitle: "Elegí cómo querés empezar",
      welcomeMessage: "Bienvenido/a a Matematica Pro",
    });
    listCurrentMemberTribeWelcomeSelections.mockResolvedValue([
      {
        selectedAt: new Date("2026-05-22T12:00:00.000Z"),
        userId: "member-1",
        welcomeLinkId: "link-1",
      },
      {
        selectedAt: new Date("2026-05-22T13:00:00.000Z"),
        userId: "member-1",
        welcomeLinkId: "link-1",
      },
    ]);

    render(await TribeWelcomePage(buildPageProps()));

    expect(screen.getByText("Modal abierta")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
  });

  it("opens the selection modal when previous selections belong to inactive links", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listCurrentMemberTribeWelcomeSelections.mockResolvedValue([
      {
        selectedAt: new Date("2026-05-22T12:00:00.000Z"),
        userId: "member-1",
        welcomeLinkId: "inactive-link",
      },
    ]);

    render(await TribeWelcomePage(buildPageProps()));

    expect(screen.getByText("Modal abierta")).toBeInTheDocument();
  });

  it("keeps the selection modal closed when selection lookup fails", async () => {
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    listCurrentMemberTribeWelcomeSelections.mockRejectedValue(
      new Error("Connection lost")
    );

    render(await TribeWelcomePage(buildPageProps()));

    expect(screen.getByText("Modal cerrada")).toBeInTheDocument();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Failed to resolve tribe welcome selections",
        metadata: expect.objectContaining({
          slug: "matematica-pro",
          viewerId: "member-1",
        }),
      })
    );
  });

  it("renders muted leaders in read-only mode", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("muted");
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeWelcomePage(buildPageProps()));

    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(getTribeWelcome).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
    expect(getEditableTribeWelcome).not.toHaveBeenCalled();
  });

  it("renders the internal welcome page as read-only for muted members", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("muted");
    getMemberTribes.mockResolvedValue([
      {
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeWelcomePage(buildPageProps()));

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(screen.getByText("No registra selecciones")).toBeInTheDocument();
    expect(screen.getByText("Modal cerrada")).toBeInTheDocument();
    expect(getTribeWelcome).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("returns 404 when the current member cannot access the tribe", async () => {
    getCurrentTribeMembershipStatus.mockResolvedValue("blocked");
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeWelcomePage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(getTribeWelcome).not.toHaveBeenCalled();
  });
});
