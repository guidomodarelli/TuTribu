import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname, useRouter } from "next/navigation";

import { TribeSwitcher } from "@/components/platform/tribe-switcher";

const pushMock = jest.fn();

const memberTribes = [
  {
    tribeId: "tribe-1",
    name: "Alpha Club",
    role: "tribemate" as const,
    slug: "alpha-club",
  },
  {
    tribeId: "tribe-2",
    name: "Beta Club",
    role: "leader" as const,
    slug: "beta-club",
  },
];

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

describe("TribeSwitcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pushMock.mockReset();

    (useRouter as jest.Mock).mockReturnValue({
      push: pushMock,
    });
    (usePathname as jest.Mock).mockReturnValue("/");
  });

  it("does not render the tribes trigger on the home route", () => {
    render(<TribeSwitcher memberTribes={memberTribes} />);

    expect(
      screen.queryByRole("button", { name: /tribus/i })
    ).not.toBeInTheDocument();
  });

  it("keeps the tribe dropdown trigger unnamed on a tribe route", () => {
    (usePathname as jest.Mock).mockReturnValue("/beta-club");

    render(<TribeSwitcher memberTribes={memberTribes} />);

    expect(
      screen.getByRole("button", { name: /abrir tribus/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Tribu privada")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /beta club/i })
    ).not.toBeInTheDocument();
  });

  it("does not render the private badge when no tribe is active", () => {
    render(<TribeSwitcher memberTribes={memberTribes} />);

    expect(screen.queryByText("Tribu privada")).not.toBeInTheDocument();
  });

  it("shows actions and member tribes without search when opened", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/beta-club");

    render(<TribeSwitcher memberTribes={memberTribes} />);

    await user.click(screen.getByRole("button", { name: /abrir tribus/i }));

    expect(screen.getByRole("menuitem", { name: /nueva tribu/i })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /descubrir tribus/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /alpha club/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /beta club/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/buscar/i)).not.toBeInTheDocument();
  });

  it("navigates to create, discovery, and selected tribe routes", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/beta-club");

    render(<TribeSwitcher memberTribes={memberTribes} />);

    await user.click(screen.getByRole("button", { name: /abrir tribus/i }));
    await user.click(screen.getByRole("menuitem", { name: /nueva tribu/i }));
    expect(pushMock).toHaveBeenLastCalledWith("/-/crear");

    await user.click(screen.getByRole("button", { name: /abrir tribus/i }));
    await user.click(screen.getByRole("menuitem", { name: /descubrir tribus/i }));
    expect(pushMock).toHaveBeenLastCalledWith("/");

    await user.click(screen.getByRole("button", { name: /abrir tribus/i }));
    await user.click(screen.getByRole("menuitem", { name: /alpha club/i }));
    expect(pushMock).toHaveBeenLastCalledWith("/alpha-club");
  });

  it("marks only the current tribe as active when the route matches", async () => {
    const user = userEvent.setup();
    (usePathname as jest.Mock).mockReturnValue("/beta-club");

    render(<TribeSwitcher memberTribes={memberTribes} />);

    await user.click(screen.getByRole("button", { name: /abrir tribus/i }));

    expect(screen.getByRole("menuitem", { name: /beta club/i })).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByRole("menuitem", { name: /alpha club/i })).toHaveAttribute(
      "data-active",
      "false"
    );
    expect(
      screen.getByRole("menuitem", { name: /descubrir tribus/i })
    ).toHaveAttribute("data-active", "false");
  });

  it("does not render tribe items on the home route", () => {
    render(<TribeSwitcher memberTribes={memberTribes} />);

    expect(screen.queryByText("Alpha Club")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta Club")).not.toBeInTheDocument();
  });

  it("does not render the switcher when there are no member tribes", () => {
    render(<TribeSwitcher memberTribes={[]} />);

    expect(
      screen.queryByRole("button", { name: /tribus/i })
    ).not.toBeInTheDocument();
  });
});
