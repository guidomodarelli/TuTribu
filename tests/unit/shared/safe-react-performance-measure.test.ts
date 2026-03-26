import { installSafeReactPerformanceMeasure } from "@/src/modules/shared/infrastructure/browser/install-safe-react-performance-measure";

type TestPerformance = {
  measure: jest.Mock;
};

describe("installSafeReactPerformanceMeasure", () => {
  it("swallows React component performance marks with negative timestamps", () => {
    const targetPerformance: TestPerformance = {
      measure: jest.fn(() => {
        throw new TypeError(
          "Failed to execute 'measure' on 'Performance': '\u200bSignInPage' cannot have a negative time stamp."
        );
      }),
    };

    installSafeReactPerformanceMeasure(targetPerformance);

    expect(() =>
      targetPerformance.measure("\u200bSignInPage", {
        start: -1,
        end: 2,
      })
    ).not.toThrow();
  });

  it("rethrows measure errors that are unrelated to the React devtools track", () => {
    const targetPerformance: TestPerformance = {
      measure: jest.fn(() => {
        throw new TypeError("Unexpected performance failure");
      }),
    };

    installSafeReactPerformanceMeasure(targetPerformance);

    expect(() =>
      targetPerformance.measure("Next.js-render", {
        start: 0,
        end: 1,
      })
    ).toThrow("Unexpected performance failure");
  });

  it("does not wrap measure more than once", () => {
    const originalMeasure = jest.fn(() => "ok");
    const targetPerformance: TestPerformance = {
      measure: originalMeasure,
    };

    installSafeReactPerformanceMeasure(targetPerformance);
    const patchedMeasure = targetPerformance.measure;

    installSafeReactPerformanceMeasure(targetPerformance);

    expect(targetPerformance.measure).toBe(patchedMeasure);
    expect(targetPerformance.measure("Next.js-render")).toBe("ok");
    expect(originalMeasure).toHaveBeenCalledTimes(1);
  });
});
