/** Exercises explicit diagnostic consent and capability-specific destinations with actual shared UI. @module messaging-diagnostic-presenter-tests */
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnectionDiagnostic} from "@/components/academy-admissions/messaging-connection-diagnostic";

/** @returns Controlled proposals and safe own state; provider, session and persistence belong to the route. */
function diagnosticFixture(){return{channel:"email" as const,recipient:"",country:"",verificationCode:"",confirmed:false,busy:false,canIssue:false,canVerify:false,allowedCountries:[],usage:{state:"not_configured" as const,policy:null},diagnostic:null,delivery:null,message:null,fieldErrors:{},onChannelChange:vi.fn(),onRecipientChange:vi.fn(),onCountryChange:vi.fn(),onCodeChange:vi.fn(),onConfirm:vi.fn(),onIssue:vi.fn(),onResend:vi.fn(),onVerify:vi.fn(),onReadDelivery:vi.fn(),onIssueReauthenticate:vi.fn(),onVerifyReauthenticate:vi.fn()};}

describe("connection diagnostic presentation",()=>{
  it("should disclose the destination and consumption before an explicit issue action without issuing on render",async()=>{
    const props=diagnosticFixture(),user=userEvent.setup();render(<MessagingConnectionDiagnostic {...props} recipient="diagnostic@example.test" />);
    expect(screen.getByLabelText("Destino de la prueba")).toBeVisible();expect(screen.getByText(/El envío de la prueba consume/i)).toBeVisible();expect(screen.getByRole("button",{name:"Enviar código de prueba"})).toBeDisabled();expect(props.onIssue).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox",{name:/Confirmo el destino y el consumo/i}));expect(props.onConfirm).toHaveBeenCalledWith(true);expect(props.onIssue).not.toHaveBeenCalled();
  });
  it("should explain and block a phone diagnostic before saved country preparation while keeping email independent",()=>{
    const props=diagnosticFixture();render(<MessagingConnectionDiagnostic {...props} channel="sms" />);
    expect(screen.getByText(/Guardá los países de mensajería/i)).toBeVisible();expect(screen.getByRole("button",{name:"Enviar código de prueba"})).toBeDisabled();expect(props.onIssue).not.toHaveBeenCalled();
  });
  it("should associate a missing saved-country error with the phone selector and clear obsolete feedback",()=>{
    const props=diagnosticFixture(),{rerender}=render(<MessagingConnectionDiagnostic {...props} channel="sms" allowedCountries={["AR"]} fieldErrors={{country:"Elegí un país guardado para ese teléfono."}} />);
    const country=screen.getByRole("combobox",{name:"País guardado del teléfono"});expect(country).toHaveAttribute("aria-invalid","true");expect(country).toHaveAccessibleDescription("Elegí un país guardado para ese teléfono.");expect(screen.getByText("Elegí un país guardado para ese teléfono.")).toBeVisible();
    rerender(<MessagingConnectionDiagnostic {...props} channel="sms" country="AR" allowedCountries={["AR"]} fieldErrors={{}} />);expect(country).not.toHaveAttribute("aria-invalid","true");expect(screen.queryByText("Elegí un país guardado para ese teléfono.")).not.toBeInTheDocument();expect(props.onIssue).not.toHaveBeenCalled();
  });
  it("should distinguish issued transport from code possession and keep verification code controlled without a new send",async()=>{
    const props=diagnosticFixture(),user=userEvent.setup();render(<MessagingConnectionDiagnostic {...props} diagnostic={{outcome:"issued",diagnosticId:"00000000-0000-4000-8000-000000000001",challengeId:"00000000-0000-4000-8000-000000000002",deliveryId:"00000000-0000-4000-8000-000000000003",connectionId:"00000000-0000-4000-8000-000000000004",connectionVersion:2,channel:"email",maskedDestination:"d•••@example.test",expiresAt:"2026-10-08T05:00:00Z",resendAllowedAt:"2026-10-08T04:55:00Z"}} />);
    expect(screen.getByText(/La entrega no confirma/i)).toBeVisible();await user.type(screen.getByLabelText("Código recibido"),"123456");expect(props.onCodeChange).toHaveBeenCalled();expect(props.onIssue).not.toHaveBeenCalled();expect(props.onVerify).not.toHaveBeenCalled();
  });
});
