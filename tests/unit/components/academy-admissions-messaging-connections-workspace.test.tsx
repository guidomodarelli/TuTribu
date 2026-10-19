/** Exercises the connection workspace summary, next step and tabs with real shared UI and controlled props. @module messaging-connections-workspace-tests */
import {render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {Link} from "@/components/navigation/link";
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
  it("should offer the four workflow tabs plus security and render only the active step",async()=>{
    const props=workspaceProps(),user=userEvent.setup();render(<MessagingConnectionsWorkspace {...props} />);
    expect(screen.getAllByRole("tab").map((tab)=>tab.textContent)).toEqual(["Conexión","Canales","Pruebas","Activación","Seguridad"]);
    expect(screen.getByText("Panel de conexión")).toBeVisible();expect(screen.queryByText("Panel de pruebas")).not.toBeInTheDocument();expect(screen.getByText("Panel de seguridad")).not.toBeVisible();
    await user.click(screen.getByRole("tab",{name:"Activación"}));expect(props.onTabChange).toHaveBeenCalledWith("activation");expect(props.onReadCurrent).not.toHaveBeenCalled();
  });
  it("should explain a step that needs a candidate instead of showing an empty form",async()=>{
    const props=workspaceProps(),user=userEvent.setup();render(<MessagingConnectionsWorkspace {...props} candidate={null} nextStep="saveCandidate" activeTab="channels" panels={{...props.panels,channels:null}} />);
    expect(screen.getByText("Todavía no hay conexiones guardadas.")).toBeVisible();
    await waitFor(()=>expect(screen.getByText(/Este paso necesita una conexión candidata/)).toBeVisible(),{timeout:5000});
    await user.click(within(screen.getByRole("tabpanel",{name:"Canales"})).getByRole("button",{name:"Ir a Conexión"}));expect(props.onTabChange).toHaveBeenCalledWith("connection");
  });
  it("should announce feedback by severity and keep pending recovery above the tabs",()=>{
    const props=workspaceProps(),view=render(<MessagingConnectionsWorkspace {...props} message={{kind:"alert",text:"No pudimos confirmar la prueba."}} attention={<button type="button">Consultar guardado</button>} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar la prueba.");expect(screen.getByRole("button",{name:"Consultar guardado"})).toBeVisible();
    view.rerender(<MessagingConnectionsWorkspace {...props} message={{kind:"status",text:"La configuración quedó guardada."}} />);expect(screen.getByRole("status")).toHaveTextContent("La configuración quedó guardada.");expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("should place the result and the Google continuation inside the active step, next to the action that produced them",()=>{
    const props=workspaceProps();render(<MessagingConnectionsWorkspace {...props} activeTab="tests" message={{kind:"status",text:"La confirmación está preparada. Continuá con Google."}} messageAction={<Link href="/auth/reauthenticate">Continuar con Google</Link>} />);
    const panel=screen.getByRole("tabpanel",{name:"Pruebas"});
    expect(within(panel).getByRole("status")).toHaveTextContent("La confirmación está preparada.");expect(within(panel).getByRole("link",{name:"Continuar con Google"})).toBeVisible();expect(screen.getAllByRole("link",{name:"Continuar con Google"})).toHaveLength(1);
  });
  it("should show a calm completed state when the candidate is already the selection",()=>{
    const props=workspaceProps();render(<MessagingConnectionsWorkspace {...props} selected={props.candidate} nextStep="active" />);
    expect(screen.getByText("Conexión seleccionada y candidata")).toBeVisible();expect(screen.getAllByText("Candidata de prueba")).toHaveLength(1);expect(screen.getByText("Listo")).toBeVisible();expect(screen.queryByRole("button",{name:/^Ir a /})).not.toBeInTheDocument();
  });
});
