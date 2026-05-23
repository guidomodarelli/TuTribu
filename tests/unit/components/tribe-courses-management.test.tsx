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
import { VIDEO_PROVIDER } from "@/src/modules/courses/constants/courses";
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
    id: "module-empezar-aca",
    isActive: true,
    lessons: [
      {
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
            id: "module-profundizar-server",
            isActive: true,
            sortOrder: 1,
            title: "Profundizar",
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
        id: "module-avanzar",
        isActive: true,
        lessons: [],
        sortOrder: 0,
        title: "Avanzar",
      },
    ];
    const { rerender } = render(
      <TribeCoursesManagement
        initialModules={seedModules}
        tribeSlug={TRIBE_SLUG}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /Empezar acá/ })
    ).toBeInTheDocument();

    rerender(
      <TribeCoursesManagement
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
          id: "module-server-id",
          isActive: true,
          sortOrder: 1,
          title: "Profundizar",
        },
        message: "Módulo creado.",
      })
    );

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
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
            id: "module-empezar-aca",
            isActive: true,
            sortOrder: 0,
            title: "Onboarding",
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

  it("removes a lesson optimistically and restores it on failure", async () => {
    const pending = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValueOnce(pending.promise);
    jest.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <TribeCoursesManagement
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
