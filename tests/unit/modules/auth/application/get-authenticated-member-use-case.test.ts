import type { AuthSessionRepository } from "@/src/modules/auth/domain/repositories/auth-session-repository";
import { getAuthenticatedMember } from "@/src/modules/auth/application/use-cases/get-authenticated-member-use-case";

describe("getAuthenticatedMember", () => {
  it("returns the authenticated member from the repository", async () => {
    const authSessionRepository: AuthSessionRepository = {
      getAuthenticatedMember: jest.fn().mockResolvedValue({
        id: "member-1",
        email: "grace.hopper@example.com",
        name: "Grace Hopper",
        role: "member",
        avatarFallback: "GH",
        image: null,
      }),
    };

    const result = await getAuthenticatedMember({
      authSessionRepository,
    })();

    expect(result).toEqual({
      id: "member-1",
      email: "grace.hopper@example.com",
      name: "Grace Hopper",
      role: "member",
      avatarFallback: "GH",
      image: null,
    });
    expect(authSessionRepository.getAuthenticatedMember).toHaveBeenCalledTimes(1);
  });
});
