/** Exercises explicit selection confirmation and visible requirements with real shared UI. @module messaging-activation-presenter-tests */
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnectionActivation} from "@/components/academy-admissions/messaging-connection-activation";

/** @returns Controlled own metadata and explicit callbacks, without session/provider or persistence mocks. */
function activationFixture(){return{candidate:{id:"00000000-0000-4000-8000-000000000001",name:"Candidata comprobada",version:4,configurationVersion:2,state:"draft" as const,credentialState:"valid" as const,credentialMode:"production" as const,maskedCredential:"••••••••" as const,capabilities:[]},selected:null,confirmed:false,busy:false,canActivate:false,requirements:[] as string[],onConfirm:vi.fn(),onActivate:vi.fn(),onReauthenticate:vi.fn()};}

describe("candidate activation presentation",()=>{
  it("should disclose the selected candidate and require explicit renewed consent without activating on render",async()=>{
    const props=activationFixture(),user=userEvent.setup();render(<MessagingConnectionActivation {...props} />);expect(screen.getByText(/Candidata comprobada/)).toBeVisible();expect(screen.getByText(/Configuración 2/)).toBeVisible();expect(screen.getByRole("button",{name:"Activar candidata"})).toBeDisabled();expect(props.onActivate).not.toHaveBeenCalled();await user.click(screen.getByRole("checkbox",{name:/Confirmo que quiero usar esta candidata/i}));expect(props.onConfirm).toHaveBeenCalledWith(true);expect(props.onActivate).not.toHaveBeenCalled();
  });
  it("should show missing requirements and preserve the current selection until an explicit replacement",()=>{
    const props=activationFixture(),selected={...props.candidate,id:"00000000-0000-4000-8000-000000000002",name:"Conexión seleccionada anterior",configurationVersion:1,state:"active" as const};render(<MessagingConnectionActivation {...props} selected={selected} requirements={["Comprobá el código del canal antes de activar."]} />);expect(screen.getByText(/Conexión seleccionada anterior/)).toBeVisible();expect(screen.getByText("Comprobá el código del canal antes de activar.")).toBeVisible();expect(screen.getByRole("button",{name:"Reemplazar conexión seleccionada"})).toBeDisabled();expect(props.onActivate).not.toHaveBeenCalled();
  });
  it("should call the explicit activation and Google callbacks only from their own actions",async()=>{
    const props=activationFixture(),user=userEvent.setup();render(<MessagingConnectionActivation {...props} confirmed canActivate />);await user.click(screen.getByRole("button",{name:"Confirmar activación con Google"}));expect(props.onReauthenticate).toHaveBeenCalledTimes(1);expect(props.onActivate).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:"Activar candidata"}));expect(props.onActivate).toHaveBeenCalledTimes(1);
  });
});
