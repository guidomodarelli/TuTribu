import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import PlatformLayout from "@/app/(platform)/layout";
import { createGetAuthenticatedMemberUseCase } from "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock(
  "@/src/modules/auth/infrastructure/composition/create-get-authenticated-member-use-case",
  () => ({
    createGetAuthenticatedMemberUseCase: jest.fn(),
  })
);

describe("PlatformLayout", () => {
  const execute = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createGetAuthenticatedMemberUseCase as jest.Mock).mockReturnValue({
      execute,
    });
  });

  it("redirects to sign-in when there is no authenticated member", async () => {
    execute.mockResolvedValue(null);
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      PlatformLayout({
        children: <div>Private section</div>,
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signin?callbackUrl=%2Fdashboard");
  });

  it("renders member identity in the top-right avatar area", async () => {
    execute.mockResolvedValue({
      id: "member-1",
      name: "Grace Hopper",
      role: "admin",
      avatarFallback: "GH",
      image: null,
    });

    render(
      await PlatformLayout({
        children: <div>Private section</div>,
      })
    );

    expect(screen.getByText("GH")).toBeInTheDocument();
    expect(screen.getByText("Private section")).toBeInTheDocument();
  });
});
