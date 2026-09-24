import { describe, expect, it, vi } from "vitest";

import {
  canManageTribeCourses,
  createLessonFromEventRecording,
  listLessonConversionTargets,
} from "@/src/modules/courses/application/use-cases/lesson-event-source-use-cases";
import type { LessonEventSourceRepository } from "@/src/modules/courses/domain/repositories/lesson-event-source-repository";

const COURSE_ID = "66666666-cccc-4666-8666-666666666601";
const MODULE_ID = "66666666-dddd-4666-8666-666666666601";
const LESSON_ID = "66666666-eeee-4666-8666-666666666601";
const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";

function createRepositoryDouble(overrides: Partial<LessonEventSourceRepository> = {}) {
  return {
    canManageCourses: vi.fn(async () => true),
    createFromEventRecording: vi.fn(),
    listConversionTargets: vi.fn(),
    ...overrides,
  } satisfies LessonEventSourceRepository;
}

const command = {
  courseId: COURSE_ID,
  courseModuleId: MODULE_ID,
  description: "  Grabación del taller  ",
  externalVideoId: "dQw4w9WgXcQ",
  sourceEventId: EVENT_ID,
  sourceOccurrenceStartsAt: "2026-05-14T21:00:00.000Z",
  title: "  Taller semanal  ",
  tribeSlug: "matematica-pro",
  videoProvider: "youtube" as const,
};

describe("createLessonFromEventRecording", () => {
  it("normalizes the copy and delegates the idempotent creation", async () => {
    const lessonEventSourceRepository = createRepositoryDouble();

    vi.mocked(lessonEventSourceRepository.createFromEventRecording).mockResolvedValue({
      lesson: { courseId: COURSE_ID, courseModuleId: MODULE_ID, id: LESSON_ID, title: "Taller semanal" },
      status: "existing",
    });

    await expect(
      createLessonFromEventRecording({ lessonEventSourceRepository })(command)
    ).resolves.toMatchObject({ status: "existing" });
    expect(lessonEventSourceRepository.createFromEventRecording).toHaveBeenCalledWith({
      ...command,
      description: "Grabación del taller",
      title: "Taller semanal",
    });
  });

  it("rejects an empty or too long title without touching the repository", async () => {
    const lessonEventSourceRepository = createRepositoryDouble();
    const create = createLessonFromEventRecording({ lessonEventSourceRepository });

    await expect(create({ ...command, title: "   " })).resolves.toEqual({ status: "invalid_input" });
    await expect(create({ ...command, title: "x".repeat(161) })).resolves.toEqual({
      status: "invalid_input",
    });
    expect(lessonEventSourceRepository.createFromEventRecording).not.toHaveBeenCalled();
  });

  it("stores an empty description as null", async () => {
    const lessonEventSourceRepository = createRepositoryDouble();

    vi.mocked(lessonEventSourceRepository.createFromEventRecording).mockResolvedValue({ status: "forbidden" });

    await createLessonFromEventRecording({ lessonEventSourceRepository })({
      ...command,
      description: "  ",
    });

    expect(lessonEventSourceRepository.createFromEventRecording).toHaveBeenCalledWith(
      expect.objectContaining({ description: null })
    );
  });
});

describe("lesson conversion lookups", () => {
  it("forwards the targets and the course management permission", async () => {
    const targets = { courses: [], status: "found" as const };
    const lessonEventSourceRepository = createRepositoryDouble({
      listConversionTargets: vi.fn(async () => targets),
    });

    await expect(
      listLessonConversionTargets({ lessonEventSourceRepository })({ tribeSlug: "matematica-pro" })
    ).resolves.toBe(targets);
    await expect(
      canManageTribeCourses({ lessonEventSourceRepository })({ tribeSlug: "matematica-pro" })
    ).resolves.toBe(true);
  });
});
