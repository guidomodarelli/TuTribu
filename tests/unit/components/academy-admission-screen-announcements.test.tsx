/** The admission page announces an uncertain result once, through its own alert. @module academy-admission-screen-announcements-tests */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it, vi } from "vitest";
import { AdmissionScreen } from "@/components/academy-admissions/admission-screen";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { ADMISSION_UI_COPY, ADMISSION_UI_PHASE } from "@/src/modules/academy-admissions/constants/admission-ui";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

const router = { back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } as unknown as AppRouterInstance;

/** Real framework and UI providers, without library mocks. */
function Providers({ children }: { children: ReactNode }) { return <AppRouterContext.Provider value={router}><AppUIProvider>{children}</AppUIProvider></AppRouterContext.Provider>; }

const unavailable = { kind: "unavailable" as const, code: ADMISSION_ERROR_CODE.dependencyUnavailable, message: ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.dependencyUnavailable] };

describe("admission screen announcements", () => {
  it("should show the uncertain result once when the alert already carries it", () => {
    render(<AdmissionScreen state={unavailable} phase={ADMISSION_UI_PHASE.uncertain} errorMessage={ADMISSION_UI_COPY.uncertain} />, { wrapper: Providers });

    expect(screen.getAllByText(ADMISSION_UI_COPY.uncertain)).toHaveLength(1);
    expect(screen.getByText(ADMISSION_UI_COPY.uncertain)).toHaveAttribute("role", "alert");
  });

  it("should keep the uncertain notice next to a different, more specific failure", () => {
    const timeout = "La respuesta tardó demasiado. Consultá el estado antes de repetir la acción.";
    render(<AdmissionScreen state={unavailable} phase={ADMISSION_UI_PHASE.uncertain} errorMessage={timeout} />, { wrapper: Providers });

    expect(screen.getByText(ADMISSION_UI_COPY.uncertain)).toBeInTheDocument();
    expect(screen.getByText(timeout)).toHaveAttribute("role", "alert");
  });
});
