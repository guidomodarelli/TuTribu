import { render, screen } from "@testing-library/react";

import DashboardPage from "@/app/(platform)/dashboard/page";

describe("DashboardPage", () => {
  it("renders the dashboard placeholder and aggregate stats", async () => {
    render(await DashboardPage());

    expect(
      screen.getByRole("heading", {
        name: /una sala de control estable para la siguiente fase del producto/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Cursos")).toBeInTheDocument();
    expect(screen.getByText("Publicaciones")).toBeInTheDocument();
    expect(screen.getByText("Eventos")).toBeInTheDocument();
  });
});
