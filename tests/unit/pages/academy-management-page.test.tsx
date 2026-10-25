import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeAcademyManagementPage from "@/app/(platform)/[slug]/academia/gestionar/page";
import type { AcademyManagementProps } from "@/components/academy/academy-management";
import { createRequestModules } from "@/src/modules/setup";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { renderServerComponent } from "@/tests/render-server-component";

const getAuthenticatedMember = vi.fn();
const getTribePageAccess = vi.fn();
const listAcademyMembers = vi.fn();
const listVerificationReviewQueue = vi.fn();
const getAcademySettings = vi.fn();
const listVerificationProviders = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

// Server-page test: the client island is replaced by a summary of the props the page hands it.
vi.mock("@/components/academy/academy-management", () => ({
  AcademyManagement: ({ providers, settings, viewerRole }: AcademyManagementProps) => (
    <section>
      <h1>Gestionar academia</h1>
      <p>rol: {viewerRole}</p>
      <p>configuración: {settings ? settings.title : "sin configuración"}</p>
      <p>proveedores: {providers ? providers.map((provider) => provider.displayName).join(", ") : "sin proveedores"}</p>
    </section>
  ),
}));

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock("@/src/modules/shared/infrastructure/observability/server-logger", () => ({
  createServerLogger: vi.fn(),
}));

const TRIBE_SLUG = "matematica-pro";

const settings = {
  accessModel: "academy" as const,
  admissionEnabled: true,
  benefits: ["Clases en vivo"],
  configVersion: 2,
  description: "Todo el contenido de la tribu.",
  offerVersion: 1,
  salesEnabled: true,
  title: "Academia de matemática",
};

const activeProvider = {
  displayName: "Campus",
  id: "1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  instructions: "Mostrá tu credencial.",
  isActive: true,
  key: "campus",
  linkUrl: null,
};

const inactiveProvider = {
  ...activeProvider,
  displayName: "Formulario anterior",
  id: "2e3d4c5b-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  isActive: false,
  key: "legacy-form",
};

function membersPage(viewerRole: "guardian" | "leader") {
  return { page: { members: [], total: 0, viewerRole }, status: "ok" as const };
}

function renderPage() {
  return renderServerComponent(<TribeAcademyManagementPage params={Promise.resolve({ slug: TRIBE_SLUG })} />);
}

describe("TribeAcademyManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue({ id: "member-1", name: "Grace Hopper" });
    getTribePageAccess.mockResolvedValue({
      status: "visible",
      tribe: { id: "tribe-1", name: "Matemática Pro", slug: TRIBE_SLUG, visibility: "private" },
    });
    listAcademyMembers.mockResolvedValue(membersPage("leader"));
    listVerificationReviewQueue.mockResolvedValue({ items: [], total: 0 });
    getAcademySettings.mockResolvedValue(settings);
    listVerificationProviders.mockResolvedValue([activeProvider, inactiveProvider]);
    (headers as Mock).mockResolvedValue(new Headers());
    (createServerLogger as Mock).mockReturnValue({ error: vi.fn(), info: vi.fn() });
    (createRequestModules as Mock).mockResolvedValue({
      auth: { useCases: { getAuthenticatedMember } },
      memberVerifications: { useCases: { listVerificationProviders, listVerificationReviewQueue } },
      productAccess: { useCases: { getAcademySettings, listAcademyMembers } },
      tribes: { useCases: { getTribePageAccess } },
    });
  });

  it("gives a leader the offer settings and every provider, inactive ones included", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Gestionar academia" })).toBeInTheDocument();
    expect(screen.getByText("configuración: Academia de matemática")).toBeInTheDocument();
    expect(screen.getByText("proveedores: Campus, Formulario anterior")).toBeInTheDocument();
    expect(listVerificationProviders).toHaveBeenCalledWith({ includeInactive: true, tribeSlug: TRIBE_SLUG });
  });

  it("never hands a guardian the settings or the providers, even when the reads answer something", async () => {
    listAcademyMembers.mockResolvedValue(membersPage("guardian"));
    getAcademySettings.mockResolvedValue(null);
    listVerificationProviders.mockResolvedValue([activeProvider]);

    await renderPage();

    expect(screen.getByText("rol: guardian")).toBeInTheDocument();
    expect(screen.getByText("configuración: sin configuración")).toBeInTheDocument();
    expect(screen.getByText("proveedores: sin proveedores")).toBeInTheDocument();
  });

  it("asks for the settings and the providers without waiting for the members and the queue", async () => {
    let finishMembers!: (value: ReturnType<typeof membersPage>) => void;
    listAcademyMembers.mockReturnValue(new Promise((resolve) => { finishMembers = resolve; }));

    const pendingPage = renderPage();
    await vi.waitFor(() => expect(listAcademyMembers).toHaveBeenCalled());

    expect(getAcademySettings).toHaveBeenCalledWith({ tribeSlug: TRIBE_SLUG });
    expect(listVerificationProviders).toHaveBeenCalled();

    finishMembers(membersPage("leader"));
    await pendingPage;
    expect(screen.getByText("configuración: Academia de matemática")).toBeInTheDocument();
  });

  it("returns 404 when the viewer cannot manage the academy", async () => {
    listAcademyMembers.mockResolvedValue({ status: "forbidden" });
    (notFound as unknown as Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
