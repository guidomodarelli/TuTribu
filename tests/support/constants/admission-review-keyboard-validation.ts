/** Bounds actual administrative keyboard journeys independently of product deadlines. @module admission-review-keyboard-validation */
export const ADMISSION_REVIEW_KEYBOARD_VALIDATION = { maximumTraversalSteps: 250, testTimeoutMs: 1_800_000 } as const;

/** Selects actual browser input without replacing the application or its UI library. */
export type AdmissionReviewBrowserInteraction = "pointer" | "keyboard";
/** Keeps the existing pointer journeys and the additional keyboard journey explicit. */
export const ADMISSION_REVIEW_BROWSER_INTERACTION = { pointer: "pointer", keyboard: "keyboard" } as const satisfies Record<string, AdmissionReviewBrowserInteraction>;
