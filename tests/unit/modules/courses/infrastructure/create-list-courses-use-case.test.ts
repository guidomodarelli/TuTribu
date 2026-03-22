import { createListCoursesUseCase } from "@/src/modules/courses/infrastructure/composition/create-list-courses-use-case";

describe("createListCoursesUseCase", () => {
  const originalEnv = process.env.ACADEMIA_BACKEND_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.ACADEMIA_BACKEND_BASE_URL = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses mock repository when backend base url is missing", async () => {
    delete process.env.ACADEMIA_BACKEND_BASE_URL;
    global.fetch = jest.fn() as unknown as typeof fetch;

    const useCase = createListCoursesUseCase();
    const result = await useCase.execute();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses http repository when backend base url exists", async () => {
    process.env.ACADEMIA_BACKEND_BASE_URL = "https://api.academia.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "course-1",
            title: "Launch Lab",
            description: "Launch workflows",
            category: "Growth",
            instructorName: "Mara",
            lessonCount: 9,
            status: "Open",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const useCase = createListCoursesUseCase();
    await useCase.execute();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.academia.test/v1/courses",
      expect.objectContaining({ method: "GET" })
    );
  });
});
