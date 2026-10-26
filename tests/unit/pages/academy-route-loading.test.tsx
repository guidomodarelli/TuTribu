import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import AcademyLoading from "@/app/(platform)/[slug]/academia/loading";
import AcademyManagementLoading from "@/app/(platform)/[slug]/academia/gestionar/loading";
import AcademyVerificationLoading from "@/app/(platform)/[slug]/academia/verificacion/loading";
import SubscriptionLoading from "@/app/(platform)/[slug]/suscripcion/loading";
import ChannelsLoading from "@/app/(platform)/[slug]/canales/loading";

/** The tribe round skeleton these routes used to borrow; none of them shows a message feed. */
const TRIBE_ROUND_LOADING_STATUS = "Cargando sección de tribu";

/** Route, its loading boundary, the region name, its single announcement and the static title it can show at once. */
const PLATFORM_ROUTE_LOADINGS: readonly [string, ComponentType, string, string, string | null][] = [
  ["academia", AcademyLoading, "Academia", "Cargando la academia…", null],
  ["gestionar", AcademyManagementLoading, "Gestionar academia", "Cargando la gestión de la academia…", "Gestionar academia"],
  ["verificación", AcademyVerificationLoading, "Verificación de vinculación", "Cargando la verificación…", "Verificación de vinculación"],
  ["suscripción", SubscriptionLoading, "Suscripción", "Cargando tu suscripción…", null],
  ["canales", ChannelsLoading, "Canales", "Cargando los canales…", "Canales"],
];

describe("academy and tribe settings route loading", () => {
  it.each(PLATFORM_ROUTE_LOADINGS)("should announce the %s page once inside the platform main, under its own name", (_route, Loading, regionName, status, title) => {
    render(<main><Loading /></main>);

    const region = screen.getByRole("region", { name: regionName });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(within(region).getAllByRole("status")).toHaveLength(1);
    expect(within(region).getByRole("status")).toHaveTextContent(status);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    if (title) expect(within(region).getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it.each(PLATFORM_ROUTE_LOADINGS)("should not borrow the tribe round skeleton or offer controls while the %s page reads", (_route, Loading) => {
    render(<main><Loading /></main>);

    expect(screen.queryByText(TRIBE_ROUND_LOADING_STATUS)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
