/**
 * PATCH /api/tribes/[slug]/verification-providers/[providerId] — update or
 * deactivate a provider (leader only). Deactivating blocks new requests but
 * never deletes verifications nor revokes granted access.
 *
 * @module tribe-verification-provider-route
 */

import { verificationProviderDtoSchema } from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import { saveVerificationProviderFromRoute } from "@/app/api/tribes/[slug]/verification-providers/save-verification-provider";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ providerId: string; slug: string }> }
) {
  return saveVerificationProviderFromRoute({
    context,
    dtoSchema: verificationProviderDtoSchema,
    request,
  });
}
