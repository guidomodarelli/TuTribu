import {
  CREATE_TRIBE_STATUS,
} from "@/src/modules/tribes/application/results/create-tribe-result";

/** Fields of the create-tribe form that can own an inline error. */
export type CreateTribeFormErrorField = "name" | "slug";

export const CREATE_TRIBE_FORM_ERROR_FIELD = {
  name: "name",
  slug: "slug",
} as const satisfies Record<string, CreateTribeFormErrorField>;

/**
 * UI contract between the create-tribe form and whoever submits it: either
 * the submission is navigating away (the form keeps the submit locked) or it
 * failed with a safe message, the field that owns it (`null` for form-level
 * failures) and an optional suggested slug.
 */
export type CreateTribeFormSubmitOutcome =
  | { status: "navigating" }
  | {
      field: CreateTribeFormErrorField | null;
      message: string;
      status: "failed";
      suggestedSlug: string | null;
    };

export const CREATE_TRIBE_FORM_SUBMIT_STATUS = {
  failed: "failed",
  navigating: "navigating",
} as const satisfies Record<string, CreateTribeFormSubmitOutcome["status"]>;

/** Values the form hands to its submit callback. */
export type CreateTribeFormValues = {
  name: string;
  slug: string;
};

/**
 * Resolves which form field owns a creation error code, so the form marks it
 * invalid and moves focus to it. Unknown and form-level codes return `null`.
 *
 * @param errorCode - Create-tribe status or error code.
 * @returns The field that owns the error, or `null` for form-level errors.
 */
export function resolveCreateTribeErrorField(
  errorCode: string | null
): CreateTribeFormErrorField | null {
  switch (errorCode) {
    case CREATE_TRIBE_STATUS.invalidName:
      return CREATE_TRIBE_FORM_ERROR_FIELD.name;
    case CREATE_TRIBE_STATUS.invalidSlug:
    case CREATE_TRIBE_STATUS.slugConflict:
      return CREATE_TRIBE_FORM_ERROR_FIELD.slug;
    default:
      return null;
  }
}
