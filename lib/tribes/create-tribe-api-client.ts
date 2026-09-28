import { createTribePublicResponseSchema } from "@/src/modules/tribes/application/results/create-tribe-public-dto-schemas";
import type { CreateTribePublicResponse } from "@/src/modules/tribes/application/results/create-tribe-result";

/**
 * Browser adapter of `POST /api/tribes` for the enhanced create-tribe form.
 * It posts the same form fields as the native form, asks for JSON, and checks
 * the body with `safeParse` against the public DTO schema. A network failure
 * or a body outside the contract is a failure without message, so the caller
 * shows its own fallback copy.
 */

export type CreateTribeRequestResult =
  | { isSuccess: true; response: CreateTribePublicResponse }
  | { isSuccess: false };

const CREATE_TRIBE_REQUEST = {
  acceptHeader: "Accept",
  jsonMediaType: "application/json",
  methodPost: "POST",
} as const;

/** Form field names read by the route, shared with the native form post. */
const CREATE_TRIBE_REQUEST_FIELD = {
  name: "name",
  slug: "slug",
} as const;

const NO_STORE_CACHE: RequestCache = "no-store";

/**
 * Submits a tribe creation and returns the validated public response.
 *
 * @param input - Endpoint path plus the tribe name and canonical slug.
 * @returns The parsed response, or a failure without message when the request
 *   did not complete or the body breaks the public contract.
 */
export async function submitCreateTribeRequest(input: {
  name: string;
  slug: string;
  submitPath: string;
}): Promise<CreateTribeRequestResult> {
  const formData = new FormData();

  formData.set(CREATE_TRIBE_REQUEST_FIELD.name, input.name);
  formData.set(CREATE_TRIBE_REQUEST_FIELD.slug, input.slug);

  try {
    const response = await fetch(input.submitPath, {
      body: formData,
      cache: NO_STORE_CACHE,
      headers: { [CREATE_TRIBE_REQUEST.acceptHeader]: CREATE_TRIBE_REQUEST.jsonMediaType },
      method: CREATE_TRIBE_REQUEST.methodPost,
    });
    const body: unknown = await response.json().catch(() => null);
    const parsedResponse = createTribePublicResponseSchema.safeParse(body);

    return parsedResponse.success
      ? { isSuccess: true, response: parsedResponse.data }
      : { isSuccess: false };
  } catch {
    // A rejected fetch is a network failure: the caller maps it to safe copy.
    return { isSuccess: false };
  }
}
