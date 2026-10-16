import { render, screen } from "@testing-library/react";

import { MorphLoader } from "@/components/loaders/morph-loader";
import { nearestAngle, shapePoses, strokePath } from "@/components/loaders/morph-loader/morph-loader-geometry";

describe("MorphLoader", () => {
  it("announces the Spanish loading label through a status role", () => {
    render(<MorphLoader />);

    expect(screen.getByRole("status", { name: "Cargando..." })).toHaveAttribute("data-status", "loading");
  });

  it("announces the success and error labels when the request finishes", () => {
    const { rerender } = render(<MorphLoader label="Guardando..." successLabel="Guardado" errorLabel="No se guardó" />);
    expect(screen.getByRole("status", { name: "Guardando..." })).toBeInTheDocument();

    rerender(<MorphLoader label="Guardando..." status="success" successLabel="Guardado" errorLabel="No se guardó" />);
    expect(screen.getByRole("status", { name: "Guardado" })).toHaveAttribute("data-status", "success");

    rerender(<MorphLoader label="Guardando..." status="error" successLabel="Guardado" errorLabel="No se guardó" />);
    expect(screen.getByRole("status", { name: "No se guardó" })).toHaveAttribute("data-status", "error");
  });

  it("stays silent for assistive technology when decorative", () => {
    render(<MorphLoader decorative />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando...")).not.toBeInTheDocument();
  });

  it("keeps its footprint fixed to the requested size", () => {
    render(<MorphLoader size={20} />);

    expect(screen.getByRole("status")).toHaveStyle({ width: "20px", height: "20px" });
  });
});

describe("morph loader geometry", () => {
  it("draws every shape with the same four strokes", () => {
    for (const shape of ["dots", "bars", "ring", "square", "success", "error"] as const) {
      expect(shapePoses(shape, 2.5)).toHaveLength(4);
    }
  });

  it("draws straight strokes as lines and bent strokes as arcs", () => {
    const [squareSide] = shapePoses("square", 2.5);
    const [ringArc] = shapePoses("ring", 2.5);

    expect(strokePath(squareSide)).toBe("M5.000 5.000L19.000 5.000");
    expect(strokePath(ringArc)).toMatch(/^M[\d.]+ [\d.]+A8\.500 8\.500 0 0 1 [\d.]+ [\d.]+$/);
  });

  it("turns by the shortest way, flipping symmetric strokes by half a turn", () => {
    expect(nearestAngle(350, 10, false)).toBe(370);
    expect(nearestAngle(170, 0, true)).toBe(180);
    expect(nearestAngle(170, 0, false)).toBe(0);
  });
});
