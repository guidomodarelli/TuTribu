/** Exercises the connection workspace summary, next step and stepper with real shared UI and controlled props. @module messaging-connections-workspace-tests */
import {render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnectionsWorkspace,type MessagingConnectionsWorkspaceProps} from "@/components/academy-admissions/messaging-connections-workspace";

const now=new Date().toISOString();
/** @returns A tested candidate, controlled tab and simple labelled panels, without session, provider or storage. */
function workspaceProps():MessagingConnectionsWorkspaceProps{
  return{selected:null,candidate:{id:"00000000-0000-4000-8000-000000000001",name:"Candidata de prueba",version:3,configurationVersion:2,state:"ready",credentialState:"valid",credentialMode:"production",maskedCredential:"••••••••",capabilities:[{channel:"email",state:"prepared",checkedAt:now,testedAt:now},{channel:"sms",state:"unprepared",checkedAt:now,testedAt:null}]},
    activeTab:"connection",nextStep:"testChannel",busy:false,message:null,onTabChange:vi.fn(),onReadCurrent:vi.fn(),
    panels:{connection:<p>Panel de conexión</p>,channels:<p>Panel de canales</p>,tests:<p>Panel de pruebas</p>,activation:<p>Panel de activación</p>,security:<p>Panel de seguridad</p>}};
}

describe("messaging connections workspace",()=>{
  it("should summarize the candidate once with separate state facts and highlight the next step",async()=>{
    const props=workspaceProps(),user=userEvent.setup();render(<MessagingConnectionsWorkspace {...props} />);
    expect(screen.getAllByText("Candidata de prueba")).toHaveLength(1);
    const facts=screen.getByRole("list",{name:"Estado de Candidata de prueba"});
    expect(within(facts).getByText("Credencial comprobada")).toBeInTheDocument();expect(within(facts).getByText("Correo: Canal comprobado")).toBeInTheDocument();expect(within(facts).getByText("SMS: Prueba pendiente")).toBeInTheDocument();
    expect(screen.getByText("Enviá una prueba y confirmá el código recibido.")).toBeVisible();
    await user.click(screen.getByRole("button",{name:"Ir a Pruebas"}));expect(props.onTabChange).toHaveBeenCalledWith("tests");
  });
  it("should show progress in a stepper, open completed steps from it and keep Security as a separate action",async()=>{
    const props=workspaceProps(),user=userEvent.setup();render(<MessagingConnectionsWorkspace {...props} />);
    const stepper=screen.getByRole("navigation",{name:"Pasos de la conexión"});
    const steps=within(stepper).getAllByRole("button");
    expect(steps.map((step)=>step.textContent?.match(/Conexión|Canales|Pruebas|Activación/)?.[0])).toEqual(["Conexión","Canales","Pruebas","Activación"]);
    expect(within(stepper).getByRole("button",{name:/^Pruebas/})).toHaveAttribute("aria-current","step");
    expect(within(stepper).getByRole("button",{name:/^Activación/})).toHaveAttribute("aria-disabled","true");
    expect(screen.getByRole("region",{name:"Conexión"})).toBeVisible();expect(screen.queryByRole("region",{name:"Pruebas"})).not.toBeInTheDocument();expect(screen.getByText("Panel de seguridad")).not.toBeVisible();
    await user.click(within(stepper).getByRole("button",{name:/^Canales/}));expect(props.onTabChange).toHaveBeenCalledWith("channels");
    await user.click(within(stepper).getByRole("button",{name:/^Activación/}));expect(props.onTabChange).not.toHaveBeenCalledWith("activation");
    await user.click(screen.getByRole("button",{name:"Seguridad y retiro"}));expect(props.onTabChange).toHaveBeenCalledWith("security");expect(props.onReadCurrent).not.toHaveBeenCalled();
  });
  it("should explain a step that needs a candidate instead of showing an empty form",async()=>{
    const props=workspaceProps(),user=userEvent.setup();render(<MessagingConnectionsWorkspace {...props} candidate={null} nextStep="saveCandidate" activeTab="channels" panels={{...props.panels,channels:null}} />);
    expect(screen.getByText("Todavía no hay conexiones guardadas.")).toBeVisible();
    await waitFor(()=>expect(screen.getByText(/Este paso necesita una conexión candidata/)).toBeVisible(),{timeout:5000});
    await user.click(within(screen.getByRole("region",{name:"Canales"})).getByRole("button",{name:"Ir a Conexión"}));expect(props.onTabChange).toHaveBeenCalledWith("connection");
  });
  it("should announce feedback by severity and keep pending recovery above the tabs",()=>{
    const props=workspaceProps(),view=render(<MessagingConnectionsWorkspace {...props} message={{kind:"alert",text:"No pudimos confirmar la prueba."}} attention={<button type="button">Consultar guardado</button>} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la prueba.");expect(screen.getByRole("button",{name:"Consultar guardado"})).toBeVisible();
    view.rerender(<MessagingConnectionsWorkspace {...props} message={{kind:"status",text:"La configuración quedó guardada."}} />);expect(screen.getByRole("status")).toHaveTextContent("La configuración quedó guardada.");expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("should place the result inside the active step, next to the action that produced it",()=>{
    const props=workspaceProps();render(<MessagingConnectionsWorkspace {...props} activeTab="tests" message={{kind:"status",text:"La prueba quedó enviada."}} />);
    const panel=screen.getByRole("region",{name:"Pruebas"});
    expect(within(panel).getByRole("status")).toHaveTextContent("La prueba quedó enviada.");expect(screen.queryByRole("link",{name:/Google/})).not.toBeInTheDocument();
  });
  it("should show a calm completed state when the candidate is already the selection",()=>{
    const props=workspaceProps();render(<MessagingConnectionsWorkspace {...props} selected={props.candidate} nextStep="active" />);
    expect(screen.getByText("Conexión seleccionada y candidata")).toBeVisible();expect(screen.getAllByText("Candidata de prueba")).toHaveLength(1);expect(screen.getByText("Listo")).toBeVisible();expect(screen.queryByRole("button",{name:/^Ir a /})).not.toBeInTheDocument();
  });
});
