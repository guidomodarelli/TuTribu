import type { ExternalProfilePictureProvider } from "@/src/modules/auth/domain/repositories/external-profile-picture-provider";
import type { MemberProfileRepository } from "@/src/modules/auth/domain/repositories/member-profile-repository";
import { PROFILE_IMAGE_REFRESH_OUTCOME } from "@/src/modules/auth/application/results/profile-image-refresh-result";
import { refreshMemberProfileImage } from "@/src/modules/auth/application/use-cases/refresh-member-profile-image-use-case";

const MEMBER_ID = "member-1";
const STORED_IMAGE = "https://lh3.googleusercontent.com/a/old=s96-c";
const FRESH_IMAGE = "https://lh3.googleusercontent.com/a/new=s96-c";

function createLogger() {
  return {
    error: jest.fn(),
    info: jest.fn(),
  };
}

describe("refreshMemberProfileImage", () => {
  it("updates the stored image when the provider returns a different URL", async () => {
    const memberProfileRepository: MemberProfileRepository = {
      getImage: jest.fn().mockResolvedValue(STORED_IMAGE),
      updateImage: jest.fn().mockResolvedValue(undefined),
    };
    const externalProfilePictureProvider: ExternalProfilePictureProvider = {
      getCurrentPictureUrl: jest.fn().mockResolvedValue(FRESH_IMAGE),
    };
    const logger = createLogger();

    const result = await refreshMemberProfileImage({
      externalProfilePictureProvider,
      logger,
      memberProfileRepository,
    })(MEMBER_ID);

    expect(memberProfileRepository.updateImage).toHaveBeenCalledWith(
      MEMBER_ID,
      FRESH_IMAGE
    );
    expect(result.outcome).toBe(PROFILE_IMAGE_REFRESH_OUTCOME.updated);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("skips the update when the provider returns the same URL", async () => {
    const memberProfileRepository: MemberProfileRepository = {
      getImage: jest.fn().mockResolvedValue(STORED_IMAGE),
      updateImage: jest.fn().mockResolvedValue(undefined),
    };
    const externalProfilePictureProvider: ExternalProfilePictureProvider = {
      getCurrentPictureUrl: jest.fn().mockResolvedValue(STORED_IMAGE),
    };

    const result = await refreshMemberProfileImage({
      externalProfilePictureProvider,
      logger: createLogger(),
      memberProfileRepository,
    })(MEMBER_ID);

    expect(memberProfileRepository.updateImage).not.toHaveBeenCalled();
    expect(result.outcome).toBe(PROFILE_IMAGE_REFRESH_OUTCOME.skipped);
  });

  it("skips the update when the provider exposes no picture", async () => {
    const memberProfileRepository: MemberProfileRepository = {
      getImage: jest.fn().mockResolvedValue(STORED_IMAGE),
      updateImage: jest.fn().mockResolvedValue(undefined),
    };
    const externalProfilePictureProvider: ExternalProfilePictureProvider = {
      getCurrentPictureUrl: jest.fn().mockResolvedValue(null),
    };

    const result = await refreshMemberProfileImage({
      externalProfilePictureProvider,
      logger: createLogger(),
      memberProfileRepository,
    })(MEMBER_ID);

    expect(memberProfileRepository.updateImage).not.toHaveBeenCalled();
    expect(result.outcome).toBe(PROFILE_IMAGE_REFRESH_OUTCOME.skipped);
  });

  it("treats an aborted operation as a benign cancellation without logging an error", async () => {
    const abortError = new DOMException(
      "This operation was aborted",
      "AbortError"
    );
    const memberProfileRepository: MemberProfileRepository = {
      getImage: jest.fn().mockResolvedValue(STORED_IMAGE),
      updateImage: jest.fn().mockResolvedValue(undefined),
    };
    const externalProfilePictureProvider: ExternalProfilePictureProvider = {
      getCurrentPictureUrl: jest.fn().mockRejectedValue(abortError),
    };
    const logger = createLogger();

    const result = await refreshMemberProfileImage({
      externalProfilePictureProvider,
      logger,
      memberProfileRepository,
    })(MEMBER_ID);

    expect(result.outcome).toBe(PROFILE_IMAGE_REFRESH_OUTCOME.aborted);
    expect(memberProfileRepository.updateImage).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs and does not rethrow when the provider fails", async () => {
    const providerError = new Error("provider unreachable");
    const memberProfileRepository: MemberProfileRepository = {
      getImage: jest.fn().mockResolvedValue(STORED_IMAGE),
      updateImage: jest.fn().mockResolvedValue(undefined),
    };
    const externalProfilePictureProvider: ExternalProfilePictureProvider = {
      getCurrentPictureUrl: jest.fn().mockRejectedValue(providerError),
    };
    const logger = createLogger();

    const result = await refreshMemberProfileImage({
      externalProfilePictureProvider,
      logger,
      memberProfileRepository,
    })(MEMBER_ID);

    expect(result.outcome).toBe(PROFILE_IMAGE_REFRESH_OUTCOME.failed);
    expect(memberProfileRepository.updateImage).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: providerError })
    );
  });
});
