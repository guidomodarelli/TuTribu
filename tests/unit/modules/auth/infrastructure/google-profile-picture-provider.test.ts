import { vi, describe, it, expect } from "vitest";
import { GOOGLE_USERINFO_ENDPOINT } from "@/src/modules/auth/constants/google-profile";
import { GoogleProfilePictureProvider } from "@/src/modules/auth/infrastructure/profile/google-profile-picture-provider";

const MEMBER_ID = "member-1";
const ACCESS_TOKEN = "ya29.access-token";
const PICTURE_URL = "https://lh3.googleusercontent.com/a/current=s96-c";
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

/**
 * Builds a minimal fetch `Response` double for Google userinfo scenarios.
 *
 * @param body - JSON payload returned by the fake response.
 * @param ok - Whether the response should be treated as successful.
 * @param status - HTTP status code exposed by the fake response.
 * @returns A response-shaped test double.
 */
function createJsonResponse(body: unknown, ok = true, status = HTTP_STATUS_OK) {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok,
    status,
  } as unknown as Response;
}

describe("GoogleProfilePictureProvider", () => {
  it("returns the current picture from the userinfo endpoint", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ picture: PICTURE_URL }));
    const getAccessToken = vi.fn().mockResolvedValue(ACCESS_TOKEN);

    const provider = new GoogleProfilePictureProvider({
      fetchImplementation,
      getAccessToken,
    });

    const result = await provider.getCurrentPictureUrl(MEMBER_ID);

    expect(result).toBe(PICTURE_URL);
    expect(getAccessToken).toHaveBeenCalledWith(MEMBER_ID);
    expect(fetchImplementation).toHaveBeenCalledWith(
      GOOGLE_USERINFO_ENDPOINT,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      })
    );
  });

  it("returns null when the userinfo response has no picture", async () => {
    const provider = new GoogleProfilePictureProvider({
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(createJsonResponse({ sub: "google-user-id" })),
      getAccessToken: vi.fn().mockResolvedValue(ACCESS_TOKEN),
    });

    expect(await provider.getCurrentPictureUrl(MEMBER_ID)).toBeNull();
  });

  it("returns null when no access token is available", async () => {
    const fetchImplementation = vi.fn();
    const provider = new GoogleProfilePictureProvider({
      fetchImplementation,
      getAccessToken: vi.fn().mockResolvedValue(null),
    });

    expect(await provider.getCurrentPictureUrl(MEMBER_ID)).toBeNull();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([HTTP_STATUS_UNAUTHORIZED, HTTP_STATUS_FORBIDDEN])(
    "returns null when Google userinfo rejects the access token with status %s",
    async (statusCode) => {
      const provider = new GoogleProfilePictureProvider({
        fetchImplementation: vi
          .fn()
          .mockResolvedValue(createJsonResponse({}, false, statusCode)),
        getAccessToken: vi.fn().mockResolvedValue(ACCESS_TOKEN),
      });

      await expect(provider.getCurrentPictureUrl(MEMBER_ID)).resolves.toBeNull();
    }
  );

  it("throws when the userinfo request fails unexpectedly", async () => {
    const provider = new GoogleProfilePictureProvider({
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(
          createJsonResponse({}, false, HTTP_STATUS_INTERNAL_SERVER_ERROR)
        ),
      getAccessToken: vi.fn().mockResolvedValue(ACCESS_TOKEN),
    });

    await expect(provider.getCurrentPictureUrl(MEMBER_ID)).rejects.toThrow();
  });
});
