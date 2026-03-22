import { render, screen } from "@testing-library/react";

import DashboardPage from "@/app/(platform)/dashboard/page";

describe("DashboardPage", () => {
  it("renders the dashboard placeholder and aggregate stats", async () => {
    render(await DashboardPage());

    expect(
      screen.getByRole("heading", {
        name: /a stable control room for the next product phase/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Courses")).toBeInTheDocument();
    expect(screen.getByText("Posts")).toBeInTheDocument();
    expect(screen.getByText("Events")).toBeInTheDocument();
  });
});
