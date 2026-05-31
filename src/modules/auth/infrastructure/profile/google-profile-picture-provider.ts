import "server-only";

import { GOOGLE_USERINFO_ENDPOINT } from "@/src/modules/auth/constants/google-profile";
import type { ExternalProfilePictureProvider } from "@/src/modules/auth/domain/repositories/external-profile-picture-provider";

/**
 * Resolves a usable Google access token for a member. Implementations encapsulate
 * the offline-credential handling (decryption and refresh) so this adapter only
 * deals with the userinfo request.
 */
type GoogleAccessTokenResolver = (userId: string) => Promise<string | null>;

type FetchImplementation = typeof fetch;

type GoogleProfilePictureProviderDependencies = {
  /** HTTP client used to call the userinfo endpoint. Defaults to global fetch. */
  fetchImplementation?: FetchImplementation;
  /** Resolver for a fresh Google access token scoped to the member. */
  getAccessToken: GoogleAccessTokenResolver;
};

type GoogleUserInfo = {
  picture?: unknown;
};

const GOOGLE_PROFILE_ERROR_MESSAGE = {
  userInfoRequestFailed:
    "Google OpenID userinfo profile picture request failed with status",
} as const;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
/**
 * Status codes that mean the stored Google credentials cannot be used for
 * userinfo anymore and should not make the background refresh noisy.
 */
const UNUSABLE_GOOGLE_USERINFO_CREDENTIAL_STATUS_CODES: ReadonlySet<number> =
  new Set([HTTP_STATUS_UNAUTHORIZED, HTTP_STATUS_FORBIDDEN]);

/**
 * Checks whether Google rejected the userinfo request because the credentials
 * are no longer usable for this member.
 *
 * @param statusCode - HTTP status code returned by the Google userinfo request.
 * @returns Whether the profile picture refresh should be skipped quietly.
 */
function isUnusableGoogleUserInfoCredentialStatus(
  statusCode: number
): boolean {
  return UNUSABLE_GOOGLE_USERINFO_CREDENTIAL_STATUS_CODES.has(statusCode);
}

/**
 * Reads a member's current Google profile picture from the OpenID userinfo
 * endpoint, using a freshly resolved access token.
 *
 * The userinfo endpoint is preferred over decoding a refreshed id token because
 * the id token returned by a token refresh can be a stale, previously stored
 * value.
 */
export class GoogleProfilePictureProvider
  implements ExternalProfilePictureProvider
{
  private readonly fetchImplementation: FetchImplementation;
  private readonly getAccessToken: GoogleAccessTokenResolver;

  constructor({
    fetchImplementation = fetch,
    getAccessToken,
  }: GoogleProfilePictureProviderDependencies) {
    this.fetchImplementation = fetchImplementation;
    this.getAccessToken = getAccessToken;
  }

  /**
   * Fetches the member's current Google profile picture URL from userinfo.
   *
   * @param userId - Identifier of the member whose stored Google credentials are used.
   * @returns The current Google picture URL, or `null` when no usable picture can be resolved.
   * @throws When Google userinfo fails with an unexpected HTTP status.
   */
  async getCurrentPictureUrl(userId: string): Promise<string | null> {
    const accessToken = await this.getAccessToken(userId);

    if (!accessToken) {
      return null;
    }

    const response = await this.fetchImplementation(GOOGLE_USERINFO_ENDPOINT, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (isUnusableGoogleUserInfoCredentialStatus(response.status)) {
        return null;
      }

      throw new Error(
        `${GOOGLE_PROFILE_ERROR_MESSAGE.userInfoRequestFailed} ${response.status}`
      );
    }

    const userInfo = (await response.json()) as GoogleUserInfo;
    const picture = userInfo.picture;

    return typeof picture === "string" && picture.length > 0 ? picture : null;
  }
}
