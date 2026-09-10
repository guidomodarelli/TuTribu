import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import {
  DELETE as DELETE_LESSON,
  PATCH as PATCH_LESSON,
} from "@/app/api/tribes/[slug]/courses/lessons/[lessonId]/route";
import {
  DELETE as DELETE_MODULE,
  PATCH as PATCH_MODULE,
} from "@/app/api/tribes/[slug]/courses/modules/[moduleId]/route";
import { POST as POST_LESSON } from "@/app/api/tribes/[slug]/courses/modules/[moduleId]/lessons/route";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = vi.fn();
const createLesson = vi.fn();
const deleteCourseModule = vi.fn();
const deleteLesson = vi.fn();
const updateCourseModule = vi.fn();
const updateLesson = vi.fn();

const VALID_COURSE_MODULE_ID = "11111111-1111-4111-8111-111111111111";
const VALID_LESSON_ID = "22222222-2222-4222-8222-222222222222";
const INVALID_ID = "not-a-uuid";

vi.mock("@/src/modules/setup", () => ({
  createRequestModules: vi.fn(),
}));

vi.mock(
  "@/src/modules/shared/infrastructure/observability/server-logger",
  () => ({
    createServerLogger: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
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

function buildJsonRequest(body: Record<string, unknown> = {}): Request {
  return {
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    json: async () => body,
    method: "POST",
    url: "https://tutribu.example.com/api/tribes/matematica-pro/courses",
  } as unknown as Request;
}

function buildModuleContext(moduleId: string) {
  return {
    params: Promise.resolve({
      moduleId,
      slug: "matematica-pro",
    }),
  };
}

function buildLessonContext(lessonId: string) {
  return {
    params: Promise.resolve({
      lessonId,
      slug: "matematica-pro",
    }),
  };
}

describe("Course mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.Response = MockJsonResponse as unknown as typeof Response;
    getAuthenticatedMember.mockResolvedValue({
      avatarFallback: "GH",
      email: "member@example.com",
      id: "member-1",
      image: null,
      name: "Grace Hopper",
      role: "tribemate",
    });
    (createRequestModules as Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      courses: {
        useCases: {
          createLesson,
          deleteCourseModule,
          deleteLesson,
          updateCourseModule,
          updateLesson,
        },
      },
    });
  });

  it("rejects malformed module route ids before updating a course module", async () => {
    const response = await PATCH_MODULE(
      buildJsonRequest({
        isActive: true,
        sortOrder: 1,
        title: "Modulo",
      }),
      buildModuleContext(INVALID_ID)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Completá el título y los campos requeridos del contenido.",
    });
    expect(updateCourseModule).not.toHaveBeenCalled();
  });

  it("rejects malformed module route ids before deleting a course module", async () => {
    const response = await DELETE_MODULE(
      buildJsonRequest(),
      buildModuleContext(INVALID_ID)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Completá el título y los campos requeridos del contenido.",
    });
    expect(deleteCourseModule).not.toHaveBeenCalled();
  });

  it("rejects malformed module route ids before creating a lesson", async () => {
    const response = await POST_LESSON(
      buildJsonRequest({
        externalVideoUrl: "https://vimeo.com/123456789",
        sortOrder: 1,
        title: "Leccion",
      }),
      buildModuleContext(INVALID_ID)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Completá el título y los campos requeridos del contenido.",
    });
    expect(createLesson).not.toHaveBeenCalled();
  });

  it("rejects malformed lesson route ids before updating a lesson", async () => {
    const response = await PATCH_LESSON(
      buildJsonRequest({
        courseModuleId: VALID_COURSE_MODULE_ID,
        externalVideoUrl: "https://vimeo.com/123456789",
        isActive: true,
        sortOrder: 1,
        title: "Leccion",
      }),
      buildLessonContext(INVALID_ID)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Completá el título y los campos requeridos del contenido.",
    });
    expect(updateLesson).not.toHaveBeenCalled();
  });

  it("rejects malformed body module ids before updating a lesson", async () => {
    const response = await PATCH_LESSON(
      buildJsonRequest({
        courseModuleId: INVALID_ID,
        externalVideoUrl: "https://vimeo.com/123456789",
        isActive: true,
        sortOrder: 1,
        title: "Leccion",
      }),
      buildLessonContext(VALID_LESSON_ID)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Completá el título y los campos requeridos del contenido.",
    });
    expect(updateLesson).not.toHaveBeenCalled();
  });

  it("rejects malformed lesson route ids before deleting a lesson", async () => {
    const response = await DELETE_LESSON(
      buildJsonRequest(),
      buildLessonContext(INVALID_ID)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Completá el título y los campos requeridos del contenido.",
    });
    expect(deleteLesson).not.toHaveBeenCalled();
  });
});
