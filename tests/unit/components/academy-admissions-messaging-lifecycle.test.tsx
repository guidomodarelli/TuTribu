/** Exercises local lifecycle controls with real shared UI and controlled own props. @module academy-admissions-messaging-lifecycle-tests */
import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessagingConnectionLifecycle, type MessagingConnectionLifecycleProps } from "@/components/academy-admissions/messaging-connection-lifecycle";

/** @returns Current safe view facts and callbacks, without auth/transport/platform mocks. */
function lifecycleProps():MessagingConnectionLifecycleProps{
  const id=randomUUID();return{connections:[{id,name:"Conexión preparada",version:4,state:"active",selected:true,candidate:false}],targetId:id,retiring:false,reason:"security_stop",confirmed:false,busy:false,canAct:true,onTarget:vi.fn(),onRetiring:vi.fn(),onReason:vi.fn(),onConfirm:vi.fn(),onAct:vi.fn()};
}
describe("local connection lifecycle presenter",()=>{
  it("should require explicit controlled confirmation and describe safety limits without provider cancellation claims",async()=>{
    const props=lifecycleProps(),user=userEvent.setup(),view=render(<MessagingConnectionLifecycle {...props} />);expect(screen.getByRole("button",{name:"Suspender conexión"})).toBeDisabled();expect(screen.getByText(/pueden continuar y conservan su consumo/)).toBeVisible();
    await user.click(screen.getByRole("checkbox",{name:/Revisé la conexión/}));expect(props.onConfirm).toHaveBeenCalledWith(true);expect(props.onAct).not.toHaveBeenCalled();view.rerender(<MessagingConnectionLifecycle {...props} confirmed />);await user.click(screen.getByRole("button",{name:"Suspender conexión"}));expect(props.onAct).toHaveBeenCalledTimes(1);
  });
  it("should explain pending evidence recheck for compromise and act only from its own explicit action",()=>{
    const props=lifecycleProps();render(<MessagingConnectionLifecycle {...props} reason="suspected_compromise" />);expect(screen.getByText(/pruebas afectadas de solicitudes pendientes requieren recomprobación/)).toBeVisible();expect(screen.getByText(/Los miembros admitidos y las invitaciones permanecen/)).toBeVisible();expect(screen.queryByRole("button",{name:/Google/})).not.toBeInTheDocument();expect(props.onAct).not.toHaveBeenCalled();
  });
  it("should show ordinary retirement dependencies and block actions during pending work",()=>{
    const props=lifecycleProps();render(<MessagingConnectionLifecycle {...props} retiring busy confirmed />);expect(screen.getByRole("button",{name:"Desconectar conexión"})).toBeDisabled();expect(screen.queryByRole("combobox",{name:"Motivo de suspensión"})).not.toBeInTheDocument();expect(screen.getByText(/resolvé la verificación requerida o pausá admisiones/)).toBeVisible();expect(screen.queryByRole("button",{name:/Google/})).not.toBeInTheDocument();
  });
  it("should keep only the pressed disconnection busy while the lifecycle write is pending",async()=>{
    const props=lifecycleProps(),user=userEvent.setup();render(<MessagingConnectionLifecycle {...props} retiring busy acting confirmed={false} canAct={false} />);
    const disconnect=screen.getByRole("button",{name:"Desconectar conexión"});expect(disconnect).toHaveAttribute("aria-busy","true");expect(disconnect).not.toBeDisabled();
    expect(screen.getByRole("checkbox",{name:/Revisé la conexión/})).toBeDisabled();await user.click(disconnect);expect(props.onAct).not.toHaveBeenCalled();
  });
  it("should name the stopped notices and codes in the confirmation before suspending the connection the academy uses",()=>{
    const props=lifecycleProps();render(<MessagingConnectionLifecycle {...props} connections={[{...props.connections[0],name:"Piloto"}]} />);
    expect(screen.getByRole("note")).toHaveTextContent("«Piloto» es la conexión que la academia usa ahora. Mientras esté suspendida no se envían avisos ni códigos de verificación");
    expect(screen.getByRole("checkbox",{name:"Revisé la conexión, la acción y su impacto: mientras «Piloto» esté suspendida, la academia no envía avisos ni códigos de verificación."})).toBeVisible();
    expect(screen.getByText(/Suspender detiene los nuevos envíos, pero la conexión sigue ocupando su lugar/)).toBeVisible();
  });
  it("should say that retiring a candidate leaves the selected connection untouched and frees its slot",()=>{
    const props=lifecycleProps(),candidateId=randomUUID(),connections=[{...props.connections[0],name:"Piloto"},{id:candidateId,name:"Piloto correo y SMS",version:2,state:"draft" as const,selected:false,candidate:true}];
    render(<MessagingConnectionLifecycle {...props} connections={connections} targetId={candidateId} retiring />);
    expect(screen.getByText("Se retira solo la candidata «Piloto correo y SMS» y queda libre el lugar para guardar otra clave. La conexión seleccionada «Piloto» no cambia.")).toBeVisible();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();expect(screen.getByRole("checkbox",{name:"Revisé la conexión, la acción y su impacto y quiero confirmar: se aplica a «Piloto correo y SMS»."})).toBeVisible();
  });
  it("should warn that retiring the selected connection also removes the academy's selection",()=>{
    const props=lifecycleProps();render(<MessagingConnectionLifecycle {...props} connections={[{...props.connections[0],name:"Piloto",candidate:true,state:"suspended"}]} retiring />);
    expect(screen.getByRole("note")).toHaveTextContent("«Piloto» es la conexión seleccionada de la academia. Retirarla también quita la selección");
    expect(screen.queryByText(/no cambia/)).not.toBeInTheDocument();
  });
  it("should render a safe empty state without inventing a resource or a mutation",()=>{
    const props=lifecycleProps();render(<MessagingConnectionLifecycle {...props} connections={[]} targetId="" />);expect(screen.getByText("No hay conexiones vigentes para gestionar.")).toBeVisible();expect(screen.queryByRole("button",{name:"Suspender conexión"})).not.toBeInTheDocument();expect(props.onAct).not.toHaveBeenCalled();
  });
});
