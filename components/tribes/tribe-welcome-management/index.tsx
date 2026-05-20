"use client";

import { useMemo, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TribeWelcomeDisplay } from "@/components/tribes/tribe-welcome-display";
import type {
  TribeWelcomeLinkResult,
  TribeWelcomeResult,
  TribeWelcomeRuleResult,
} from "@/src/modules/tribes/application/results/tribe-welcome-result";
import {
  TRIBE_WELCOME_LINK_TYPE,
} from "@/src/modules/tribes/constants/tribe-welcome";
import styles from "./styles.module.scss";

const TRIBE_WELCOME_MANAGEMENT_COPY = {
  addLinkButton: "Agregar botón",
  addRuleButton: "Agregar acuerdo",
  editDescription:
    "Definí la pantalla que ven las personas antes de entrar y la referencia que queda disponible dentro de la tribu.",
  editTitle: "Bienvenida",
  fallbackSaveError: "No pudimos guardar la bienvenida.",
  inactiveLabel: "Activo",
  linkLabel: "Texto del botón",
  linkMessageLabel: "Mensaje personalizado",
  linkPhoneLabel: "Teléfono de WhatsApp",
  linkTypeLabel: "Tipo de botón",
  linkUrlLabel: "URL",
  removeItemLabel: "Eliminar",
  ruleLabel: "Acuerdo",
  resourcesHeading: "Recursos y botones",
  rulesHeading: "Acuerdos de convivencia",
  saveButton: "Guardar bienvenida",
  saveSuccess: "Bienvenida actualizada.",
  validationWhatsappPhone:
    "Completá el teléfono de WhatsApp para guardar ese botón.",
  welcomeMessageLabel: "Mensaje de bienvenida",
} as const;

const WELCOME_MANAGEMENT_ROUTE = {
  apiPrefix: "/api/tribes/",
  welcomeSegment: "/welcome",
} as const;

const WELCOME_MANAGEMENT_REQUEST = {
  buttonType: "button",
  checkboxType: "checkbox",
  contentTypeHeader: "Content-Type",
  jsonContentType: "application/json",
  outlineVariant: "outline",
  putMethod: "PUT",
  submitButtonType: "submit",
} as const;

const PHONE_NUMBER_NON_DIGIT_PATTERN = /\D/g;
const UUID_BYTE_LENGTH = 16;
const UUID_FIRST_GROUP_END_INDEX = 4;
const UUID_FOURTH_GROUP_END_INDEX = 10;
const UUID_SECOND_GROUP_END_INDEX = 6;
const UUID_THIRD_GROUP_END_INDEX = 8;
const UUID_GROUP_SLICES = [
  [0, UUID_FIRST_GROUP_END_INDEX],
  [UUID_FIRST_GROUP_END_INDEX, UUID_SECOND_GROUP_END_INDEX],
  [UUID_SECOND_GROUP_END_INDEX, UUID_THIRD_GROUP_END_INDEX],
  [UUID_THIRD_GROUP_END_INDEX, UUID_FOURTH_GROUP_END_INDEX],
  [UUID_FOURTH_GROUP_END_INDEX, UUID_BYTE_LENGTH],
] as const;
const UUID_GROUP_SEPARATOR = "-";
const UUID_HEX_BYTE_LENGTH = 2;
const UUID_HEX_PAD_CHARACTER = "0";
const UUID_HEX_RADIX = 16;
const UUID_RANDOM_BYTE_RANGE = 256;
const UUID_VARIANT_BIT_MASK = 0x3f;
const UUID_VARIANT_BYTE_INDEX = 8;
const UUID_VARIANT_VALUE = 0x80;
const UUID_VERSION_BIT_MASK = 0x0f;
const UUID_VERSION_BYTE_INDEX = 6;
const UUID_VERSION_VALUE = 0x40;

const WELCOME_LINK_TYPE_LABEL = {
  [TRIBE_WELCOME_LINK_TYPE.customButton]: "Botón personalizado",
  [TRIBE_WELCOME_LINK_TYPE.whatsappButton]: "WhatsApp",
} as const;

