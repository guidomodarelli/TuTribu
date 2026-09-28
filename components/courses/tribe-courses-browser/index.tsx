"use client";

import { useCallback, useEffect, useState } from "react";

import { TribeCoursesCatalog } from "@/components/courses/tribe-courses-catalog";
import { TribeCoursesView } from "@/components/courses/tribe-courses-view";
import { buildTribeCoursesRoute } from "@/lib/courses/course-lesson-route";
import {
  resolveSelectedCourse,
  type CourseSelectionQuery,
} from "@/src/modules/courses/application/course-selection";
import type {
  CourseTreeViewerPermissionsResult,
  CourseWithModulesResult,
  LessonWithViewerStateResult,
} from "@/src/modules/courses/application/results/course-results";
import { TRIBE_COURSES_ROUTE_QUERY } from "@/src/modules/courses/constants/courses";

const POPSTATE_EVENT = "popstate";
const HISTORY_UNUSED_TITLE = "";

type TribeCoursesBrowserProps = {
  courses: CourseWithModulesResult[];
  initialCourseId: string | null;
  initialLessonId: string | null;
  tribeSlug: string;
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

/**
 * Returns the courses with one lesson rewritten, keeping every other course,
 * module and lesson reference untouched.
 *
 * @param courses - Viewer course tree.
 * @param courseId - Course that owns the lesson.
 * @param lessonId - Lesson to rewrite.
 * @param updateLesson - Produces the new lesson state.
 * @returns The updated course tree.
 */
function updateCourseLesson(
  courses: CourseWithModulesResult[],
  courseId: string,
  lessonId: string,
  updateLesson: (
    lesson: LessonWithViewerStateResult
  ) => LessonWithViewerStateResult
): CourseWithModulesResult[] {
  return courses.map((course) =>
    course.id === courseId
      ? {
          ...course,
          modules: course.modules.map((courseModule) => ({
            ...courseModule,
            lessons: courseModule.lessons.map((lesson) =>
              lesson.id === lessonId ? updateLesson(lesson) : lesson
            ),
          })),
        }
      : course
  );
}

/**
 * Records the last lesson the viewer opened in a course. Returns the same
 * array when nothing changes so repeated reports do not re-render.
 *
 * @param courses - Viewer course tree.
 * @param courseId - Course the lesson belongs to.
 * @param lessonId - Lesson just opened.
 * @returns The updated course tree.
 */
function recordLastViewedLesson(
  courses: CourseWithModulesResult[],
  courseId: string,
  lessonId: string
): CourseWithModulesResult[] {
  const course = courses.find((candidate) => candidate.id === courseId);

  if (!course || course.lastViewedLessonId === lessonId) {
    return courses;
  }

  return courses.map((candidate) =>
    candidate.id === courseId
      ? { ...candidate, lastViewedLessonId: lessonId }
      : candidate
  );
}

/**
 * Reads the course selection from the current URL.
 *
 * @returns Requested course and lesson.
 */
function readSelectionFromLocation(): CourseSelectionQuery {
  const searchParams = new URLSearchParams(window.location.search);

  return {
    courseId: searchParams.get(TRIBE_COURSES_ROUTE_QUERY.course),
    lessonId: searchParams.get(TRIBE_COURSES_ROUTE_QUERY.lesson),
  };
}

/**
 * Client container of the tribe courses section. The server renders the first
 * view (catalog or course, so deep links keep working); afterwards opening a
 * course and returning to the catalog swap views locally from the course tree
 * already loaded, mirror the selection in the shareable URL through the
 * History API and follow Back/Forward, without re-rendering the page on the
 * server. It also owns the viewer progress shared by both views, so a lesson
 * completed or opened inside a course shows up in the catalog and when the
 * course is reopened.
 *
 * @param props - Course tree, initial selection, tribe slug and permissions.
 * @returns Catalog or course view.
 */
export function TribeCoursesBrowser({
  courses,
  initialCourseId,
  initialLessonId,
  tribeSlug,
  viewerPermissions,
}: TribeCoursesBrowserProps) {
  const [coursesSource, setCoursesSource] = useState(courses);
  const [viewerCourses, setViewerCourses] = useState(courses);
  const [selection, setSelection] = useState<CourseSelectionQuery>({
    courseId: initialCourseId,
    lessonId: initialLessonId,
  });
  // Views mounted by an in-page navigation take focus; the server-rendered
  // first view keeps the browser's default focus and scroll.
  const [hasNavigatedInPage, setHasNavigatedInPage] = useState(false);

  // A server refresh brings a new course tree: it replaces the local progress.
  if (coursesSource !== courses) {
    setCoursesSource(courses);
    setViewerCourses(courses);
  }

  useEffect(() => {
    const handlePopState = () => {
      // Back/Forward into another page is the App Router's job.
      if (window.location.pathname !== buildTribeCoursesRoute(tribeSlug)) {
        return;
      }

      setSelection(readSelectionFromLocation());
      setHasNavigatedInPage(true);
    };

    window.addEventListener(POPSTATE_EVENT, handlePopState);
    return () => window.removeEventListener(POPSTATE_EVENT, handlePopState);
  }, [tribeSlug]);

  const navigateToSelection = useCallback(
    (nextSelection: CourseSelectionQuery) => {
      setSelection(nextSelection);
      setHasNavigatedInPage(true);
      window.history.pushState(
        null,
        HISTORY_UNUSED_TITLE,
        buildTribeCoursesRoute(tribeSlug, {
          courseId: nextSelection.courseId ?? undefined,
          lessonId: nextSelection.lessonId ?? undefined,
        })
      );
    },
    [tribeSlug]
  );

  // Opening a course drops any lesson of the previous one: the course view
  // resumes from the viewer's last lesson, as a server render of `?curso=` does.
  const openCourse = useCallback(
    (courseId: string) => navigateToSelection({ courseId, lessonId: null }),
    [navigateToSelection]
  );

  const openCatalog = useCallback(
    () => navigateToSelection({ courseId: null, lessonId: null }),
    [navigateToSelection]
  );

  const handleLessonCompletionChange = useCallback(
    (courseId: string, lessonId: string, completed: boolean) => {
      setViewerCourses((current) =>
        updateCourseLesson(current, courseId, lessonId, (lesson) =>
          lesson.completed === completed ? lesson : { ...lesson, completed }
        )
      );
    },
    []
  );

  const handleLessonViewed = useCallback(
    (courseId: string, lessonId: string) => {
      setViewerCourses((current) =>
        recordLastViewedLesson(current, courseId, lessonId)
      );
    },
    []
  );

  const selectedCourse = resolveSelectedCourse(viewerCourses, selection);

  if (selectedCourse) {
    return (
      <TribeCoursesView
        course={selectedCourse}
        key={selectedCourse.id}
        onBackToCatalog={openCatalog}
        onLessonCompletionChange={handleLessonCompletionChange}
        onLessonViewed={handleLessonViewed}
        revealHeadingOnMount={hasNavigatedInPage}
        selectedLessonId={selection.lessonId}
        tribeSlug={tribeSlug}
        viewerPermissions={viewerPermissions}
      />
    );
  }

  return (
    <TribeCoursesCatalog
      courses={viewerCourses}
      onCourseSelect={openCourse}
      revealHeadingOnMount={hasNavigatedInPage}
      tribeSlug={tribeSlug}
      viewerPermissions={viewerPermissions}
    />
  );
}
