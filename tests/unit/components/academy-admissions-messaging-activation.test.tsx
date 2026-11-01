/** Exercises the activation step's visible requirements and explicit consent with real shared UI. @module messaging-activation-presenter-tests */
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnectionActivation} from "@/components/academy-admissions/messaging-connection-activation";

/** @returns Controlled own metadata and explicit callbacks, without session/provider or persistence mocks. */
function activationFixture(){return{candidate:{id:"00000000-0000-4000-8000-000000000001",name:"Candidata comprobada",version:4,configurationVersion:2,state:"draft" as const,credentialState:"valid" as const,credentialMode:"production" as const,maskedCredential:"••••••••" as const,securityCurrent:true,capabilities:[]},selected:null,confirmed:false,busy:false,requirements:[] as string[],onConfirm:vi.fn()};}

describe("candidate activation presentation",()=>{
  it("should disclose the candidate and ask for explicit consent without activating on render",async()=>{
    const props=activationFixture(),user=userEvent.setup();render(<MessagingConnectionActivation {...props} />);
    expect(screen.getByText(/Candidata comprobada/)).toBeVisible();expect(screen.getByText(/Configuración 2/)).toBeVisible();expect(screen.getByText("Requisitos cumplidos")).toBeVisible();
    // The guided flow's last button activates; the step itself only collects consent.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox",{name:/Confirmo que quiero usar esta candidata/i}));expect(props.onConfirm).toHaveBeenCalledWith(true);
  });
  it("should show missing requirements and keep the current selection until an explicit replacement",()=>{
    const props=activationFixture(),selected={...props.candidate,id:"00000000-0000-4000-8000-000000000002",name:"Conexión seleccionada anterior",configurationVersion:1,state:"active" as const};render(<MessagingConnectionActivation {...props} selected={selected} requirements={["Comprobá el código del canal antes de activar."]} />);
    expect(screen.getByText(/Conexión seleccionada anterior/)).toHaveTextContent(/seguirá vigente hasta confirmar el reemplazo/);expect(screen.getByRole("list",{name:"Requisitos para activar"})).toHaveTextContent("Comprobá el código del canal antes de activar.");
  });
  it("should lock its consent while another operation runs",()=>{
    const props=activationFixture();render(<MessagingConnectionActivation {...props} busy />);expect(screen.getByRole("checkbox",{name:/Confirmo que quiero usar esta candidata/i})).toBeDisabled();
  });
});
