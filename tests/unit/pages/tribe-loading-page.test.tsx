import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PlatformLoadingPage from "@/app/(platform)/loading";
import TribeLoadingPage from "@/app/(platform)/[slug]/loading";

describe("TribeLoadingPage", () => {
  it("renders an accessible tribe route loading state", () => {
    render(<TribeLoadingPage />);

    expect(
      screen.getByRole("status", {
        name: "Cargando sección de tribu",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Cargando sección de tribu")).toBeInTheDocument();
  });

  it("stays inside the platform layout's main landmark instead of opening a second one", () => {
    render(
      <main>
        <TribeLoadingPage />
      </main>
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});

describe("PlatformLoadingPage", () => {
  it("announces the loading state without opening a second main landmark", () => {
    render(
      <main>
        <PlatformLoadingPage />
      </main>
    );

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});
