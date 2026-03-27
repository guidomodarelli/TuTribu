const SAFE_REACT_PERFORMANCE_MEASURE_INSTALLED_KEY =
  "academia-online.safe-react-performance-measure.installed";
const SAFE_REACT_PERFORMANCE_MEASURE_INSTALLED = Symbol.for(
  SAFE_REACT_PERFORMANCE_MEASURE_INSTALLED_KEY
);

const REACT_DEVTOOLS_COMPONENT_MARK_PREFIX = "\u200b";
const NEGATIVE_TIME_STAMP_MESSAGE = "cannot have a negative time stamp";

type PerformanceLike = {
  measure: (
    ...args: Parameters<Performance["measure"]>
  ) => ReturnType<Performance["measure"]> | undefined;
  [SAFE_REACT_PERFORMANCE_MEASURE_INSTALLED]?: boolean;
};

function shouldIgnoreReactDevMeasureError(
  measureName: unknown,
  error: unknown
): boolean {
  return (
    typeof measureName === "string" &&
    measureName.startsWith(REACT_DEVTOOLS_COMPONENT_MARK_PREFIX) &&
    error instanceof Error &&
    error.message.includes(NEGATIVE_TIME_STAMP_MESSAGE)
  );
}

export function installSafeReactPerformanceMeasure(
  targetPerformance: PerformanceLike
): void {
  if (targetPerformance[SAFE_REACT_PERFORMANCE_MEASURE_INSTALLED]) {
    return;
  }

  const originalMeasure = targetPerformance.measure.bind(targetPerformance);

  targetPerformance.measure = (
    ...args: Parameters<Performance["measure"]>
  ): ReturnType<Performance["measure"]> | undefined => {
    try {
      return originalMeasure(...args);
    } catch (error) {
      if (shouldIgnoreReactDevMeasureError(args[0], error)) {
        return undefined;
      }

      throw error;
    }
  };

  targetPerformance[SAFE_REACT_PERFORMANCE_MEASURE_INSTALLED] = true;
}
