import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";

import { TribeCoursesManagement } from "@/components/courses/tribe-courses-management";
import { ATTACHMENT_FILE } from "@/src/constants/attachment-files";
import { COURSE_LESSON_DESCRIPTION } from "@/src/modules/courses/constants/courses";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { CourseModuleWithLessonsResult } from "@/src/modules/courses/application/results/course-results";

const TRIBE_SLUG = "matematica-pro";

const refreshMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

type FetchResponseLike = {
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
};

type DeferredResponse = {
  promise: Promise<FetchResponseLike>;
  resolveWith: (response: FetchResponseLike) => void;
  rejectWith: (reason: unknown) => void;
};

const SUCCESS_STATUS_FLOOR = 200;
const SUCCESS_STATUS_CEILING = 300;

function createDeferredResponse(): DeferredResponse {
  let resolveWith!: (response: FetchResponseLike) => void;
  let rejectWith!: (reason: unknown) => void;
  const promise = new Promise<FetchResponseLike>((resolve, reject) => {
    resolveWith = resolve;
    rejectWith = reject;
  });
  return { promise, resolveWith, rejectWith };
}

function buildJsonResponse(
  status: number,
  body: unknown
): FetchResponseLike {
  return {
    json: () => Promise.resolve(body),
    ok: status >= SUCCESS_STATUS_FLOOR && status < SUCCESS_STATUS_CEILING,
    status,
  };
}

const seedModules: CourseModuleWithLessonsResult[] = [
  {
    courseId: "course-1",
    id: "module-empezar-aca",
    isActive: true,
    lessons: [
      {
        completed: false,
        courseModuleId: "module-empezar-aca",
        description: "Intro lesson",
        externalVideoId: "111",
        id: "lesson-intro",
        isActive: true,
        sortOrder: 0,
        title: "Lección intro",
        videoProvider: VIDEO_PROVIDER.vimeo,
      },
    ],
    sortOrder: 0,
    title: "Empezar acá",
    unlockAfterDays: null,
    viewerAccess: { isLocked: false, unlocksAt: null },
  },
];

