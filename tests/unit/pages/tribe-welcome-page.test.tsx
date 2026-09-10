import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeWelcomePage from "@/app/(platform)/[slug]/bienvenida/page";
import { createRequestModules } from "@/src/modules/setup";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

const getTribePageAccess = vi.fn();
const getCurrentTribeMembershipStatus = vi.fn();
const getMemberTribes = vi.fn();
const getTribeWelcome = vi.fn();
const getEditableTribeWelcome = vi.fn();
const listTribeWelcomeSelections = vi.fn();
const listCurrentMemberTribeWelcomeSelections = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/components/tribes/tribe-welcome-management", () => ({
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

vi.mock("@/components/tribes/tribe-welcome-selection-modal", () => ({
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

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => ({
      error: mockLoggerError,
      info: vi.fn(),
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
    vi.clearAllMocks();
    getTribePageAccess.mockResolvedValue({
      status: "visible" as const,
      tribe: {
        id: "tribe-1",
        name: "Matematica Pro",
        slug: "matematica-pro",
        visibility: "private",
      },
    });
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      { logoUrl: null, membershipStatus: "active" as const,
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
    (headers as Mock).mockResolvedValue(
      new Headers({
        host: "tutribu.example.com",
        "x-forwarded-proto": "https",
      })
    );
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember: vi.fn(async () => ({
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
      { logoUrl: null, membershipStatus: "active" as const,
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
      { logoUrl: null, membershipStatus: "active" as const,
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
      { logoUrl: null, membershipStatus: "active" as const,
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
      { logoUrl: null, membershipStatus: "active" as const,
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
      { logoUrl: null, membershipStatus: "active" as const,
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
      { logoUrl: null, membershipStatus: "active" as const,
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
      { logoUrl: null, membershipStatus: "active" as const,
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
    (notFound as unknown as Mock).mockImplementation(function () {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeWelcomePage(buildPageProps())).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(getTribeWelcome).not.toHaveBeenCalled();
  });
});