type TribeWelcomeManagementProps = {
  canEdit: boolean;
  tribeSlug: string;
  welcome: TribeWelcomeResult;
};

function createClientId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const uuidBytes = new Uint8Array(UUID_BYTE_LENGTH);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(uuidBytes);
  } else {
    for (let byteIndex = 0; byteIndex < uuidBytes.length; byteIndex += 1) {
      uuidBytes[byteIndex] = Math.floor(
        Math.random() * UUID_RANDOM_BYTE_RANGE
      );
    }
  }

  uuidBytes[UUID_VERSION_BYTE_INDEX] =
    (uuidBytes[UUID_VERSION_BYTE_INDEX] & UUID_VERSION_BIT_MASK) |
    UUID_VERSION_VALUE;
  uuidBytes[UUID_VARIANT_BYTE_INDEX] =
    (uuidBytes[UUID_VARIANT_BYTE_INDEX] & UUID_VARIANT_BIT_MASK) |
    UUID_VARIANT_VALUE;

  const hexBytes = Array.from(uuidBytes, (byte) =>
    byte
      .toString(UUID_HEX_RADIX)
      .padStart(UUID_HEX_BYTE_LENGTH, UUID_HEX_PAD_CHARACTER)
  );

  return UUID_GROUP_SLICES.map(([startIndex, endIndex]) =>
    hexBytes.slice(startIndex, endIndex).join("")
  ).join(UUID_GROUP_SEPARATOR);
}

function buildWelcomeEndpoint(tribeSlug: string): string {
  return (
    WELCOME_MANAGEMENT_ROUTE.apiPrefix +
    tribeSlug +
    WELCOME_MANAGEMENT_ROUTE.welcomeSegment
  );
}

function createEmptyRule(sortOrder: number): TribeWelcomeRuleResult {
  return {
    id: createClientId(),
    isActive: true,
    label: "",
    sortOrder,
  };
}

function createEmptyLink(sortOrder: number): TribeWelcomeLinkResult {
  return {
    id: createClientId(),
    isActive: true,
    label: "",
    message: null,
    phoneNumber: null,
    sortOrder,
    type: TRIBE_WELCOME_LINK_TYPE.customButton,
    url: "",
  };
}

function getNextSortOrder(
  items: Array<Pick<TribeWelcomeRuleResult, "sortOrder">>
): number {
  return (
    Math.max(
      0,
      ...items.map((item) => item.sortOrder)
    ) + 1
  );
}

async function submitWelcomeUpdate(
  tribeSlug: string,
  welcome: TribeWelcomeResult
): Promise<string> {
  const response = await fetch(buildWelcomeEndpoint(tribeSlug), {
    body: JSON.stringify(welcome),
    headers: {
      [WELCOME_MANAGEMENT_REQUEST.contentTypeHeader]:
        WELCOME_MANAGEMENT_REQUEST.jsonContentType,
    },
    method: WELCOME_MANAGEMENT_REQUEST.putMethod,
  });
  const responseBody = (await response.json().catch(() => ({}))) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? TRIBE_WELCOME_MANAGEMENT_COPY.fallbackSaveError
    );
  }

  return responseBody.message ?? TRIBE_WELCOME_MANAGEMENT_COPY.saveSuccess;
}

function hasInvalidWhatsappLink(links: TribeWelcomeLinkResult[]): boolean {
  return links.some(
    (link) =>
      link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton &&
      !link.phoneNumber?.replace(PHONE_NUMBER_NON_DIGIT_PATTERN, "")
  );
}

