import { render, screen } from "@testing-library/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  HomePageContent,
  HomePageView,
} from "@/app/(platform)/home-page-content";
import { createRequestModules } from "@/src/modules/setup";

const getAuthenticatedMember = jest.fn();
const resolveTribeMemberSubscriptionReturnPath = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/src/modules/setup", () => ({
  createRequestModules: jest.fn(),
}));

describe("HomePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthenticatedMember.mockReset();
    (headers as jest.Mock).mockResolvedValue(new Headers());

    (createRequestModules as jest.Mock).mockResolvedValue({
      auth: {
        useCases: {
          getAuthenticatedMember,
        },
      },
      subscriptions: {
        useCases: {
          resolveTribeMemberSubscriptionReturnPath,
        },
      },
    });
    resolveTribeMemberSubscriptionReturnPath.mockReset();
  });

  it("renders the sign in call to action when there is no authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue(null);

    render(await HomePageContent());

    expect(
      screen.getByRole("heading", {
        name: /un espacio para aprender, compartir y crecer en tribu/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /entra a tu cuenta para descubrir tribus, conectar con otras personas y empezar a construir tu propio espacio/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iniciar sesion/i })
    ).toHaveAttribute("href", "/auth/signin");
  });

  it("hides the sign in call to action when there is an authenticated member", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "grace.hopper@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });

    render(await HomePageContent());

    expect(
      screen.queryByRole("link", { name: /iniciar sesion/i })
    ).not.toBeInTheDocument();
  });

  it("renders a neutral pending view before authentication is resolved", () => {
    render(<HomePageView isAuthenticated={null} />);

    expect(
      screen.getByText(/preparando tu espacio dentro de la plataforma/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /iniciar sesion/i })
    ).not.toBeInTheDocument();
  });

  it("redirects Mercado Pago subscription returns from home to the tribe", async () => {
    getAuthenticatedMember.mockResolvedValue({
      id: "member-1",
      email: "grace.hopper@example.com",
      name: "Grace Hopper",
      role: "tribemate",
      avatarFallback: "GH",
      image: null,
    });
    resolveTribeMemberSubscriptionReturnPath.mockResolvedValue(
      "/tribu/matematica-pro?preapproval_id=preapproval-1"
    );
    (redirect as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      HomePageContent({
        searchParams: Promise.resolve({
          preapproval_id: "preapproval-1",
        }),
      })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(resolveTribeMemberSubscriptionReturnPath).toHaveBeenCalledWith({
      providerSubscriptionId: "preapproval-1",
    });
    expect(redirect).toHaveBeenCalledWith(
      "/tribu/matematica-pro?preapproval_id=preapproval-1"
    );
  });
});
