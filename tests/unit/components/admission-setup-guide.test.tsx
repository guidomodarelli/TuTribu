import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdmissionSetupGuide } from "@/components/academy-admissions/admission-setup-guide";
import { deriveAdmissionSetupProgress } from "@/src/modules/academy-admissions/application/queries/admission-setup-progress";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";

const draftOnly = deriveAdmissionSetupProgress({
  policy: { exists: true, open: false, paused: false, sendsCodes: false, verifiesPhone: false },
  messaging: { connected: false, usage: null },
  notifications: { emailEnabled: false, receivesEmail: false },
});

describe("AdmissionSetupGuide", () => {
  it("lists the steps in order and offers only the next one as an action", () => {
    render(<AppUIProvider><AdmissionSetupGuide slug="mi tribu" progress={draftOnly} /></AppUIProvider>);

    const list = screen.getByRole("list", { name: "Pasos de la configuración" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Definí cómo se admite"),
      expect.stringContaining("Conectá el envío de mensajes"),
      expect.stringContaining("Elegí países y cupos"),
      expect.stringContaining("Abrí las admisiones"),
      expect.stringContaining("Elegí cómo recibir los avisos"),
    ]);
    expect(items[3]).toHaveAttribute("aria-current", "step");
    expect(within(items[1]).getByText("Opcional")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Abrir las admisiones" })).toHaveAttribute("href", "/mi%20tribu/academia/admissions/settings");
    expect(screen.getByRole("progressbar", { name: "Avance de la configuración" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("1 de 2 pasos necesarios listos")).toBeInTheDocument();
  });

  it("explains that paused admissions do not accept applicants", () => {
    const paused = deriveAdmissionSetupProgress({
      policy: { exists: true, open: false, paused: true, sendsCodes: false, verifiesPhone: false },
      messaging: null,
      notifications: null,
    });

    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={paused} /></AppUIProvider>);

    expect(screen.getByText("Las admisiones están pausadas: nadie puede postularse.")).toBeInTheDocument();
  });

  it("renders nothing once every step is done", () => {
    const done = deriveAdmissionSetupProgress({
      policy: { exists: true, open: true, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: { connected: true, usage: { countryCount: 1, verificationDailyLimit: 10, notificationDailyLimit: 20 } },
      notifications: { emailEnabled: true, receivesEmail: true },
    });

    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={done} /></AppUIProvider>);

    expect(screen.queryByRole("region", { name: "Configurá las admisiones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Pasos de la configuración" })).not.toBeInTheDocument();
  });
});
