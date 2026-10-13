/** Exercises the wizard's first presentational step with actual shared UI primitives and controlled callbacks. @module academy-messaging-connections-tests */
import {randomUUID} from "node:crypto";
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnections} from "@/components/academy-admissions/messaging-connections";

/** @returns Controlled own view state without session, SDK, HTTP adapter or a stored credential. */
function presenterFixture(){return{configuration:{audience:"leader" as const,selected:null,candidate:null,usage:{state:"not_configured" as const,policy:null}},name:"",apiKey:"",confirmed:false,busy:false,canSave:false,canReauthenticate:true,validationConfirmed:false,canValidate:false,fieldErrors:{},message:null,onNameChange:vi.fn(),onApiKeyChange:vi.fn(),onConfirmationChange:vi.fn(),onSave:vi.fn(),onReauthenticate:vi.fn(),onValidationReauthenticate:vi.fn(),onValidationConfirmationChange:vi.fn(),onValidate:vi.fn()};}
describe("messaging connection first step",()=>{
  it("should show only the operational alert to a guardian without credential controls",()=>{
    const props=presenterFixture();render(<MessagingConnections {...props} configuration={{audience:"guardian",operationalAlert:"attention_required"}} />);
    expect(screen.getByText(/La mensajería necesita atención/i)).toBeVisible();expect(screen.queryByLabelText(/Clave de Zavu/i)).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:/Guardar conexión/i})).not.toBeInTheDocument();
  });
  it("should keep the key password-only and controlled, emit explicit actions and clear it from the rendered field when the owner clears state",async()=>{
    const props=presenterFixture(),credential=randomUUID(),user=userEvent.setup(),view=render(<MessagingConnections {...props} name="Zavu de prueba" apiKey={credential} confirmed canSave />);
    expect(screen.getByLabelText(/Clave de Zavu/i)).toHaveAttribute("type","password");expect(screen.queryByText(credential)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:/Guardar conexión/i}));expect(props.onSave).toHaveBeenCalledTimes(1);
    view.rerender(<MessagingConnections {...props} name="Zavu de prueba" apiKey="" />);expect(screen.getByLabelText(/Clave de Zavu/i)).toHaveValue("");
  });
  it("should expose field validation and pending feedback with accessible disabled actions",()=>{
    const props=presenterFixture();render(<MessagingConnections {...props} busy fieldErrors={{apiKey:"Ingresá la clave antes de guardar."}} message={{kind:"status",text:"Consultando el resultado del guardado…"}} />);
    expect(screen.getByText("Ingresá la clave antes de guardar.")).toBeVisible();expect(screen.getByRole("status")).toHaveTextContent("Consultando el resultado del guardado…");expect(screen.getByRole("button",{name:/Guardar conexión/i})).toBeDisabled();
  });
});
