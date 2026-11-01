import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdmissionSetupGuide } from "@/components/academy-admissions/admission-setup-guide";
import { deriveAdmissionSetupProgress } from "@/src/modules/academy-admissions/application/queries/admission-setup-progress";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import { AdmissionSetupGuideFallback } from "@/components/academy-admissions/admission-setup-guide-fallback";
import { AdmissionWorkspaceRoute, buildAdmissionMemberTribe } from "@/tests/support/admission-workspace-route";

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
    expect(screen.getByRole("link", { name: "Abrir las admisiones" })).toHaveAttribute("href", "/mi%20tribu/academia/admissions/settings?step=review");
    expect(items[0]).toHaveTextContent("Borrador sin publicar");
    expect(items[3]).toHaveTextContent("Borrador sin publicar");
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

describe("AdmissionSetupGuideFallback", () => {
  const route = "/tribu/academia/admissions";

  it("shows the leader a loading placeholder while the guide is read", () => {
    render(<AppUIProvider><AdmissionWorkspaceRoute pathname={route} slug="tribu" memberTribes={[buildAdmissionMemberTribe({ role: "leader" })]}><AdmissionSetupGuideFallback /></AdmissionWorkspaceRoute></AppUIProvider>);

    expect(screen.getByRole("status", { name: "Cargando la guía de configuración" })).toBeInTheDocument();
  });

  it("shows nothing to a guardian, who never gets a guide", () => {
    render(<AppUIProvider><AdmissionWorkspaceRoute pathname={route} slug="tribu" memberTribes={[buildAdmissionMemberTribe({ role: "guardian" })]}><AdmissionSetupGuideFallback /></AdmissionWorkspaceRoute></AppUIProvider>);

    expect(screen.queryByRole("status", { name: "Cargando la guía de configuración" })).not.toBeInTheDocument();
  });


  it("explains a platform block on the opening step instead of linking to a screen that would fail again", () => {
    const progress = deriveAdmissionSetupProgress({
      policy: { exists: true, open: false, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: null, notifications: null, activation: { platformBlocked: true },
    });
    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={progress} /></AppUIProvider>);
    expect(screen.getByText(/Depende del equipo de TuTribu: la plataforma todavía no permite activar/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir las admisiones" })).not.toBeInTheDocument();
  });

  it("sends closed academy admissions to «Gestionar academia» instead of the rules, which would stop again", () => {
    const progress = deriveAdmissionSetupProgress({
      policy: { exists: true, open: false, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: null, notifications: null, activation: { platformBlocked: false, admissionsClosed: true },
    });
    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={progress} /></AppUIProvider>);
    expect(screen.getByText(/Las admisiones de la academia están cerradas\. Encendé «Admisiones abiertas» en Gestionar academia/)).toBeInTheDocument();
    expect(screen.getByText("Admisiones cerradas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Gestionar academia" })).toHaveAttribute("href", "/tribu/academia/gestionar");
    expect(screen.queryByRole("link", { name: "Abrir las admisiones" })).not.toBeInTheDocument();
    expect(screen.queryByText("Depende del equipo de TuTribu")).not.toBeInTheDocument();
  });
});

describe("AdmissionSetupGuide platform security", () => {
  it("shows one platform notice and no step action while no admission write can be protected, without mentioning a draft", () => {
    const progress = deriveAdmissionSetupProgress({
      policy: { exists: false, open: false, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: { connected: false, usage: null }, notifications: null, activation: { platformBlocked: true }, platformSecurity: "security_unconfigured",
    });
    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={progress} /></AppUIProvider>);

    const notice = screen.getByRole("region", { name: "Depende del equipo de TuTribu" });
    expect(notice).toHaveTextContent("La plataforma todavía no tiene configurada la seguridad que protege estas operaciones.");
    expect(notice).toHaveTextContent("Todavía no se puede configurar ni guardar nada de las admisiones: ni las reglas, ni la mensajería, ni los cupos.");
    expect(notice).toHaveTextContent("Código de diagnóstico: admission_security_unconfigured");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getAllByText("Depende del equipo de TuTribu")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Configurá las admisiones" })).not.toHaveTextContent(/borrador/i);
  });

  it("says saved rules are kept when the platform locks admission writes after they were saved", () => {
    const progress = deriveAdmissionSetupProgress({
      policy: { exists: true, open: false, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: null, notifications: null, platformSecurity: "recovery_locked",
    });
    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={progress} /></AppUIProvider>);

    const notice = screen.getByRole("region", { name: "Depende del equipo de TuTribu" });
    expect(notice).toHaveTextContent("La plataforma pausó estas operaciones mientras recupera un servicio.");
    expect(notice).toHaveTextContent("lo que ya guardaste se conserva");
    expect(notice).toHaveTextContent("Código de diagnóstico: admission_recovery_locked");
    expect(screen.queryByRole("link", { name: "Abrir las admisiones" })).not.toBeInTheDocument();
  });

  it("does not mention a draft on the opening step when a platform reason blocks it before any rules were saved", () => {
    const progress = deriveAdmissionSetupProgress({
      policy: { exists: false, open: false, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: null, notifications: null, activation: { platformBlocked: true },
    });
    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={progress} /></AppUIProvider>);

    expect(screen.getByText("Depende del equipo de TuTribu: la plataforma todavía no permite activar las admisiones de esta academia.")).toBeInTheDocument();
    expect(screen.queryByText(/borrador/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Definir las reglas" })).toHaveAttribute("href", "/tribu/academia/admissions/settings");
  });
});

describe("AdmissionSetupGuide drafts", () => {
  it("marks a saved candidate connection as an unpublished draft", () => {
    const progress = deriveAdmissionSetupProgress({
      policy: { exists: true, open: true, paused: false, sendsCodes: true, verifiesPhone: false },
      messaging: { connected: false, candidatePending: true, usage: null }, notifications: null,
    });
    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={progress} /></AppUIProvider>);
    const items = within(screen.getByRole("list", { name: "Pasos de la configuración" })).getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("Borrador sin publicar");
    expect(screen.getByRole("link", { name: "Conectar mensajería" })).toHaveAttribute("href", "/tribu/academia/admissions/messaging/connections");
  });

  it("warns about a very low notice quota and an omitted personal frequency instead of a clean «Listo»", () => {
    const progress = deriveAdmissionSetupProgress({
      policy: { exists: true, open: true, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: { connected: true, usage: { countryCount: 1, verificationDailyLimit: 10, notificationDailyLimit: 1 } },
      notifications: { emailEnabled: true, receivesEmail: false },
    });
    render(<AppUIProvider><AdmissionSetupGuide slug="tribu" progress={progress} /></AppUIProvider>);
    const items = within(screen.getByRole("list", { name: "Pasos de la configuración" })).getAllByRole("listitem");
    const usage = items.find((item) => item.textContent.includes("Elegí países y cupos"));
    const notifications = items.find((item) => item.textContent.includes("Elegí cómo recibir los avisos"));
    expect(usage).toHaveTextContent("Listo, pero con un cupo muy bajo");
    expect(usage).toHaveTextContent("el cupo de avisos por día es menor a 20");
    expect(notifications).toHaveTextContent("No recibís correos");
    expect(notifications).toHaveTextContent("elegiste «Omitir correos de revisión»: no vas a recibir correos de las solicitudes nuevas.");
    expect(screen.getByRole("link", { name: "Configurar los avisos" })).toHaveAttribute("href", "/tribu/academia/admissions/notifications");
  });
});
