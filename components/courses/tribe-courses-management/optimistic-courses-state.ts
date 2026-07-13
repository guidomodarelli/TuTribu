import type {
  CourseModuleResult,
  CourseModuleWithLessonsResult,
  LessonWithViewerStateResult,
} from "@/src/modules/courses/application/results/course-results";

export type ModuleSnapshot = {
  index: number;
  module: CourseModuleWithLessonsResult;
};

export type LessonSnapshot = {
  index: number;
  lesson: LessonWithViewerStateResult;
  moduleId: string;
};

const NOT_FOUND_INDEX = -1;

function sortModules(
  modules: CourseModuleWithLessonsResult[]
): CourseModuleWithLessonsResult[] {
  return [...modules].sort(
    (leftModule, rightModule) =>
      leftModule.sortOrder - rightModule.sortOrder
  );
}

function sortLessons(
  lessons: LessonWithViewerStateResult[]
): LessonWithViewerStateResult[] {
  return [...lessons].sort(
    (leftLesson, rightLesson) => leftLesson.sortOrder - rightLesson.sortOrder
  );
}

export function appendModule(
  modules: CourseModuleWithLessonsResult[],
  moduleToAppend: CourseModuleWithLessonsResult
): CourseModuleWithLessonsResult[] {
  return sortModules([...modules, moduleToAppend]);
}

export function insertModuleAt(
  modules: CourseModuleWithLessonsResult[],
  moduleToInsert: CourseModuleWithLessonsResult,
  index: number
): CourseModuleWithLessonsResult[] {
  const next = [...modules];
  next.splice(index, 0, moduleToInsert);
  return next;
}

export function removeModuleById(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string
): CourseModuleWithLessonsResult[] {
  return modules.filter((entry) => entry.id !== moduleId);
}

export function replaceModuleId(
  modules: CourseModuleWithLessonsResult[],
  fromModuleId: string,
  serverModule: CourseModuleResult
): CourseModuleWithLessonsResult[] {
  return sortModules(
    modules.map((entry) =>
      entry.id === fromModuleId ? { ...entry, ...serverModule } : entry
    )
  );
}

export function patchModuleFields(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string,
  patch: Partial<CourseModuleResult>
): CourseModuleWithLessonsResult[] {
  return sortModules(
    modules.map((entry) =>
      entry.id === moduleId ? { ...entry, ...patch } : entry
    )
  );
}

export function findModuleSnapshot(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string
): ModuleSnapshot | null {
  const index = modules.findIndex((entry) => entry.id === moduleId);
  if (index === NOT_FOUND_INDEX) {
    return null;
  }
  return { index, module: modules[index] };
}

export function appendLesson(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string,
  lesson: LessonWithViewerStateResult
): CourseModuleWithLessonsResult[] {
  return modules.map((entry) =>
    entry.id === moduleId
      ? { ...entry, lessons: sortLessons([...entry.lessons, lesson]) }
      : entry
  );
}

export function insertLessonAt(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string,
  lesson: LessonWithViewerStateResult,
  index: number
): CourseModuleWithLessonsResult[] {
  return modules.map((entry) => {
    if (entry.id !== moduleId) {
      return entry;
    }
    const nextLessons = [...entry.lessons];
    nextLessons.splice(index, 0, lesson);
    return { ...entry, lessons: nextLessons };
  });
}

export function removeLessonById(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string,
  lessonId: string
): CourseModuleWithLessonsResult[] {
  return modules.map((entry) =>
    entry.id === moduleId
      ? {
          ...entry,
          lessons: entry.lessons.filter((lesson) => lesson.id !== lessonId),
        }
      : entry
  );
}

export function replaceLessonId(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string,
  fromLessonId: string,
  serverLesson: LessonWithViewerStateResult
): CourseModuleWithLessonsResult[] {
  return modules.map((entry) => {
    if (entry.id !== moduleId) {
      return entry;
    }
    return {
      ...entry,
      lessons: sortLessons(
        entry.lessons.map((lesson) =>
          lesson.id === fromLessonId ? serverLesson : lesson
        )
      ),
    };
  });
}

export function patchLessonFields(
  modules: CourseModuleWithLessonsResult[],
  moduleId: string,
  lessonId: string,
  patch: Partial<LessonWithViewerStateResult>
): CourseModuleWithLessonsResult[] {
  return modules.map((entry) => {
    if (entry.id !== moduleId) {
      return entry;
    }
    return {
      ...entry,
      lessons: sortLessons(
        entry.lessons.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, ...patch } : lesson
        )
      ),
    };
  });
}

export function findLessonSnapshot(
  modules: CourseModuleWithLessonsResult[],
  lessonId: string
): LessonSnapshot | null {
  for (const entry of modules) {
    const index = entry.lessons.findIndex((lesson) => lesson.id === lessonId);
    if (index !== NOT_FOUND_INDEX) {
      return { index, lesson: entry.lessons[index], moduleId: entry.id };
    }
  }
  return null;
}
