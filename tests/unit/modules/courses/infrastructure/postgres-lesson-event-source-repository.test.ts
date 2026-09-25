import { describe, expect, it, vi } from "vitest";

import { PostgresLessonEventSourceRepository } from "@/src/modules/courses/infrastructure/repositories/postgres-lesson-event-source-repository";

const TRIBE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const COURSE_ID = "66666666-cccc-4666-8666-666666666601";
const MODULE_ID = "66666666-dddd-4666-8666-666666666601";
const LESSON_ID = "66666666-eeee-4666-8666-666666666601";

const command = {
  courseId: COURSE_ID,
  courseModuleId: MODULE_ID,
  description: "Repaso de la semana",
  externalVideoId: "dQw4w9WgXcQ",
  sourceEventId: "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f",
  sourceOccurrenceStartsAt: "2026-05-14T21:00:00.000Z",
  title: "Taller semanal · 14 may",
  tribeSlug: "matematica-pro",
  videoProvider: "youtube",
} as const;

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (chunk && typeof chunk === "object" && "value" in chunk) {
        const value = (chunk as { value: unknown }).value;

        return Array.isArray(value) ? value.join("") : "";
      }

      if (chunk && typeof chunk === "object" && "queryChunks" in chunk) {
        return getSqlText(chunk);
      }

      return "";
    })
    .join("");
}

/**
 * Fake conversion transaction: the target read sees the course and module,
 * the post-lock target lock answers `lockedTargetRows`, no lesson exists yet,
 * and the insert returns the new lesson.
 */
function createConversionDatabase(lockedTargetRows: Record<string, unknown>[]) {
  const statements: string[] = [];
  const execute = vi.fn(async (statement: unknown) => {
    const text = getSqlText(statement);

    statements.push(text);

    if (text.includes("as module_in_course")) {
      return { rows: [{ can_manage: true, module_in_course: true, tribe_id: TRIBE_ID }] };
    }

    if (text.includes("for share of course_modules")) {
      return { rows: lockedTargetRows };
    }

    if (text.includes("insert into public.course_lessons")) {
      return { rows: [{ course_module_id: MODULE_ID, id: LESSON_ID, title: command.title }] };
    }

    return { rows: [] };
  });
  const repository = new PostgresLessonEventSourceRepository(async (callback) =>
    callback({ execute } as never)
  );

  return { repository, statements };
}

describe("PostgresLessonEventSourceRepository.createFromEventRecording", () => {
  it("locks the course module after the conversion lock and before inserting the lesson", async () => {
    const { repository, statements } = createConversionDatabase([{ id: MODULE_ID }]);

    await expect(repository.createFromEventRecording(command)).resolves.toEqual({
      lesson: { courseId: COURSE_ID, courseModuleId: MODULE_ID, id: LESSON_ID, title: command.title },
      status: "created",
    });

    const advisoryIndex = statements.findIndex((text) => text.includes("pg_advisory_xact_lock"));
    const moduleLockIndex = statements.findIndex((text) => text.includes("for share of course_modules"));
    const insertIndex = statements.findIndex((text) => text.includes("insert into public.course_lessons"));

    expect(advisoryIndex).toBeGreaterThan(-1);
    expect(moduleLockIndex).toBeGreaterThan(advisoryIndex);
    expect(insertIndex).toBeGreaterThan(moduleLockIndex);
  });

  it("answers not found without inserting when the course or module vanished while waiting on the lock", async () => {
    const { repository, statements } = createConversionDatabase([]);

    await expect(repository.createFromEventRecording(command)).resolves.toEqual({
      status: "not_found",
    });
    expect(statements.some((text) => text.includes("insert into public.course_lessons"))).toBe(false);
  });
});
