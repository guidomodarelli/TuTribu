/** Exercises capability-specific selection with real shared UI and own controlled props. @module messaging-resource-selection-tests */
import {randomUUID} from "node:crypto";
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,expect,it,vi} from "vitest";
import {MessagingConnectionResources} from "@/components/academy-admissions/messaging-connection-resources";

/** @returns An explicitly selected channel and owned resource options, never a provider response. */
function resourceFixture(){return{channel:"email" as const,senderId:"",templateId:"",templateLanguage:"",confirmed:false,busy:false,canSave:false,senders:{items:[{id:randomUUID(),label:"Remitente de ejemplo",channels:["email" as const],readiness:"ready" as const}],nextCursor:undefined},templates:{items:[],nextCursor:undefined},fieldErrors:{},message:null,onChannelChange:vi.fn(),onSenderChange:vi.fn(),onTemplateChange:vi.fn(),onTemplateLanguageChange:vi.fn(),onConfirmationChange:vi.fn(),onReadSenders:vi.fn(),onReadTemplates:vi.fn(),onMoreSenders:vi.fn(),onMoreTemplates:vi.fn(),onSave:vi.fn(),onReauthenticate:vi.fn(),onReadSendersReauthenticate:vi.fn(),onReadTemplatesReauthenticate:vi.fn()};}

describe("connection resource selection",()=>{
  it("should require an explicit sender selection and omit WhatsApp-only fields from email",async()=>{
    const props=resourceFixture(),user=userEvent.setup();render(<MessagingConnectionResources {...props} />);
    expect(screen.getByRole("combobox",{name:"Remitente del canal"})).toBeVisible();expect(screen.queryByLabelText("Plantilla de autenticación")).not.toBeInTheDocument();expect(props.onSenderChange).not.toHaveBeenCalled();expect(props.onReadSenders).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Guardar configuración del canal"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Consultar remitentes"}));expect(props.onReadSenders).toHaveBeenCalledTimes(1);expect(props.onSave).not.toHaveBeenCalled();
  });
  it("should show template and language only for WhatsApp while retaining a validated manual-reference path",()=>{
    const props=resourceFixture();render(<MessagingConnectionResources {...props} channel="whatsapp" />);
    expect(screen.getByLabelText("Identificador del remitente")).toBeVisible();expect(screen.getByLabelText("Identificador de plantilla")).toBeVisible();expect(screen.getByLabelText("Idioma de la plantilla")).toBeVisible();expect(screen.getByText(/El guardado comprueba el recurso/i)).toBeVisible();expect(props.onSave).not.toHaveBeenCalled();
  });
  it("should retain validation feedback and require explicit consent before configuration without sending a diagnostic",()=>{
    const props=resourceFixture();render(<MessagingConnectionResources {...props} fieldErrors={{senderId:"Elegí un remitente o ingresá su identificador."}} message={{kind:"alert",text:"La lista no se pudo completar. Reintentá la consulta."}} busy />);
    expect(screen.getByRole("alert")).toHaveTextContent("La lista no se pudo completar.");expect(screen.getByText("Elegí un remitente o ingresá su identificador.")).toBeVisible();expect(screen.getByRole("button",{name:"Guardar configuración del canal"})).toBeDisabled();expect(props.onSave).not.toHaveBeenCalled();
  });
});
