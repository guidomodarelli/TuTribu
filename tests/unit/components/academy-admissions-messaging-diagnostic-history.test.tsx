/** Exercises the collapsed recovery of preserved tests with real shared UI. @module messaging-diagnostic-history-tests */
import {render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingDiagnosticHistory} from "@/components/academy-admissions/messaging-diagnostic-history";
import {MESSAGING_CONNECTION_HISTORY_LIMIT} from "@/src/modules/messaging/constants/messaging-connections-browser";

const reference={operationId:"00000000-0000-4000-8000-000000000001",connectionId:"00000000-0000-4000-8000-000000000002",configurationVersion:2,channel:"email" as const};
/** A history at its limit, with distinct operation references. */
const fullHistory=Array.from({length:MESSAGING_CONNECTION_HISTORY_LIMIT},(_,index)=>({...reference,operationId:`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`}));

describe("preserved tests recovery",()=>{
  it("should stay collapsed and hidden from the main path until the leader expands it",async()=>{
    const onRead=vi.fn(),user=userEvent.setup();render(<MessagingDiagnosticHistory references={[reference]} busy={false} onRead={onRead} onClearEarlier={vi.fn()} />);
    expect(screen.getByRole("heading",{name:"Pruebas conservadas (1)"})).toBeVisible();expect(screen.queryByRole("button",{name:"Consultar prueba 1: Correo"})).not.toBeInTheDocument();
    await user.click(screen.getByText("Pruebas conservadas (1)"));
    await user.click(await screen.findByRole("button",{name:"Consultar prueba 1: Correo"}));expect(onRead).toHaveBeenCalledWith(reference);
  });
  it("should keep the full-history block visible outside the collapsed list",()=>{
    render(<MessagingDiagnosticHistory references={fullHistory} busy={false} onRead={vi.fn()} onClearEarlier={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(`Se alcanzó el límite de ${MESSAGING_CONNECTION_HISTORY_LIMIT} referencias`);expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
  it("should render nothing without preserved tests",()=>{
    const view=render(<MessagingDiagnosticHistory references={[]} busy={false} onRead={vi.fn()} onClearEarlier={vi.fn()} />);expect(view.container).toBeEmptyDOMElement();
  });
  it("should offer to empty a full history only after confirming its consequence, and change nothing on cancel",async()=>{
    const onClearEarlier=vi.fn(),user=userEvent.setup();render(<MessagingDiagnosticHistory references={fullHistory} busy={false} onRead={vi.fn()} onClearEarlier={onClearEarlier} />);
    await user.click(screen.getByRole("button",{name:"Vaciar pruebas anteriores"}));
    const dialog=await screen.findByRole("alertdialog",{name:"¿Vaciar pruebas anteriores?"});expect(dialog).toHaveTextContent(`referencias de ${MESSAGING_CONNECTION_HISTORY_LIMIT-1} pruebas anteriores y se conserva solo la última`);expect(dialog).toHaveTextContent("Las pruebas ya enviadas no se cancelan ni se reenvían");expect(dialog).toHaveTextContent("No se puede deshacer");
    await user.click(within(dialog).getByRole("button",{name:"Cancelar"}));await waitFor(()=>expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());expect(onClearEarlier).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button",{name:"Vaciar pruebas anteriores"}));await user.click(within(await screen.findByRole("alertdialog")).getByRole("button",{name:"Vaciar pruebas anteriores"}));
    expect(onClearEarlier).toHaveBeenCalledTimes(1);await waitFor(()=>expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
  it("should not offer to empty a history that still has room",()=>{
    render(<MessagingDiagnosticHistory references={fullHistory.slice(1)} busy={false} onRead={vi.fn()} onClearEarlier={vi.fn()} />);expect(screen.queryByRole("button",{name:"Vaciar pruebas anteriores"})).not.toBeInTheDocument();expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("should keep emptying unavailable while another action is in progress",()=>{
    render(<MessagingDiagnosticHistory references={fullHistory} busy onRead={vi.fn()} onClearEarlier={vi.fn()} />);expect(screen.getByRole("button",{name:"Vaciar pruebas anteriores"})).toBeDisabled();
  });
});
