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

jest.mock("@/components/courses/tribe-courses-catalog", () => ({
  TribeCoursesCatalog: ({
    courses,
    tribeSlug,
    viewerPermissions,
  }: {
    courses: unknown[];
    tribeSlug: string;
    viewerPermissions: { canManageCourses: boolean };
  }) => (
    <section>
      <h1>Cursos</h1>
      <p>{tribeSlug}</p>
      <p>courses:{courses.length}</p>
      <p data-testid="course-management-permission">
        canManageCourses:{String(viewerPermissions.canManageCourses)}
      </p>
    </section>
  ),
}));

jest.mock("@/components/courses/tribe-courses-view", () => ({
  TribeCoursesView: ({
    course,
    selectedLessonId,
    tribeSlug,
  }: {
    course: { id: string; title: string };
    selectedLessonId: string | null;
    tribeSlug: string;
  }) => (
    <section>
      <h1>Curso: {course.title}</h1>
      <p>{tribeSlug}</p>
      <p>lesson:{selectedLessonId ?? "none"}</p>
    </section>
  ),
}));

jest.mock("@/components/courses/tribe-courses-catalog-management", () => ({
  TribeCoursesCatalogManagement: ({
    initialCourses,
    tribeSlug,
  }: {
    initialCourses: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestionar cursos</h1>
      <p>{tribeSlug}</p>
      <p>courses:{initialCourses.length}</p>
    </section>
  ),
}));

jest.mock("@/components/courses/tribe-courses-management", () => ({
  TribeCoursesManagement: ({
    courseTitle,
    initialModules,
    tribeSlug,
  }: {
    courseTitle: string;
    initialModules: unknown[];
    tribeSlug: string;
  }) => (
    <section>
      <h1>Gestionar contenido: {courseTitle}</h1>
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

const courseFixture = {
  coverImageUrl: null,
  description: null,
  id: "course-1",
  isActive: true,
  lastViewedLessonId: null,
  modules: [
    {
      courseId: "course-1",
      id: "module-1",
      isActive: true,
      lessons: [
        {
          completed: false,
          courseModuleId: "module-1",
          description: null,
          externalVideoId: "video-1",
          id: "lesson-1",
          isActive: true,
          sortOrder: 0,
          title: "Primera clase",
          videoProvider: "youtube",
        },
      ],
      sortOrder: 0,
      title: "Módulo inicial",
      unlockAfterDays: null,
      viewerAccess: { isLocked: false, unlocksAt: null },
    },
  ],
  sortOrder: 0,
  title: "Inversiones",
};

function buildPageProps(searchParams: Record<string, string> = {}) {
  return {
    params: Promise.resolve({
      slug: "matematica-pro",
    }),
    searchParams: Promise.resolve(searchParams),
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
      courses: [],
      viewerPermissions: { canManageCourses: false },
    });
    getEditableTribeCourses.mockResolvedValue({
      courses: [],
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

  it("marks active leaders as course managers on the empty catalog", async () => {
    render(await TribeCoursesPage(buildPageProps()));

    expect(screen.getByRole("heading", { name: "Cursos" })).toBeInTheDocument();
    expect(screen.getByTestId("course-management-permission")).toHaveTextContent(
      "canManageCourses:true"
    );
  });

  it("keeps regular members from managing an empty catalog", async () => {
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

  it("renders the course view when the curso query param matches a course", async () => {
    getTribeCourses.mockResolvedValue({
      courses: [courseFixture],
      viewerPermissions: { canManageCourses: false },
    });

    render(await TribeCoursesPage(buildPageProps({ curso: "course-1" })));

    expect(
      screen.getByRole("heading", { name: "Curso: Inversiones" })
    ).toBeInTheDocument();
  });

  it("resolves legacy lesson links to the course that owns the lesson", async () => {
    getTribeCourses.mockResolvedValue({
      courses: [courseFixture],
      viewerPermissions: { canManageCourses: false },
    });

    render(await TribeCoursesPage(buildPageProps({ leccion: "lesson-1" })));

    expect(
      screen.getByRole("heading", { name: "Curso: Inversiones" })
    ).toBeInTheDocument();
    expect(screen.getByText("lesson:lesson-1")).toBeInTheDocument();
  });

  it("returns 404 when the curso query param does not match a course", async () => {
    (notFound as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(
      TribeCoursesPage(buildPageProps({ curso: "missing-course" }))
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("renders the course catalog management page for active leaders", async () => {
    render(await TribeCoursesManagePage(buildPageProps()));

    expect(
      screen.getByRole("heading", { name: "Gestionar cursos" })
    ).toBeInTheDocument();
    expect(screen.getByText("courses:0")).toBeInTheDocument();
  });

  it("renders the module management page scoped to the selected course", async () => {
    getEditableTribeCourses.mockResolvedValue({
      courses: [courseFixture],
      viewerPermissions: { canManageCourses: true },
    });

    render(
      await TribeCoursesManagePage(buildPageProps({ curso: "course-1" }))
    );

    expect(
      screen.getByRole("heading", { name: "Gestionar contenido: Inversiones" })
    ).toBeInTheDocument();
    expect(screen.getByText("modules:1")).toBeInTheDocument();
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
