/** Exercises the connection workspace summary, single next action and linear guided flow with real shared UI and controlled props. @module messaging-connections-workspace-tests */
import {render,screen,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnectionsAttention,MessagingConnectionsWorkspace,type MessagingConnectionsWorkspaceProps} from "@/components/academy-admissions/messaging-connections-workspace";
import {resolveMessagingConnectionsNextAction} from "@/src/modules/messaging/application/commands/messaging-connections-next-action";
import {resolveMessagingConnectionsFlow} from "@/src/modules/messaging/application/commands/messaging-connections-flow";

const now=new Date().toISOString();
const candidate={id:"00000000-0000-4000-8000-000000000001",name:"Candidata de prueba",version:3,configurationVersion:2,state:"ready" as const,credentialState:"valid" as const,credentialMode:"production" as const,maskedCredential:"••••••••" as const,securityCurrent:true,capabilities:[{channel:"email" as const,state:"prepared" as const,checkedAt:now,testedAt:now},{channel:"sms" as const,state:"unprepared" as const,checkedAt:now,testedAt:null}]};
const usage={state:"configured" as const,policy:{version:1,allowedCountries:["AR"],verificationDailyLimit:100,notificationDailyLimit:200,platformMaximums:{verificationDailyLimit:1000,notificationDailyLimit:5000},consumption:{verificationToday:0,notificationToday:0}}};

/** @returns Fresh workspace connections with no selected connection and the ready candidate. */
function defaultWorkspaceConnections():{selected:MessagingConnectionsWorkspaceProps["selected"];candidate:MessagingConnectionsWorkspaceProps["candidate"]}{return{selected:null,candidate};}

/** @param connections - Selected and candidate metadata that decide the steps and the next action. @param current - Open step. @returns Controlled props with labelled step contents, without session, provider or storage. */
function workspaceProps(connections:{selected:MessagingConnectionsWorkspaceProps["selected"];candidate:MessagingConnectionsWorkspaceProps["candidate"]}=defaultWorkspaceConnections(),current=0):MessagingConnectionsWorkspaceProps{
  const flow=resolveMessagingConnectionsFlow({candidate:connections.candidate,usage,observedAt:now});
  return{...connections,nextAction:resolveMessagingConnectionsNextAction({...connections,usage,observedAt:now}),nextActionInView:false,usageHref:"/academia/admissions/messaging",busy:false,
    steps:flow.map((step)=>({id:step.id,title:step.title,description:step.description,content:<p>{`Contenido de ${step.title}`}</p>,blockedReason:step.blockedReason??undefined})),current,onCurrentChange:vi.fn(),
    finalAction:{label:"Activar conexión",disabled:true,onRun:vi.fn()},security:<p>Panel de seguridad</p>,securityOpen:false,onSecurityToggle:vi.fn(),onNextAction:vi.fn(),onReadCurrent:vi.fn()};
}

