import { render, screen } from "@testing-library/react";

import { TribeCoursesView } from "@/components/courses/tribe-courses-view";

const TRIBE_SLUG = "matematica-pro";

describe("TribeCoursesView", () => {
  it("shows the management link when a course manager sees an empty course list", () => {
    render(
      <TribeCoursesView
        modules={[]}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: true }}
      />
    );

    expect(screen.getByRole("link", { name: /Gestionar/ })).toHaveAttribute(
      "href",
      `/${TRIBE_SLUG}/cursos/gestionar`
    );
  });

  it("hides the management link when a regular member sees an empty course list", () => {
    render(
      <TribeCoursesView
        modules={[]}
        selectedLessonId={null}
        tribeSlug={TRIBE_SLUG}
        viewerPermissions={{ canManageCourses: false }}
      />
    );

    expect(screen.queryByRole("link", { name: /Gestionar/ })).toBeNull();
  });
});
