import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useRouter } from "next/navigation";

import { CommunitySwitcher } from "@/components/platform/community-switcher";

const pushMock = jest.fn();

const memberCommunities = [
  {
    communityId: "community-1",
    name: "Alpha Club",
    slug: "alpha-club",
  },
  {
    communityId: "community-2",
    name: "Beta Club",
    slug: "beta-club",
  },
];

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

describe("CommunitySwitcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pushMock.mockReset();

    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
    });
    (usePathname as jest.Mock).mockReturnValue("/");
  });

  it("does not render the communities trigger on the home route", () => {
    render(<CommunitySwitcher memberCommunities={memberCommunities} />);

    expect(
      screen.queryByRole("button", { name: /comunidades/i })
    ).not.toBeInTheDocument();
  });

  it("keeps the community dropdown trigger unnamed on a community route", () => {
    (usePathname as jest.Mock).mockReturnValue("/comunidad/beta-club");

    render(<CommunitySwitcher memberCommunities={memberCommunities} />);

    expect(
      screen.getByRole("button", { name: /abrir comunidades/i })
    ).toBeInTheDocument();
    expect(screen.getByText("privada")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /beta club/i })
    ).not.toBeInTheDocument();
  });

  it("does not render the private badge when no community is active", () => {
    render(<CommunitySwitcher memberCommunities={memberCommunities} />);

    expect(screen.queryByText("privada")).not.toBeInTheDocument();
  });

  it("shows actions and member communities without search when opened", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/comunidad/beta-club");

    render(<CommunitySwitcher memberCommunities={memberCommunities} />);

    await user.click(screen.getByRole("button", { name: /abrir comunidades/i }));

    expect(screen.getByRole("menuitem", { name: /nueva comunidad/i })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /descubrir comunidades/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /alpha club/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /beta club/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/buscar/i)).not.toBeInTheDocument();
  });

  it("navigates to create, discovery, and selected community routes", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/comunidad/beta-club");

    render(<CommunitySwitcher memberCommunities={memberCommunities} />);

    await user.click(screen.getByRole("button", { name: /abrir comunidades/i }));
    await user.click(screen.getByRole("menuitem", { name: /nueva comunidad/i }));
    expect(pushMock).toHaveBeenLastCalledWith("/comunidad/crear");

    await user.click(screen.getByRole("button", { name: /abrir comunidades/i }));
    await user.click(screen.getByRole("menuitem", { name: /descubrir comunidades/i }));
    expect(pushMock).toHaveBeenLastCalledWith("/");

    await user.click(screen.getByRole("button", { name: /abrir comunidades/i }));
    await user.click(screen.getByRole("menuitem", { name: /alpha club/i }));
    expect(pushMock).toHaveBeenLastCalledWith("/comunidad/alpha-club");
  });

  it("marks only the current community as active when the route matches", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/comunidad/beta-club");

    render(<CommunitySwitcher memberCommunities={memberCommunities} />);

    await user.click(screen.getByRole("button", { name: /abrir comunidades/i }));

    expect(screen.getByRole("menuitem", { name: /beta club/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("menuitem", { name: /alpha club/i })).toHaveAttribute(
      "data-active",
      "false"
    );
    expect(
      screen.getByRole("menuitem", { name: /descubrir comunidades/i })
    ).toHaveAttribute("data-active", "false");
  });

  it("does not render community items on the home route", () => {
    render(<CommunitySwitcher memberCommunities={memberCommunities} />);

    expect(screen.queryByText("Alpha Club")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta Club")).not.toBeInTheDocument();
  });

  it("does not render the switcher when there are no member communities", () => {
    render(<CommunitySwitcher memberCommunities={[]} />);

    expect(
      screen.queryByRole("button", { name: /comunidades/i })
    ).not.toBeInTheDocument();
  });
});