describe("messaging connections workspace",()=>{
  it("should summarize the candidate once and highlight the single pending channel test with its reason",async()=>{
    const props=workspaceProps(),user=userEvent.setup();render(<MessagingConnectionsWorkspace {...props} />);
    expect(screen.getAllByText("Candidata de prueba")).toHaveLength(1);
    const facts=screen.getByRole("list",{name:"Estado de Candidata de prueba"});
    expect(within(facts).getByText("Correo: Canal comprobado")).toBeInTheDocument();expect(within(facts).getByText("SMS: Prueba pendiente")).toBeInTheDocument();
    const next=screen.getByRole("group",{name:"Próxima acción"});
    expect(next).toHaveTextContent("Falta probar SMS");expect(next).toHaveTextContent("Correo ya está comprobado. Falta SMS: todavía no se confirmó un código de prueba.");
    await user.click(within(next).getByRole("button",{name:"Probá SMS"}));expect(props.onNextAction).toHaveBeenCalledTimes(1);
  });
  it("should show one small step at a time in a linear flow with a test step per configured channel",async()=>{
    const props=workspaceProps(),user=userEvent.setup();render(<MessagingConnectionsWorkspace {...props} />);
    const progress=screen.getByRole("navigation",{name:"Paso 1 de 6"});
    expect(within(progress).getAllByRole("listitem").map((item)=>item.querySelector<HTMLElement>("[data-label]")?.dataset.label)).toEqual(["Clave","Credencial","Canales","Probar Correo","Probar SMS","Activación"]);
    expect(screen.getByRole("group",{name:"Clave"})).toHaveTextContent("Contenido de Clave");expect(screen.queryByText("Contenido de Credencial")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:/Atrás/})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"Siguiente"}));expect(props.onCurrentChange).toHaveBeenCalledWith(1);
  });
  it("should keep Siguiente disabled with its reason until the step's write has finished",()=>{
    const props=workspaceProps(undefined,4);render(<MessagingConnectionsWorkspace {...props} nextActionInView />);
    expect(screen.getByRole("group",{name:"Probar SMS"})).toBeVisible();expect(screen.getByRole("button",{name:"Siguiente"})).toBeDisabled();expect(screen.getByText("Confirmá el código de SMS para seguir.")).toBeVisible();
    expect(within(screen.getByRole("group",{name:"Próxima acción"})).queryByRole("button")).not.toBeInTheDocument();
  });
  it("should run activation from the last step's own button",async()=>{
    const tested={...candidate,capabilities:candidate.capabilities.map((capability)=>({...capability,state:"prepared" as const,testedAt:now}))},props=workspaceProps({selected:null,candidate:tested},5),user=userEvent.setup();
    render(<MessagingConnectionsWorkspace {...props} nextActionInView finalAction={{...props.finalAction,disabled:false}} />);
    expect(screen.getByRole("group",{name:"Próxima acción"})).toHaveTextContent("Correo y SMS están comprobados. Activá la conexión para usarla en la academia.");
    await user.click(screen.getByRole("button",{name:"Activar conexión"}));expect(props.finalAction.onRun).toHaveBeenCalledTimes(1);
  });
  it("should keep Security outside the flow and mounted while hidden",async()=>{
    const props=workspaceProps(),user=userEvent.setup(),view=render(<MessagingConnectionsWorkspace {...props} />);
    expect(screen.getByText("Panel de seguridad")).not.toBeVisible();await user.click(screen.getByRole("button",{name:"Seguridad y retiro"}));expect(props.onSecurityToggle).toHaveBeenCalledTimes(1);
    view.rerender(<MessagingConnectionsWorkspace {...props} securityOpen />);
    expect(screen.getByRole("region",{name:"Seguridad"})).toBeVisible();expect(screen.getByRole("form",{name:"Pasos de la conexión",hidden:true})).not.toBeVisible();expect(screen.getByRole("button",{name:"Volver a los pasos"})).toHaveAttribute("aria-pressed","true");
  });
  it("should keep a pending original's persistent explanation above the flow",()=>{
    const props=workspaceProps();render(<MessagingConnectionsWorkspace {...props} attention={<MessagingConnectionsAttention notice="No pudimos confirmar la prueba."><button type="button">Consultar guardado</button></MessagingConnectionsAttention>} />);
    const attention=screen.getByRole("region",{name:"Acciones pendientes"});
    expect(within(attention).getByRole("alert")).toHaveTextContent("No pudimos confirmar la prueba.");expect(within(attention).getByRole("button",{name:"Consultar guardado"})).toBeVisible();
    expect(within(screen.getByRole("group",{name:"Clave"})).queryByRole("alert")).not.toBeInTheDocument();
  });
  it("should show a calm completed state without an action when the candidate is already the selection",()=>{
    const tested={...candidate,capabilities:candidate.capabilities.map((capability)=>({...capability,state:"prepared" as const,testedAt:now}))},props=workspaceProps({selected:tested,candidate:tested},5);render(<MessagingConnectionsWorkspace {...props} />);
    expect(screen.getByText("Conexión seleccionada y candidata")).toBeVisible();
    const next=screen.getByRole("group",{name:"Próxima acción"});expect(next).toHaveTextContent("Conexión activa");expect(within(next).queryByRole("button")).not.toBeInTheDocument();
  });
  it("should link a phone channel without saved countries to the usage page",()=>{
    const tested={...candidate,capabilities:candidate.capabilities.map((capability)=>({...capability,state:"prepared" as const,testedAt:now}))},props=workspaceProps({selected:null,candidate:tested},5);
    render(<MessagingConnectionsWorkspace {...props} nextAction={resolveMessagingConnectionsNextAction({selected:null,candidate:tested,usage:{state:"not_configured",policy:null},observedAt:now})} />);
    const next=screen.getByRole("group",{name:"Próxima acción"});expect(next).toHaveTextContent("SMS necesita los países guardados antes de activar.");
    expect(within(next).getByRole("link",{name:"Preparar países y cupos"})).toHaveAttribute("href","/academia/admissions/messaging");
  });
});
