import { readFileSync } from "node:fs";
import { join } from "node:path";

const COURSE_REPOSITORY_PATH = join(
  process.cwd(),
  "src/modules/courses/domain/repositories/course-repository.ts"
);

describe("CourseRepository boundary", () => {
  it("keeps the domain repository port independent from application contracts", () => {
    const repositorySource = readFileSync(COURSE_REPOSITORY_PATH, "utf8");

    expect(repositorySource).not.toContain("@/src/modules/courses/application");
  });
});
