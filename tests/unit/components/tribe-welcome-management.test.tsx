import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { TribeWelcomeManagement } from "@/components/tribes/tribe-welcome-management";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const fetchMock = jest.fn();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildWelcome() {
  return {
    links: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        isActive: true,
        label: "Soporte",
        message: null,
        phoneNumber: null,
        sortOrder: 1,
        type: TRIBE_WELCOME_LINK_TYPE.customButton,
        url: "https://soporte.example.com",
      },
    ],
    rules: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        isActive: true,
        label: "Presentate al entrar",
        sortOrder: 1,
      },
    ],
    welcomeMessage: "Bienvenido/a a la tribu",
  };
}

describe("TribeWelcomeManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue({
      json: jest.fn(async () => ({ message: "Bienvenida actualizada." })),
      ok: true,
    });
  });

  it("renders welcome content as read-only for non-leaders", () => {
    render(
      <TribeWelcomeManagement
        canEdit={false}
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.getByRole("heading", { name: "Bienvenida" })).toBeInTheDocument();
    expect(screen.getByText("Presentate al entrar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });

  it("saves leader edits with visible feedback", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    await user.clear(screen.getByLabelText("Mensaje de bienvenida"));
    await user.type(
      screen.getByLabelText("Mensaje de bienvenida"),
      "Bienvenido/a a Matematica Pro"
    );
    await user.click(screen.getByRole("button", { name: "Guardar bienvenida" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tribes/matematica-pro/welcome",
        expect.objectContaining({
          method: "PUT",
        })
      );
    });
    expect(toast.success).toHaveBeenCalledWith("Bienvenida actualizada.");
  });

  it("offers only custom and WhatsApp link types", () => {
    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.getByRole("option", { name: "Botón personalizado" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "WhatsApp" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Red social" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Soporte" })).not.toBeInTheDocument();
  });

  it("does not render a screen mode selector", () => {
    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={buildWelcome()}
      />
    );

    expect(screen.queryByText("Tipo de pantalla")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pantalla simple")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pantalla completa")).not.toBeInTheDocument();
  });

  it("creates valid UUIDs when randomUUID is unavailable", async () => {
    const originalCrypto = globalThis.crypto;
    const user = userEvent.setup();

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (values: Uint8Array) => {
          values.fill(1);

          return values;
        },
      },
    });

    try {
      render(
        <TribeWelcomeManagement
          canEdit
          tribeSlug="matematica-pro"
          welcome={buildWelcome()}
        />
      );

      await user.click(screen.getByRole("button", { name: "Agregar acuerdo" }));

      const ruleInputs = screen.getAllByLabelText("Acuerdo");

      await user.type(ruleInputs.at(-1) as HTMLElement, "Saludar al entrar");
      await user.click(screen.getByRole("button", { name: "Guardar bienvenida" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });

      const [, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit.body as string) as ReturnType<
        typeof buildWelcome
      >;
      const createdRule = body.rules.at(-1);

      expect(createdRule?.id).toMatch(UUID_PATTERN);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("uses the next available sort order after removing and adding items", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              isActive: true,
              label: "Soporte",
              message: null,
              phoneNumber: null,
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.customButton,
              url: "https://soporte.example.com",
            },
            {
              id: "33333333-3333-4333-8333-333333333333",
              isActive: true,
              label: "Canal",
              message: null,
              phoneNumber: null,
              sortOrder: 2,
              type: TRIBE_WELCOME_LINK_TYPE.customButton,
              url: "https://canal.example.com",
            },
          ],
          rules: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              isActive: true,
              label: "Presentate al entrar",
              sortOrder: 1,
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              isActive: true,
              label: "Cuidá el tono",
              sortOrder: 2,
            },
          ],
        }}
      />
    );

    await user.click(screen.getAllByRole("button", { name: "Eliminar" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Eliminar" })[1]);
    await user.click(screen.getByRole("button", { name: "Agregar acuerdo" }));
    await user.click(screen.getByRole("button", { name: "Agregar botón" }));

    await user.type(
      screen.getAllByLabelText("Acuerdo").at(-1) as HTMLElement,
      "Saludar al entrar"
    );
    await user.type(
      screen.getAllByLabelText("Texto del botón").at(-1) as HTMLElement,
      "Nuevo recurso"
    );
    await user.type(
      screen.getAllByLabelText("URL").at(-1) as HTMLElement,
      "https://nuevo.example.com"
    );
    await user.click(screen.getByRole("button", { name: "Guardar bienvenida" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string) as ReturnType<
      typeof buildWelcome
    >;

    expect(body.rules.map((rule) => rule.sortOrder)).toEqual([2, 3]);
    expect(body.links.map((link) => link.sortOrder)).toEqual([2, 3]);
  });

  it("blocks WhatsApp buttons without a phone number before saving", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              id: "link-1",
              isActive: true,
              label: "WhatsApp",
              message: "Hola",
              phoneNumber: "",
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
              url: null,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar bienvenida" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Completá el teléfono de WhatsApp para guardar ese botón.")
    ).toBeInTheDocument();
  });

  it("blocks WhatsApp buttons without normalized phone digits before saving", async () => {
    const user = userEvent.setup();

    render(
      <TribeWelcomeManagement
        canEdit
        tribeSlug="matematica-pro"
        welcome={{
          ...buildWelcome(),
          links: [
            {
              id: "link-1",
              isActive: true,
              label: "WhatsApp",
              message: "Hola",
              phoneNumber: "sin digitos",
              sortOrder: 1,
              type: TRIBE_WELCOME_LINK_TYPE.whatsappButton,
              url: null,
            },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Guardar bienvenida" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Completá el teléfono de WhatsApp para guardar ese botón.")
    ).toBeInTheDocument();
  });
});