export function TribeWelcomeManagement({
  canEdit,
  tribeSlug,
  welcome,
}: TribeWelcomeManagementProps) {
  const [welcomeMessage, setWelcomeMessage] = useState(welcome.welcomeMessage);
  const [rules, setRules] = useState(welcome.rules);
  const [links, setLinks] = useState(welcome.links);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const currentWelcome = useMemo(
    () => ({
      links,
      rules,
      welcomeMessage,
    }),
    [links, rules, welcomeMessage]
  );

  if (!canEdit) {
    return <TribeWelcomeDisplay welcome={welcome} />;
  }

  const updateRule = (
    ruleId: string,
    patch: Partial<TribeWelcomeRuleResult>
  ) => {
    setRules((currentRules) =>
      currentRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule
      )
    );
    setValidationMessage(null);
  };
  const updateLink = (
    linkId: string,
    patch: Partial<TribeWelcomeLinkResult>
  ) => {
    setLinks((currentLinks) =>
      currentLinks.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link
      )
    );
    setValidationMessage(null);
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (hasInvalidWhatsappLink(links)) {
      setValidationMessage(TRIBE_WELCOME_MANAGEMENT_COPY.validationWhatsappPhone);
      return;
    }

    setIsSaving(true);
    setValidationMessage(null);

    try {
      const message = await submitWelcomeUpdate(tribeSlug, currentWelcome);

      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_WELCOME_MANAGEMENT_COPY.fallbackSaveError
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={styles.TribeWelcomeManagement}>
      <header className={styles.TribeWelcomeManagement__header}>
        <h1 className={styles.TribeWelcomeManagement__title}>
          {TRIBE_WELCOME_MANAGEMENT_COPY.editTitle}
        </h1>
        <p className={styles.TribeWelcomeManagement__description}>
          {TRIBE_WELCOME_MANAGEMENT_COPY.editDescription}
        </p>
      </header>

      <form
        className={styles.TribeWelcomeManagement__form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label className={styles.TribeWelcomeManagement__field}>
          <span>{TRIBE_WELCOME_MANAGEMENT_COPY.welcomeMessageLabel}</span>
          <Input
            value={welcomeMessage}
            onChange={(event) => {
              setWelcomeMessage(event.target.value);
              setValidationMessage(null);
            }}
          />
        </label>

        <section className={styles.TribeWelcomeManagement__collection}>
          <div className={styles.TribeWelcomeManagement__collectionHeader}>
            <h2 className={styles.TribeWelcomeManagement__subtitle}>
              {TRIBE_WELCOME_MANAGEMENT_COPY.rulesHeading}
            </h2>
            <Button
              onClick={() => setRules((currentRules) => [
                ...currentRules,
                createEmptyRule(getNextSortOrder(currentRules)),
              ])}
              type={WELCOME_MANAGEMENT_REQUEST.buttonType}
              variant={WELCOME_MANAGEMENT_REQUEST.outlineVariant}
            >
              <PlusIcon />
              {TRIBE_WELCOME_MANAGEMENT_COPY.addRuleButton}
            </Button>
          </div>
          {rules.map((rule) => (
            <div className={styles.TribeWelcomeManagement__row} key={rule.id}>
              <label className={styles.TribeWelcomeManagement__field}>
                <span>{TRIBE_WELCOME_MANAGEMENT_COPY.ruleLabel}</span>
                <Input
                  value={rule.label}
                  onChange={(event) =>
                    updateRule(rule.id, { label: event.target.value })
                  }
                />
              </label>
              <label className={styles.TribeWelcomeManagement__checkLabel}>
                <input
                  checked={rule.isActive}
                  onChange={(event) =>
                    updateRule(rule.id, { isActive: event.target.checked })
                  }
                  type={WELCOME_MANAGEMENT_REQUEST.checkboxType}
                />
                {TRIBE_WELCOME_MANAGEMENT_COPY.inactiveLabel}
              </label>
              <Button
                onClick={() =>
                  setRules((currentRules) =>
                    currentRules.filter((currentRule) => currentRule.id !== rule.id)
                  )
                }
                type={WELCOME_MANAGEMENT_REQUEST.buttonType}
                variant={WELCOME_MANAGEMENT_REQUEST.outlineVariant}
              >
                <Trash2Icon />
                {TRIBE_WELCOME_MANAGEMENT_COPY.removeItemLabel}
              </Button>
            </div>
          ))}
        </section>

        <section className={styles.TribeWelcomeManagement__collection}>
          <div className={styles.TribeWelcomeManagement__collectionHeader}>
            <h2 className={styles.TribeWelcomeManagement__subtitle}>
              {TRIBE_WELCOME_MANAGEMENT_COPY.resourcesHeading}
            </h2>
            <Button
              onClick={() => setLinks((currentLinks) => [
                ...currentLinks,
                createEmptyLink(getNextSortOrder(currentLinks)),
              ])}
              type={WELCOME_MANAGEMENT_REQUEST.buttonType}
              variant={WELCOME_MANAGEMENT_REQUEST.outlineVariant}
            >
              <PlusIcon />
              {TRIBE_WELCOME_MANAGEMENT_COPY.addLinkButton}
            </Button>
          </div>
          {links.map((link) => (
            <div className={styles.TribeWelcomeManagement__row} key={link.id}>
              <label className={styles.TribeWelcomeManagement__field}>
                <span>{TRIBE_WELCOME_MANAGEMENT_COPY.linkTypeLabel}</span>
                <select
                  className={styles.TribeWelcomeManagement__select}
                  value={link.type}
                  onChange={(event) =>
                    updateLink(link.id, {
                      type: event.target.value as TribeWelcomeLinkResult["type"],
                    })
                  }
                >
                  {Object.values(TRIBE_WELCOME_LINK_TYPE).map((type) => (
                    <option key={type} value={type}>
                      {WELCOME_LINK_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.TribeWelcomeManagement__field}>
                <span>{TRIBE_WELCOME_MANAGEMENT_COPY.linkLabel}</span>
                <Input
                  value={link.label}
                  onChange={(event) =>
                    updateLink(link.id, { label: event.target.value })
                  }
                />
              </label>
              {link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton ? (
                <>
                  <label className={styles.TribeWelcomeManagement__field}>
                    <span>{TRIBE_WELCOME_MANAGEMENT_COPY.linkPhoneLabel}</span>
                    <Input
                      value={link.phoneNumber ?? ""}
                      onChange={(event) =>
                        updateLink(link.id, { phoneNumber: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.TribeWelcomeManagement__field}>
                    <span>{TRIBE_WELCOME_MANAGEMENT_COPY.linkMessageLabel}</span>
                    <Input
                      value={link.message ?? ""}
                      onChange={(event) =>
                        updateLink(link.id, { message: event.target.value })
                      }
                    />
                  </label>
                </>
              ) : (
                <label className={styles.TribeWelcomeManagement__field}>
                  <span>{TRIBE_WELCOME_MANAGEMENT_COPY.linkUrlLabel}</span>
                  <Input
                    value={link.url ?? ""}
                    onChange={(event) =>
                      updateLink(link.id, { url: event.target.value })
                    }
                  />
                </label>
              )}
              <label className={styles.TribeWelcomeManagement__checkLabel}>
                <input
                  checked={link.isActive}
                  onChange={(event) =>
                    updateLink(link.id, { isActive: event.target.checked })
                  }
                  type={WELCOME_MANAGEMENT_REQUEST.checkboxType}
                />
                {TRIBE_WELCOME_MANAGEMENT_COPY.inactiveLabel}
              </label>
              <Button
                onClick={() =>
                  setLinks((currentLinks) =>
                    currentLinks.filter((currentLink) => currentLink.id !== link.id)
                  )
                }
                type={WELCOME_MANAGEMENT_REQUEST.buttonType}
                variant={WELCOME_MANAGEMENT_REQUEST.outlineVariant}
              >
                <Trash2Icon />
                {TRIBE_WELCOME_MANAGEMENT_COPY.removeItemLabel}
              </Button>
            </div>
          ))}
        </section>

        {validationMessage ? (
          <p className={styles.TribeWelcomeManagement__error}>
            {validationMessage}
          </p>
        ) : null}

        <Button disabled={isSaving} type={WELCOME_MANAGEMENT_REQUEST.submitButtonType}>
          {TRIBE_WELCOME_MANAGEMENT_COPY.saveButton}
        </Button>
      </form>
    </section>
  );
}
