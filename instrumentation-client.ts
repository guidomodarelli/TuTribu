import { installSafeReactPerformanceMeasure } from "@/src/modules/shared/infrastructure/browser/install-safe-react-performance-measure";
import { installSyntheticEventCompat } from "@/src/modules/shared/infrastructure/browser/install-synthetic-event-compat";

// Redact hands handlers native events; Radix controls call SyntheticEvent methods on them.
installSyntheticEventCompat(Event.prototype);

if (process.env.NODE_ENV === "development") {
  try {
    installSafeReactPerformanceMeasure(window.performance);
  } catch {
    // Avoid blocking hydration if the browser rejects performance patching.
  }
}
