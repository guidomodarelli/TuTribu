import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import TribeCoursesPage from "@/app/(platform)/[slug]/cursos/page";
import TribeCoursesManagePage from "@/app/(platform)/[slug]/cursos/gestionar/page";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const getTribePageAccess = jest.fn();
const getCurrentTribeMembershipStatus = jest.fn();
const getMemberTribes = jest.fn();
const getTribeCourses = jest.fn();
const getEditableTribeCourses = jest.fn();
const infoMock = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/components/courses/tribe-courses-view", () => ({
  TribeCoursesView: ({
    modules,
    tribeSlug,
    viewerPermissions,
  }: {
    modules: unknown[];
    tribeSlug: string;
    viewerPermissions: { canManageCourses: boolean };
  }) => (
    <section>
      <h1>Cursos</h1>
      <p>{tribeSlug}</p>
      <p>modules:{modules.length}</p>
      <p data-testid="course-management-permission">
        canManageCourses:{String(viewerPermissions.canManageCourses)}
      </p>
    </section>
  ),
}));

jest.mock("@/components/courses/tribe-courses-management", () => ({
  TribeCoursesManagement: ({
    initialModules,
    tribeSlug,
  }: {
    initialModules: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestionar cursos</h1>
      <p>{tribeSlug}</p>
      <p>modules:{initialModules.length}</p>
    </section>
  ),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

jest.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: jest.fn(() => ({
      error: errorMock,
      info: infoMock,
    })),
  })
);

const authenticatedMember = {
  avatarFallback: "GH",
  email: "leader@example.com",
  id: "member-1",
  image: null,
  name: "Grace Hopper",
  role: "tribemate",
};

const visibleTribeAccess = {
  status: "visible",
  tribe: {
    id: "tribe-1",
    name: "Matematica Pro",
    slug: "matematica-pro",
    visibility: "private",
  },
};

function buildPageProps() {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
    searchParams: Promise.resolve({}),
  };
}

describe("tribe courses pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockResolvedValue(authenticatedMember);
    getTribePageAccess.mockResolvedValue(visibleTribeAccess);
    getCurrentTribeMembershipStatus.mockResolvedValue("active");
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "leader",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    getTribeCourses.mockResolvedValue({
      modules: [],
      viewerPermissions: { canManageCourses: false },
    });
    getEditableTribeCourses.mockResolvedValue({
      modules: [],
      viewerPermissions: { canManageCourses: false },
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      courses: {
        useCases: {
          getEditableTribeCourses,
          getTribeCourses,
        },
      },
      tribes: {
        useCases: {
          getCurrentTribeMembershipStatus,
          getMemberTribes,
          getTribePageAccess,
        },
      },
    });
  });

  it("marks active leaders as course managers when the course tree is empty", async () => {
    render(await TribeCoursesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Cursos" })).toBeInTheDocument();
    expect(screen.getByTestId("course-management-permission")).toHaveTextContent(
      "canManageCourses:true"
    );
  });

  it("keeps regular members from managing an empty course tree", async () => {
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);

    render(await TribeCoursesPage(buildPageProps()));

    expect(screen.getByTestId("course-management-permission")).toHaveTextContent(
      "canManageCourses:false"
    );
  });

  it("renders the management page for active leaders even before courses exist", async () => {
    render(await TribeCoursesManagePage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Gestionar cursos" })
    ).toBeInTheDocument();
    expect(screen.getByText("modules:0")).toBeInTheDocument();
  });

  it("returns 404 when a regular member opens the course management page", async () => {
    getMemberTribes.mockResolvedValue([
      {
        membershipStatus: "active",
        name: "Matematica Pro",
        role: "tribemate",
        slug: "matematica-pro",
        tribeId: "tribe-1",
      },
    ]);
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(TribeCoursesManagePage(buildPageProps())).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );

    expect(notFound).toHaveBeenCalled();
  });
});
