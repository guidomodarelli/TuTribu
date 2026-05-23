import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION_PATH = join(
  process.cwd(),
  "database/migrations/20260522130000_create_course_modules_and_lessons.sql"
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("course module and lesson RLS migration", () => {
  it("keeps inactive course content hidden from non-managing members", () => {
    const migration = readMigration();

    expect(migration).toContain("is_active = true");
    expect(migration).toContain("public.can_manage_tribe_courses(tribe_id)");
    expect(migration).toContain(
      "WHERE course_modules.id = course_lessons.course_module_id"
    );
    expect(migration).toContain("AND course_modules.is_active = true");
  });

  it("enforces that lessons belong to modules from the same tribe", () => {
    const migration = readMigration();

    expect(migration).toContain("UNIQUE (id, tribe_id)");
    expect(migration).toContain(
      "FOREIGN KEY (course_module_id, tribe_id)"
    );
    expect(migration).toContain(
      "REFERENCES public.course_modules(id, tribe_id)"
    );
  });
});