describe("TribeCoursesManagement optimistic CRUD", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    refreshMock.mockReset();
    (useRouter as jest.Mock).mockReturnValue({ refresh: refreshMock });
    global.fetch = jest.fn();
  });

  it("shows a new module immediately while the create request is pending", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    await user.click(screen.getByRole("button", { name: "Nuevo módulo" }));
    await user.type(
      screen.getByPlaceholderText("Ej: Empezar acá"),
      "Profundizar"
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: /Profundizar/ })
    ).toBeInTheDocument();
    expect(screen.getByText("Guardando…")).toBeInTheDocument();

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(201, {
          courseModule: {
            courseId: "course-1",
            id: "module-profundizar-server",
            isActive: true,
            sortOrder: 1,
            title: "Profundizar",
            unlockAfterDays: null,
          },
          message: "Módulo creado.",
        })
      );
      await pending.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Guardando…")).not.toBeInTheDocument();
    });
  });

  it("sorts an optimistic module by its sort order", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    await user.click(screen.getByRole("button", { name: "Nuevo módulo" }));
    await user.type(
      screen.getByPlaceholderText("Ej: Empezar acá"),
      "Antes de empezar"
    );
    fireEvent.change(screen.getByLabelText("Orden"), {
      target: { value: "-1" },
    });
    await user.click(screen.getByRole("button", { name: "Crear" }));

    const moduleHeadings = await screen.findAllByRole("heading", {
      level: 2,
    });

    expect(moduleHeadings.map((heading) => heading.textContent)).toEqual([
      "Antes de empezarGuardando…",
      "Empezar acá",
    ]);
  });

  it("rolls back the optimistic module when the create request fails", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    await user.click(screen.getByRole("button", { name: "Nuevo módulo" }));
    await user.type(
      screen.getByPlaceholderText("Ej: Empezar acá"),
      "Borrador"
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: /Borrador/ })
    ).toBeInTheDocument();

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(500, { message: "Falló crear módulo." })
      );
      await pending.promise;
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { level: 2, name: /Borrador/ })
      ).not.toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Borrador")).toBeInTheDocument();
  });

  it("replaces local modules when fresh server props arrive", async () => {
    const refreshedModules: CourseModuleWithLessonsResult[] = [
      {
        courseId: "course-1",
        id: "module-avanzar",
        isActive: true,
        lessons: [],
        sortOrder: 0,
        title: "Avanzar",
        unlockAfterDays: null,
        viewerAccess: { isLocked: false, unlocksAt: null },
      },
    ];
    const { rerender } = render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /Empezar acá/ })
    ).toBeInTheDocument();

    rerender(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={refreshedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: /Avanzar/ })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { level: 2, name: /Empezar acá/ })
    ).not.toBeInTheDocument();
  });

  it("does not trigger a full route refresh on a successful create", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      buildJsonResponse(201, {
        courseModule: {
          courseId: "course-1",
          id: "module-server-id",
          isActive: true,
          sortOrder: 1,
          title: "Profundizar",
          unlockAfterDays: null,
        },
        message: "Módulo creado.",
      })
    );

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    await user.click(screen.getByRole("button", { name: "Nuevo módulo" }));
    await user.type(
      screen.getByPlaceholderText("Ej: Empezar acá"),
      "Profundizar"
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: /Profundizar/ })
      ).toBeInTheDocument();
    });

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("optimistically updates a module title and reconciles with the server entity", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleActions = screen.getByRole("group", {
      name: "Acciones del módulo Empezar acá",
    });

    await user.click(within(moduleActions).getByRole("button", { name: "Editar" }));
    const titleInput = screen.getByDisplayValue("Empezar acá");
    await user.clear(titleInput);
    await user.type(titleInput, "Onboarding");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByDisplayValue("Onboarding")).toBeInTheDocument();

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(200, {
          courseModule: {
            courseId: "course-1",
            id: "module-empezar-aca",
            isActive: true,
            sortOrder: 0,
            title: "Onboarding",
            unlockAfterDays: null,
          },
          message: "Módulo actualizado.",
        })
      );
      await pending.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Guardando…")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { level: 2, name: /Onboarding/ })
    ).toBeInTheDocument();
  });

  it("rolls back the optimistic module update when the server rejects it", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleActions = screen.getByRole("group", {
      name: "Acciones del módulo Empezar acá",
    });

    await user.click(within(moduleActions).getByRole("button", { name: "Editar" }));
    const titleInput = screen.getByDisplayValue("Empezar acá");
    await user.clear(titleInput);
    await user.type(titleInput, "Onboarding");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByDisplayValue("Onboarding")).toBeInTheDocument();

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(500, { message: "Falló actualizar módulo." })
      );
      await pending.promise;
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Onboarding")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("heading", { level: 2, name: /Onboarding/ })
    ).not.toBeInTheDocument();
  });

  it("optimistically deletes a module and restores it on failure", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);
    jest.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleActions = screen.getByRole("group", {
      name: "Acciones del módulo Empezar acá",
    });

    await user.click(
      within(moduleActions).getByRole("button", { name: "Eliminar" })
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { level: 2, name: /Empezar acá/ })
      ).not.toBeInTheDocument();
    });

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(500, { message: "Falló eliminar." })
      );
      await pending.promise;
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: /Empezar acá/ })
      ).toBeInTheDocument();
    });
  });

  it("shows a new lesson optimistically and replaces it with the server lesson", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleItem = screen
      .getByRole("heading", { level: 2, name: /Empezar acá/ })
      .closest("li") as HTMLElement;

    await user.click(
      within(moduleItem).getByRole("button", { name: "Agregar lección" })
    );
    await user.type(
      screen.getByPlaceholderText("Ej: Qué dinero invertir"),
      "Bienvenida"
    );
    await user.type(
      screen.getByPlaceholderText("https://vimeo.com/123456789"),
      "https://vimeo.com/987654321"
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(
      await screen.findByRole("heading", { level: 3, name: /Bienvenida/ })
    ).toBeInTheDocument();

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(201, {
          lesson: {
            courseModuleId: "module-empezar-aca",
            description: "",
            externalVideoId: "987654321",
            id: "lesson-bienvenida-server",
            isActive: true,
            sortOrder: 1,
            title: "Bienvenida",
            videoProvider: VIDEO_PROVIDER.vimeo,
          },
          message: "Lección creada.",
        })
      );
      await pending.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("Guardando…")).not.toBeInTheDocument();
    });
  });

  it("sorts an optimistic lesson by its sort order", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleItem = screen
      .getByRole("heading", { level: 2, name: /Empezar acá/ })
      .closest("li") as HTMLElement;

    await user.click(
      within(moduleItem).getByRole("button", { name: "Agregar lección" })
    );
    await user.type(
      screen.getByPlaceholderText("Ej: Qué dinero invertir"),
      "Antes de la intro"
    );
    await user.type(
      screen.getByPlaceholderText("https://vimeo.com/123456789"),
      "https://vimeo.com/987654321"
    );
    fireEvent.change(screen.getByLabelText("Orden"), {
      target: { value: "-1" },
    });
    await user.click(screen.getByRole("button", { name: "Crear" }));

    const lessonHeadings = await screen.findAllByRole("heading", {
      level: 3,
    });

    expect(lessonHeadings.map((heading) => heading.textContent)).toEqual([
      "Antes de la introGuardando…",
      "Lección intro",
      "Nueva lección",
    ]);
  });

  it("preserves markdown links in the lesson description when saving an edit", async () => {
    const modulesWithLinkDescription: CourseModuleWithLessonsResult[] = [
      {
        ...seedModules[0],
        lessons: [
          {
            ...seedModules[0].lessons[0],
            description: "Mirá [el curso](https://tutribu.com)",
          },
        ],
      },
    ];
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={modulesWithLinkDescription}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const lessonActions = screen.getByRole("group", {
      name: "Acciones de la lección Lección intro",
    });
    await user.click(
      within(lessonActions).getByRole("button", { name: "Editar" })
    );

    // The editor deserializes the stored markdown into an interactive link.
    expect(screen.getByRole("link", { name: "el curso" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(global.fetch).toHaveBeenCalled();
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse((requestInit as { body: string }).body);
    expect(requestBody.description).toBe("Mirá [el curso](https://tutribu.com)");

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(200, {
          lesson: {
            courseModuleId: "module-empezar-aca",
            description: "Mirá [el curso](https://tutribu.com)",
            externalVideoId: "111",
            id: "lesson-intro",
            isActive: true,
            sortOrder: 0,
            title: "Lección intro",
            videoProvider: VIDEO_PROVIDER.vimeo,
          },
          message: "Lección actualizada.",
        })
      );
      await pending.promise;
    });
  });

  it("treats a whitespace-only lesson description as empty instead of blocking the submit", async () => {
    const whitespaceOnlyDescription = " ".repeat(
      COURSE_LESSON_DESCRIPTION.maxLength + 1
    );
    const modulesWithWhitespaceDescription: CourseModuleWithLessonsResult[] = [
      {
        ...seedModules[0],
        lessons: [
          {
            ...seedModules[0].lessons[0],
            description: whitespaceOnlyDescription,
          },
        ],
      },
    ];
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={modulesWithWhitespaceDescription}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const lessonActions = screen.getByRole("group", {
      name: "Acciones de la lección Lección intro",
    });
    await user.click(
      within(lessonActions).getByRole("button", { name: "Editar" })
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // A blank-but-over-limit description must not trip the too-long guard: it is
    // empty once trimmed, so the request goes out with the trimmed description,
    // matching the backend's `normalizeOptionalText`.
    expect(global.fetch).toHaveBeenCalled();
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse((requestInit as { body: string }).body);
    expect(requestBody.description).toBe("");

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(200, {
          lesson: {
            courseModuleId: "module-empezar-aca",
            description: null,
            externalVideoId: "111",
            id: "lesson-intro",
            isActive: true,
            sortOrder: 0,
            title: "Lección intro",
            videoProvider: VIDEO_PROVIDER.vimeo,
          },
          message: "Lección actualizada.",
        })
      );
      await pending.promise;
    });
  });

  it("uploads an attached file and includes it in the lesson create payload", async () => {
    const pendingReservation = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(
      pendingReservation.promise
    );

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleItem = screen
      .getByRole("heading", { level: 2, name: /Empezar acá/ })
      .closest("li") as HTMLElement;

    await user.click(
      within(moduleItem).getByRole("button", { name: "Agregar lección" })
    );
    await user.type(
      screen.getByPlaceholderText("Ej: Qué dinero invertir"),
      "Con material"
    );
    await user.type(
      screen.getByPlaceholderText("https://vimeo.com/123456789"),
      "https://vimeo.com/987654321"
    );

    const attachedFile = new File(["contenido"], "apunte.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Adjuntar archivo"), {
      target: { files: [attachedFile] },
    });

    // While the upload is in flight, the row reports it and saving is blocked.
    expect(await screen.findByText("Subiendo…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      buildJsonResponse(200, {})
    );
    await act(async () => {
      pendingReservation.resolveWith(
        buildJsonResponse(201, {
          assetId: "asset-apunte",
          uploadHeaders: { "x-meta-prueba": "1" },
          uploadUrl: "https://uploads.example/asset-apunte",
        })
      );
      await pendingReservation.promise;
    });

    expect(await screen.findByText("Listo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeEnabled();

    const [reservationUrl, reservationInit] = (global.fetch as jest.Mock).mock
      .calls[0];
    expect(reservationUrl).toBe(
      `/api/tribes/${TRIBE_SLUG}/courses/lessons/files/uploads`
    );
    expect(
      JSON.parse((reservationInit as { body: string }).body)
    ).toEqual({
      fileName: "apunte.pdf",
      fileSizeBytes: attachedFile.size,
      mimeType: "application/pdf",
    });

    const [uploadUrl, uploadInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(uploadUrl).toBe("https://uploads.example/asset-apunte");
    expect((uploadInit as { method: string }).method).toBe("PUT");
    expect((uploadInit as { headers: Record<string, string> }).headers).toEqual(
      {
        "Content-Type": "application/pdf",
        "x-meta-prueba": "1",
      }
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      buildJsonResponse(201, {
        lesson: {
          courseModuleId: "module-empezar-aca",
          description: "",
          externalVideoId: "987654321",
          files: [
            {
              fileName: "apunte.pdf",
              fileSizeBytes: attachedFile.size,
              id: "file-apunte",
              mimeType: "application/pdf",
              sortOrder: 0,
            },
          ],
          id: "lesson-con-material",
          isActive: true,
          sortOrder: 1,
          title: "Con material",
          videoProvider: VIDEO_PROVIDER.vimeo,
        },
        message: "Lección creada.",
      })
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 3, name: /Con material/ })
      ).toBeInTheDocument();
    });
    const [, createLessonInit] = (global.fetch as jest.Mock).mock.calls[2];
    const createLessonBody = JSON.parse(
      (createLessonInit as { body: string }).body
    );
    expect(createLessonBody.files).toEqual([{ assetId: "asset-apunte" }]);
  });

  it("rejects oversized and disallowed files before reserving an upload", async () => {
    const { toast } = jest.requireMock("sonner") as {
      toast: { error: jest.Mock };
    };
    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleItem = screen
      .getByRole("heading", { level: 2, name: /Empezar acá/ })
      .closest("li") as HTMLElement;
    await user.click(
      within(moduleItem).getByRole("button", { name: "Agregar lección" })
    );

    const executableFile = new File(["x"], "programa.exe", {
      type: "application/x-msdownload",
    });
    const oversizedFile = new File(["x"], "enorme.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversizedFile, "size", {
      value: ATTACHMENT_FILE.maxFileSizeBytes + 1,
    });

    fireEvent.change(screen.getByLabelText("Adjuntar archivo"), {
      target: { files: [executableFile, oversizedFile] },
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(2);
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("programa.exe")).not.toBeInTheDocument();
    expect(screen.queryByText("enorme.pdf")).not.toBeInTheDocument();
  });

  it("removes an uploaded draft and best-effort deletes its reserved asset", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        buildJsonResponse(201, {
          assetId: "asset-apunte",
          uploadHeaders: {},
          uploadUrl: "https://uploads.example/asset-apunte",
        })
      )
      .mockResolvedValueOnce(buildJsonResponse(200, {}))
      .mockResolvedValueOnce(buildJsonResponse(200, { message: "Listo." }));

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleItem = screen
      .getByRole("heading", { level: 2, name: /Empezar acá/ })
      .closest("li") as HTMLElement;
    await user.click(
      within(moduleItem).getByRole("button", { name: "Agregar lección" })
    );

    fireEvent.change(screen.getByLabelText("Adjuntar archivo"), {
      target: {
        files: [
          new File(["contenido"], "apunte.pdf", { type: "application/pdf" }),
        ],
      },
    });
    expect(await screen.findByText("Listo")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Quitar apunte.pdf" })
    );

    expect(screen.queryByText("apunte.pdf")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/tribes/${TRIBE_SLUG}/courses/lessons/files/asset-apunte`,
        { method: "DELETE" }
      );
    });
  });

  it("disables submit and blocks the save when a file draft is in the error state", async () => {
    const { toast } = jest.requireMock("sonner") as {
      toast: { error: jest.Mock };
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      buildJsonResponse(500, { message: "Error del servidor." })
    );

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleItem = screen
      .getByRole("heading", { level: 2, name: /Empezar acá/ })
      .closest("li") as HTMLElement;
    await user.click(
      within(moduleItem).getByRole("button", { name: "Agregar lección" })
    );

    fireEvent.change(screen.getByLabelText("Adjuntar archivo"), {
      target: {
        files: [new File(["x"], "fallo.pdf", { type: "application/pdf" })],
      },
    });

    // Wait for the upload to fail and the draft to reach the error state.
    expect(await screen.findByText("Error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();

    // Programmatically submitting the form must not reach the server.
    const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length;
    const form = screen
      .getByRole("button", { name: "Crear" })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(fetchCallsBefore);
    expect(toast.error).toHaveBeenCalledWith(
      "Hay archivos con error. Retinalos o volvé a intentarlos antes de guardar."
    );
  });

  it("re-enables submit after removing a failed file draft", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        buildJsonResponse(500, { message: "Error del servidor." })
      )
      .mockResolvedValueOnce(buildJsonResponse(200, { message: "Eliminado." }));

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const moduleItem = screen
      .getByRole("heading", { level: 2, name: /Empezar acá/ })
      .closest("li") as HTMLElement;
    await user.click(
      within(moduleItem).getByRole("button", { name: "Agregar lección" })
    );

    fireEvent.change(screen.getByLabelText("Adjuntar archivo"), {
      target: {
        files: [new File(["x"], "fallo.pdf", { type: "application/pdf" })],
      },
    });

    expect(await screen.findByText("Error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Quitar fallo.pdf" }));

    expect(screen.queryByText("fallo.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeEnabled();
  });

  it("omits the files field when saving an edited lesson without touching attachments", async () => {
    const modulesWithLessonFiles: CourseModuleWithLessonsResult[] = [
      {
        ...seedModules[0],
        lessons: [
          {
            ...seedModules[0].lessons[0],
            files: [
              {
                fileName: "guia.pdf",
                fileSizeBytes: 2048,
                id: "file-guia",
                mimeType: "application/pdf",
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    ];
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={modulesWithLessonFiles}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const lessonActions = screen.getByRole("group", {
      name: "Acciones de la lección Lección intro",
    });
    await user.click(
      within(lessonActions).getByRole("button", { name: "Editar" })
    );

    // The existing attachment is listed in the form as already uploaded.
    expect(screen.getByText("guia.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse((requestInit as { body: string }).body);
    expect("files" in requestBody).toBe(false);

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(200, {
          lesson: {
            ...modulesWithLessonFiles[0].lessons[0],
          },
          message: "Lección actualizada.",
        })
      );
      await pending.promise;
    });
  });

  it("preserves existing lesson files when the update response omits the files field", async () => {
    const modulesWithLessonFiles: CourseModuleWithLessonsResult[] = [
      {
        ...seedModules[0],
        lessons: [
          {
            ...seedModules[0].lessons[0],
            files: [
              {
                fileName: "guia.pdf",
                fileSizeBytes: 2048,
                id: "file-guia",
                mimeType: "application/pdf",
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    ];
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      buildJsonResponse(200, {
        lesson: {
          courseModuleId: "module-empezar-aca",
          description: null,
          externalVideoId: "111",
          id: "lesson-intro",
          isActive: true,
          sortOrder: 0,
          title: "Lección intro",
          videoProvider: VIDEO_PROVIDER.vimeo,
          // No `files` field: server omits it on title-only updates
        },
        message: "Lección actualizada.",
      })
    );

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={modulesWithLessonFiles}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const lessonActions = screen.getByRole("group", {
      name: "Acciones de la lección Lección intro",
    });
    await user.click(within(lessonActions).getByRole("button", { name: "Editar" }));
    expect(screen.getByText("guia.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(screen.queryByText("Guardando…")).not.toBeInTheDocument();
    });

    // Re-open the form: query a fresh reference since the header DOM node was
    // replaced when the form mounted and unmounted during the save cycle.
    const lessonActionsAfterSave = screen.getByRole("group", {
      name: "Acciones de la lección Lección intro",
    });
    await user.click(
      within(lessonActionsAfterSave).getByRole("button", { name: "Editar" })
    );
    expect(await screen.findByText("guia.pdf")).toBeInTheDocument();
  });

  it("sends the replacement files set when an already-attached file is removed", async () => {
    const modulesWithLessonFiles: CourseModuleWithLessonsResult[] = [
      {
        ...seedModules[0],
        lessons: [
          {
            ...seedModules[0].lessons[0],
            files: [
              {
                fileName: "guia.pdf",
                fileSizeBytes: 2048,
                id: "file-guia",
                mimeType: "application/pdf",
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    ];
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={modulesWithLessonFiles}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const lessonActions = screen.getByRole("group", {
      name: "Acciones de la lección Lección intro",
    });
    await user.click(
      within(lessonActions).getByRole("button", { name: "Editar" })
    );

    await user.click(screen.getByRole("button", { name: "Quitar guia.pdf" }));

    // Already-attached files are detached by the PATCH replacement, so no
    // direct DELETE request fires when removing them from the form.
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse((requestInit as { body: string }).body);
    expect(requestBody.files).toEqual([]);

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(200, {
          lesson: {
            ...modulesWithLessonFiles[0].lessons[0],
            files: [],
          },
          message: "Lección actualizada.",
        })
      );
      await pending.promise;
    });
  });

  it("removes a lesson optimistically and restores it on failure", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);
    jest.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
        courseId="course-1"
        courseTitle="Inversiones"
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    const lessonActions = screen.getByRole("group", {
      name: "Acciones de la lección Lección intro",
    });

    await user.click(
      within(lessonActions).getByRole("button", { name: "Eliminar" })
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { level: 3, name: /Lección intro/ })
      ).not.toBeInTheDocument();
    });

    await act(async () => {
      pending.resolveWith(
        buildJsonResponse(500, { message: "Falló eliminar lección." })
      );
      await pending.promise;
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 3, name: /Lección intro/ })
      ).toBeInTheDocument();
    });
  });
});
