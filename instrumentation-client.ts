import { installSafeReactPerformanceMeasure } from "@/src/modules/shared/infrastructure/browser/install-safe-react-performance-measure";

if (process.env.NODE_ENV === "development") {
  try {
    installSafeReactPerformanceMeasure(window.performance);
  } catch {
    // Avoid blocking hydration if the browser rejects performance patching.
  }
}
