/** @vitest-environment node */
/** Decides which console calls are React development warnings that fail the running test. */
import { describe, expect, it } from "vitest";
import { readReactDevelopmentWarning, type AcceptedReactWarning } from "@/tests/support/react-warning-guard";

const CONTROLLED_SWITCH_WARNING = "A component is changing an uncontrolled input to be controlled. This is likely caused by the value changing from undefined to a defined value.";
const ACCEPTED_FILE = "tests/unit/components/dependency-widget.test.tsx";
const ACCEPTED: readonly AcceptedReactWarning[] = [
  { pattern: /changing an uncontrolled input to be controlled/, testFile: ACCEPTED_FILE, reason: "Emitted inside a third-party widget that the repository cannot change." },
];

describe("readReactDevelopmentWarning", () => {
  it("should report a React development warning, including React's %s template arguments", () => {
    expect(readReactDevelopmentWarning(["Warning: Each child in a list should have a unique \"key\" prop.%s", " Check the render method."])).toContain("unique \"key\" prop");
  });

  it("should ignore console calls that are not React development warnings", () => {
    expect(readReactDevelopmentWarning(["Request failed", new Error("network down")])).toBeNull();
  });

  it("should accept a warning only in the test file its entry names", () => {
    const acceptedPath = `C:\\repo\\${ACCEPTED_FILE.replaceAll("/", "\\")}`;
    const otherPath = "/repo/tests/unit/components/other.test.tsx";

    expect(readReactDevelopmentWarning([CONTROLLED_SWITCH_WARNING], { testPath: acceptedPath, accepted: ACCEPTED })).toBeNull();
    expect(readReactDevelopmentWarning([CONTROLLED_SWITCH_WARNING], { testPath: otherPath, accepted: ACCEPTED })).toBe(CONTROLLED_SWITCH_WARNING);
  });

  it("should still report a warning the accepted file did not list", () => {
    const acceptedPath = `/repo/${ACCEPTED_FILE}`;
    const keyWarning = "Encountered two children with the same key, `row-1`.";

    expect(readReactDevelopmentWarning([keyWarning], { testPath: acceptedPath, accepted: ACCEPTED })).toBe(keyWarning);
  });

  it("should report the warning when the running test file is unknown", () => {
    expect(readReactDevelopmentWarning([CONTROLLED_SWITCH_WARNING], { accepted: ACCEPTED })).toBe(CONTROLLED_SWITCH_WARNING);
  });
});
