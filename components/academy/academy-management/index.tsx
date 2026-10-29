"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject, type SubmitEvent } from "react";
import { ArrowLeftIcon, PlusIcon, SearchIcon } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  Input,
  Select,
  type SelectOption,
  Switch,
  Textarea,
  toast,
} from "@golfo/ui";

import { Link } from "@/components/navigation/link";
import {
  decideMemberVerification,
  fetchAcademyMembers,
  fetchVerificationReviewQueue,
  grantAcademyBonus,
  revokeAcademyBonus,
  saveAcademyOffer,
  saveVerificationProvider,
  setAcademyAvailability,
} from "@/lib/academy/academy-api-client";
import { buildBonusEndsAt, formatAcademyDate, getTodayDateKey } from "@/lib/academy/academy-format";
import { ROUTES } from "@/src/constants/routes";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { MESSAGING_USAGE_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-usage";
import { MESSAGING_CONNECTIONS_SETTINGS_SEGMENT } from "@/src/modules/messaging/constants/messaging-connections-browser";
import type {
  ReviewQueueItemDto,
  VerificationProviderDto,
} from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import type {
  AcademyMemberRowDto,
  AcademyMembersPageDto,
  AcademySettingsDto,
} from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import styles from "./styles.module.scss";

const MANAGEMENT_COPY = {
  admissionsDescription: "Configurá cómo se pide el ingreso y con qué servicio se envían los códigos.",
  admissionsLinkPolicy: "Reglas de admisión",
  admissionsLinkReview: "Solicitudes de ingreso",
  admissionsLinkUsage: "Países y cupos de mensajería",
  admissionsLinkConnection: "Conexión de mensajería",
  admissionsTitle: "Admisiones y mensajería",
  accessColumn: "Acceso",
  accessNo: "Sin academia",
  admissionDescription: "Permite que nuevas personas ingresen gratis a la tribu.",
  availabilityTitle: "Disponibilidad",
  accessYes: "Con academia",
  actionsColumn: "Acciones",
  activeLabel: "Activo",
  inactiveLabel: "Inactivo",
  admissionLabel: "Admisiones abiertas",
  allStatuses: "Todos los estados",
  availabilityHint:
    "Pausar admisiones o ventas no cancela renovaciones ni bonificaciones y no abre el contenido.",
  backLink: "Ver la academia",
  benefitsHelp: "Un beneficio por línea (máximo 8).",
  benefitsLabel: "Beneficios",
  bonusButton: "Bonificar",
  bonusDialogDescription:
    "La bonificación empieza ahora y termina al final del día elegido. No cancela ni reembolsa cobros.",
  bonusDialogTitle: "Bonificar acceso a la academia",
  bonusEndLabel: "Válida hasta (inclusive)",
  bonusException: "Otorgar aunque no esté verificada (excepción)",
  bonusReasonLabel: "Motivo (privado)",
  bonusRenewalWarning:
    "Esta persona tiene una renovación activa: la bonificación no detiene sus cobros.",
  bonusSubmit: "Otorgar bonificación",
  bonusSuccess: "Bonificación otorgada.",
  cancel: "Cancelar",
  conflict: "Otra persona actualizó este dato. Revisá el estado actual y volvé a intentarlo.",
  decisionReasonLabel: "Motivo",
  decisionReasonRequired: "Indicá un motivo para rechazar.",
  descriptionLabel: "Explicación del diferencial",
  displayNameLabel: "Nombre visible",
  emptyMembers: "No hay integrantes para mostrar.",
  emptyProviders: "Todavía no hay proveedores.",
  emptyQueue: "No hay solicitudes con esos filtros.",
  grantBonus: "Bono",
  grantLegacy: "Legado",
  grantPaid: "Pago",
  grantRevoked: "revocado",
  bonusRevoked: "La bonificación quedó revocada.",
  grantUntil: "hasta el",
  grantUnbounded: "sin vencimiento",
  instructionsLabel: "Instrucciones",
  keyLabel: "Clave (letras, números y guiones)",
  linkLabel: "Enlace HTTPS (opcional)",
  memberColumn: "Integrante",
  membersTitle: "Accesos de integrantes",
  modeAcademy: "Academia activa",
  modeLegacy: "Modo clásico",
  modeLegacyNote: "La academia todavía no está activa en esta tribu. Podés activarla desde",
  modeLegacyLink: "Ajustes",
  offerDescription: "Es lo que ven tus integrantes en la página de la academia.",
  pageDescription: "Configurá la oferta, revisá las verificaciones y administrá el acceso de cada integrante.",
  pageEyebrow: "Academia de la tribu",
  providersDescription: "Son las entidades con las que tus integrantes confirman su vinculación.",
  queueDescription: "Verificá o rechazá las vinculaciones que pidieron tus integrantes.",
  membersDescription: "Revisá quién tiene la academia y bonificá el acceso cuando haga falta.",
  reasonPlaceholder: "Obligatorio para rechazar",
  salesDescription: "Permite contratar la academia desde su página.",
  newProvider: "Nuevo proveedor",
  next: "Siguiente",
  offerSaved: "Oferta guardada.",
  offerTitle: "Oferta",
  pageTitle: "Gestionar academia",
  previous: "Anterior",
  providerColumn: "Proveedor",
  providerSaved: "Proveedor guardado.",
  providersTitle: "Proveedores de verificación",
  queueTitle: "Solicitudes de verificación",
  reject: "Rechazar",
  renewalActive: "Renovación activa",
  revoke: "Revocar",
  revokeBonusPrompt: "Motivo de la revocación",
  revokeBonusTitle: "Revocar bonificación",
  revokeBonusSubject: "Bonificación",
  revokeBonusDescription: "El acceso de la bonificación termina ahora. Contanos el motivo; queda registrado.",
  revokeBonusSubmit: "Revocar bonificación",
  revoking: "Revocando…",
  revokeVerificationDescription:
    "La vinculación deja de estar verificada ahora y puede afectar su acceso a la academia. Contanos el motivo: queda registrado y la persona lo ve.",
  revokeVerificationPrompt: "Motivo de la revocación",
  revokeVerificationSubmit: "Revocar verificación",
  revokeVerificationTitle: "Revocar verificación",
  verificationRevoked: "La verificación quedó revocada.",
  loadingList: "Consultando…",
  offerDraftKept: "Tus cambios de la oferta siguen en el formulario.",
  salesLabel: "Ventas abiertas",
  save: "Guardar",
  saving: "Guardando…",
  searchLabel: "Buscar por nombre",
  searchSubmit: "Buscar",
  settingsSaved: "Configuración guardada.",
  settingsTitle: "Configuración",
  statusColumn: "Estado",
  statusFilterLabel: "Estado",
  titleLabel: "Título",
  verifiedNo: "Sin verificar",
  verifiedYes: "Verificada",
  verify: "Verificar",
  edit: "Editar",
} as const;

const QUEUE_STATUS_LABEL: Record<ReviewQueueItemDto["status"], string> = {
  pending: "En revisión",
  rejected: "Rechazada",
  revoked: "Revocada",
  verified: "Verificada",
};

const ALL_STATUSES_VALUE = "all";
const QUEUE_STATUS_OPTIONS: SelectOption[] = [
  { label: MANAGEMENT_COPY.allStatuses, value: ALL_STATUSES_VALUE },
  ...Object.entries(QUEUE_STATUS_LABEL).map(([value, label]) => ({ label, value })),
];
const MIN_REASON_LENGTH = 3;
const HTTP_STATUS_CONFLICT = 409;
const PAGE_SIZE = 20;
const MAX_BENEFITS = 8;
const LINE_SEPARATOR = "\n";

type QueuePage = { items: ReviewQueueItemDto[]; page: number; total: number };

export type AcademyManagementProps = {
  initialMembers: AcademyMembersPageDto;
  initialQueue: QueuePage;
  providers: VerificationProviderDto[] | null;
  settings: AcademySettingsDto | null;
  tribeSlug: string;
  viewerRole: "guardian" | "leader";
};

/**
 * Operational academy management by role: configuration and providers for
 * the active leader, verification review and member access for leaders and
 * guardians. Every permission is enforced again by the server.
 *
 * @param props - Initial server data and viewer role.
 * @returns Management page content.
 */
export function AcademyManagement({
  initialMembers,
  initialQueue,
  providers,
  settings,
  tribeSlug,
  viewerRole,
}: AcademyManagementProps) {
  const isLeader = viewerRole === "leader";

  return (
    <div className={styles.AcademyManagement}>
      <header className={styles.AcademyManagement__header}>
        <Link className={styles.AcademyManagement__backLink} href={ROUTES.tribes.academy(tribeSlug)}>
          <ArrowLeftIcon aria-hidden className={styles.AcademyManagement__icon} />
          {MANAGEMENT_COPY.backLink}
        </Link>
        <p className={styles.AcademyManagement__eyebrow}>{MANAGEMENT_COPY.pageEyebrow}</p>
        <h1 className={styles.AcademyManagement__title}>{MANAGEMENT_COPY.pageTitle}</h1>
        <p className={styles.AcademyManagement__description}>{MANAGEMENT_COPY.pageDescription}</p>
      </header>
      {isLeader && settings ? <SettingsSection initialSettings={settings} tribeSlug={tribeSlug} /> : null}
      {isLeader && providers ? <ProvidersSection initialProviders={providers} tribeSlug={tribeSlug} /> : null}
      {isLeader ? <AdmissionsShortcutsSection tribeSlug={tribeSlug} /> : null}
      <ReviewQueueSection initialQueue={initialQueue} tribeSlug={tribeSlug} />
      <MembersSection initialMembers={initialMembers} isLeader={isLeader} tribeSlug={tribeSlug} />
    </div>
  );
}

/**
 * Gives leaders a visible way into the admission and messaging setup pages, which have no other entry from the academy.
 * @param props - The current tribe slug.
 * @returns Ordinary navigation links; opening them reads state only and never saves, sends or activates anything.
 */
function AdmissionsShortcutsSection({ tribeSlug }: { tribeSlug: string }) {
  const titleId = useId();
  const href = (segment: string) => `/${encodeURIComponent(tribeSlug)}/${segment}`;
  const links = [
    { href: href(ADMISSION_POLICY_SETTINGS_SEGMENT), label: MANAGEMENT_COPY.admissionsLinkPolicy },
    { href: href(ADMISSION_NAVIGATION.reviewSegment), label: MANAGEMENT_COPY.admissionsLinkReview },
    { href: href(MESSAGING_USAGE_SETTINGS_SEGMENT), label: MANAGEMENT_COPY.admissionsLinkUsage },
    { href: href(MESSAGING_CONNECTIONS_SETTINGS_SEGMENT), label: MANAGEMENT_COPY.admissionsLinkConnection },
  ];
  return (
    <section aria-labelledby={titleId} className={styles.AcademyManagement__section}>
      <h2 className={styles.AcademyManagement__sectionTitle} id={titleId}>{MANAGEMENT_COPY.admissionsTitle}</h2>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.admissionsDescription}</p>
      <nav aria-label={MANAGEMENT_COPY.admissionsTitle}>
        <ul className={styles.AcademyManagement__shortcuts}>
          {links.map((link) => <li key={link.href}><Link className={styles.AcademyManagement__inlineLink} href={link.href}>{link.label}</Link></li>)}
        </ul>
      </nav>
    </section>
  );
}

type FeedbackState = { isError: boolean; message: string };

/** Error of a section or dialog, announced as an alert. */
function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <p className={styles.AcademyManagement__error} role="alert">
      {message}
    </p>
  ) : null;
}

/** Load error and loading line of a paged list. */
function ListStatus({ errorMessage, isLoading }: { errorMessage: string | null; isLoading: boolean }) {
  return (
    <>
      <ErrorMessage message={errorMessage} />
      {isLoading ? (
        <p className={styles.AcademyManagement__hint} role="status">{MANAGEMENT_COPY.loadingList}</p>
      ) : null}
    </>
  );
}

type ListSearchFormProps = {
  /** Extra filters shown before the search field. */
  children?: ReactNode;
  onSearch: () => void;
  search: string;
  searchId: string;
  setSearch: (search: string) => void;
};

/** Search form of a paged list; submitting it starts again from the first page. */
function ListSearchForm({ children, onSearch, search, searchId, setSearch }: ListSearchFormProps) {
  return (
    <form
      className={styles.AcademyManagement__filters}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
      role="search"
    >
      {children}
      <div className={styles.AcademyManagement__filterSearch}>
        <Input
          id={searchId}
          label={MANAGEMENT_COPY.searchLabel}
          maxLength={80}
          onChange={(event) => setSearch(event.currentTarget.value)}
          value={search}
        />
      </div>
      <Button type="submit" variant="secondary">
        <SearchIcon aria-hidden />
        {MANAGEMENT_COPY.searchSubmit}
      </Button>
    </form>
  );
}

type SettingsPending = "availability" | "offer" | null;

type SettingsMutationsInput = {
  /** Applies confirmed settings; `keepOfferDraft` keeps unsaved offer edits. */
  applySettings: (next: AcademySettingsDto, keepOfferDraft?: boolean) => void;
  benefits: string;
  description: string;
  offerDirty: boolean;
  setFeedback: (feedback: FeedbackState | null) => void;
  setPending: (pending: SettingsPending) => void;
  settings: AcademySettingsDto;
  title: string;
  tribeSlug: string;
};

/** Offer save and availability changes, one at a time. */
function useSettingsMutations({
  applySettings,
  benefits,
  description,
  offerDirty,
  setFeedback,
  setPending,
  settings,
  title,
  tribeSlug,
}: SettingsMutationsInput) {
  // Blocks a second change before the disabled state renders.
  const isBusyRef = useRef(false);
  const runOnce = (pending: Exclude<SettingsPending, null>, work: () => Promise<void>) =>
    runExclusive(isBusyRef, (isBusy) => setPending(isBusy ? pending : null), async () => {
      setFeedback(null);
      await work();
    });

  const handleOfferSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    await runOnce("offer", async () => {
      const result = await saveAcademyOffer(tribeSlug, {
        benefits: benefits
          .split(LINE_SEPARATOR)
          .map((benefit) => benefit.trim())
          .filter(Boolean)
          .slice(0, MAX_BENEFITS),
        description,
        expectedConfigVersion: settings.configVersion,
        title,
      });

      if (result.isSuccess) {
        applySettings(result.data);
        setFeedback({ isError: false, message: MANAGEMENT_COPY.offerSaved });

        return;
      }

      if (result.conflictData) {
        // The newer version unblocks a retry; what the leader typed stays to compare and save again.
        applySettings(result.conflictData, true);
      }

      setFeedback({ isError: true, message: result.conflictData ? `${result.message} ${MANAGEMENT_COPY.offerDraftKept}` : result.message });
    });
  };

  const toggleAvailability = (change: { admissionEnabled?: boolean; salesEnabled?: boolean }) =>
    runOnce("availability", async () => {
      const result = await setAcademyAvailability(tribeSlug, {
        admissionEnabled: change.admissionEnabled ?? settings.admissionEnabled,
        expectedConfigVersion: settings.configVersion,
        salesEnabled: change.salesEnabled ?? settings.salesEnabled,
      });

      if (result.isSuccess) {
        applySettings(result.data, offerDirty);
        toast.success(MANAGEMENT_COPY.settingsSaved);

        return;
      }

      if (result.conflictData) {
        applySettings(result.conflictData, offerDirty);
      }

      setFeedback({ isError: true, message: result.message });
    });

  return { handleOfferSubmit, toggleAvailability };
}

/** Section title, current access mode and, in the legacy mode, where to switch it. */
function SettingsHeader({ isAcademyMode, titleId, tribeSlug }: { isAcademyMode: boolean; titleId: string; tribeSlug: string }) {
  return (
    <>
      <div className={styles.AcademyManagement__sectionHeader}>
        <h2 className={styles.AcademyManagement__sectionTitle} id={`${titleId}-section`}>
          {MANAGEMENT_COPY.settingsTitle}
        </h2>
        <Badge tone={isAcademyMode ? "info" : "neutral"}>
          {isAcademyMode ? MANAGEMENT_COPY.modeAcademy : MANAGEMENT_COPY.modeLegacy}
        </Badge>
      </div>
      {isAcademyMode ? null : (
        <p className={styles.AcademyManagement__hint}>
          {`${MANAGEMENT_COPY.modeLegacyNote} `}
          <Link className={styles.AcademyManagement__inlineLink} href={ROUTES.tribes.settings(tribeSlug)}>
            {MANAGEMENT_COPY.modeLegacyLink}
          </Link>
          .
        </p>
      )}
    </>
  );
}

type AvailabilityGroupProps = {
  disabled: boolean;
  onToggle: (change: { admissionEnabled?: boolean; salesEnabled?: boolean }) => void;
  settings: AcademySettingsDto;
};

/** Admission and sales switches. */
function AvailabilityGroup({ disabled, onToggle, settings }: AvailabilityGroupProps) {
  return (
    <div className={styles.AcademyManagement__group}>
      <h3 className={styles.AcademyManagement__subTitle}>{MANAGEMENT_COPY.availabilityTitle}</h3>
      <ul className={styles.AcademyManagement__toggles}>
        <AvailabilityToggle
          checked={settings.admissionEnabled}
          description={MANAGEMENT_COPY.admissionDescription}
          disabled={disabled}
          label={MANAGEMENT_COPY.admissionLabel}
          onCheckedChange={(checked) => onToggle({ admissionEnabled: checked })}
        />
        <AvailabilityToggle
          checked={settings.salesEnabled}
          description={MANAGEMENT_COPY.salesDescription}
          disabled={disabled}
          label={MANAGEMENT_COPY.salesLabel}
          onCheckedChange={(checked) => onToggle({ salesEnabled: checked })}
        />
      </ul>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.availabilityHint}</p>
    </div>
  );
}

type OfferFormProps = {
  benefits: string;
  benefitsId: string;
  description: string;
  descriptionId: string;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  pending: SettingsPending;
  setBenefits: (benefits: string) => void;
  setDescription: (description: string) => void;
  setTitle: (title: string) => void;
  title: string;
  titleId: string;
};

/** Title, description and benefits of the academy offer. */
function OfferForm(props: OfferFormProps) {
  const { pending, title } = props;

  return (
    <form className={styles.AcademyManagement__form} noValidate onSubmit={props.onSubmit}>
      <div className={styles.AcademyManagement__groupHeading}>
        <h3 className={styles.AcademyManagement__subTitle}>{MANAGEMENT_COPY.offerTitle}</h3>
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.offerDescription}</p>
      </div>
      <div className={styles.AcademyManagement__field}>
        <Input
          id={props.titleId}
          label={MANAGEMENT_COPY.titleLabel}
          maxLength={120}
          onChange={(event) => props.setTitle(event.currentTarget.value)}
          required
          value={title}
        />
      </div>
      <div className={styles.AcademyManagement__field}>
        <Textarea
          id={props.descriptionId}
          label={MANAGEMENT_COPY.descriptionLabel}
          maxLength={2000}
          onChange={(event) => props.setDescription(event.currentTarget.value)}
          rows={4}
          value={props.description}
        />
      </div>
      <div className={styles.AcademyManagement__field}>
        <Textarea
          description={MANAGEMENT_COPY.benefitsHelp}
          id={props.benefitsId}
          label={MANAGEMENT_COPY.benefitsLabel}
          onChange={(event) => props.setBenefits(event.currentTarget.value)}
          rows={4}
          value={props.benefits}
        />
      </div>
      <div className={styles.AcademyManagement__actions}>
        <Button aria-busy={pending === "offer" || undefined} disabled={pending !== null || !title.trim()} type="submit">
          {pending === "offer" ? MANAGEMENT_COPY.saving : MANAGEMENT_COPY.save}
        </Button>
      </div>
    </form>
  );
}

/** Outcome of the last change: an alert on failure, a status otherwise. */
function FeedbackMessage({ feedback, successClassName }: { feedback: FeedbackState | null; successClassName: string | undefined }) {
  return feedback ? (
    <p
      className={feedback.isError ? styles.AcademyManagement__error : successClassName}
      role={feedback.isError ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  ) : null;
}

function SettingsSection({
  initialSettings,
  tribeSlug,
}: {
  initialSettings: AcademySettingsDto;
  tribeSlug: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const benefitsId = useId();
  const [settings, setSettings] = useState(initialSettings);
  const [title, setTitle] = useState(initialSettings.title);
  const [description, setDescription] = useState(initialSettings.description);
  const [benefits, setBenefits] = useState(() => initialSettings.benefits.join(LINE_SEPARATOR));
  const [pending, setPending] = useState<SettingsPending>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  /** Whether the offer fields hold edits the leader has not saved yet. */
  const offerDirty =
    title !== settings.title ||
    description !== settings.description ||
    benefits !== settings.benefits.join(LINE_SEPARATOR);

  /**
   * @param next - Settings the server confirmed.
   * @param keepOfferDraft - Keeps unsaved offer edits (an availability change or a conflict must not erase them).
   */
  const applySettings = (next: AcademySettingsDto, keepOfferDraft = false) => {
    setSettings(next);

    if (keepOfferDraft) {
      return;
    }

    setTitle(next.title);
    setDescription(next.description);
    setBenefits(next.benefits.join(LINE_SEPARATOR));
  };

  const { handleOfferSubmit, toggleAvailability } = useSettingsMutations({
    applySettings, benefits, description, offerDirty, setFeedback, setPending, settings, title, tribeSlug,
  });
  const isAcademyMode = settings.accessModel === "academy";

  return (
    <section
      aria-labelledby={`${titleId}-section`}
      className={`${styles.AcademyManagement__section} ${styles["AcademyManagement__section--spacious"]}`}
    >
      <SettingsHeader isAcademyMode={isAcademyMode} titleId={titleId} tribeSlug={tribeSlug} />
      <AvailabilityGroup
        disabled={!isAcademyMode || pending !== null}
        onToggle={(change) => {
          void toggleAvailability(change);
        }}
        settings={settings}
      />
      <OfferForm
        benefits={benefits}
        benefitsId={benefitsId}
        description={description}
        descriptionId={descriptionId}
        onSubmit={handleOfferSubmit}
        pending={pending}
        setBenefits={setBenefits}
        setDescription={setDescription}
        setTitle={setTitle}
        title={title}
        titleId={titleId}
      />
      <FeedbackMessage feedback={feedback} successClassName={styles.AcademyManagement__hint} />
    </section>
  );
}

/**
 * One availability switch with its label and a short explanation.
 *
 * @param props - Switch state, copy and change handler.
 * @returns Toggle row.
 */
function AvailabilityToggle({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const switchId = useId();
  const descriptionId = useId();

  return (
    <li className={styles.AcademyManagement__toggle}>
      <span className={styles.AcademyManagement__toggleText}>
        <label className={styles.AcademyManagement__toggleLabel} htmlFor={switchId}>
          {label}
        </label>
        <span className={styles.AcademyManagement__hint} id={descriptionId}>
          {description}
        </span>
      </span>
      <Switch
        aria-describedby={descriptionId}
        checked={checked}
        disabled={disabled}
        id={switchId}
        onCheckedChange={onCheckedChange}
      />
    </li>
  );
}

type ProviderDraft = {
  displayName: string;
  id: string | null;
  instructions: string;
  isActive: boolean;
  key: string;
  linkUrl: string;
};

const EMPTY_PROVIDER: ProviderDraft = {
  displayName: "",
  id: null,
  instructions: "",
  isActive: true,
  key: "",
  linkUrl: "",
};

/** Draft of an existing provider, ready to edit. */
function toProviderDraft(provider: VerificationProviderDto): ProviderDraft {
  return {
    displayName: provider.displayName,
    id: provider.id,
    instructions: provider.instructions,
    isActive: provider.isActive,
    key: provider.key,
    linkUrl: provider.linkUrl ?? "",
  };
}

type ProviderRowProps = {
  isEditing: boolean;
  onEdit: () => void;
  provider: VerificationProviderDto;
};

/** One provider with its state, key and edit action. */
function ProviderRow({ isEditing, onEdit, provider }: ProviderRowProps) {
  return (
    <li className={styles.AcademyManagement__row}>
      <span className={styles.AcademyManagement__rowMain}>
        <span className={styles.AcademyManagement__rowTitle}>
          <strong>{provider.displayName}</strong>
          <Badge>
            {provider.isActive ? MANAGEMENT_COPY.activeLabel : MANAGEMENT_COPY.inactiveLabel}
          </Badge>
        </span>
        <code className={styles.AcademyManagement__code}>{provider.key}</code>
      </span>
      <Button
        className={styles.AcademyManagement__rowAction}
        size="sm"
        disabled={isEditing}
        onClick={onEdit}
        type="button"
        variant="secondary"
      >
        {MANAGEMENT_COPY.edit}
      </Button>
    </li>
  );
}

type ProviderFieldIds = {
  instructionsId: string;
  keyInputId: string;
  linkInputId: string;
  nameInputId: string;
};

type ProviderDraftFormProps = {
  draft: ProviderDraft;
  errorMessage: string | null;
  ids: ProviderFieldIds;
  isSaving: boolean;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  setDraft: (draft: ProviderDraft | null) => void;
};

/** Create or edit form of a verification provider. */
function ProviderDraftForm({ draft, errorMessage, ids, isSaving, onSubmit, setDraft }: ProviderDraftFormProps) {
  return (
    <form className={styles.AcademyManagement__panel} noValidate onSubmit={onSubmit}>
      <div className={styles.AcademyManagement__field}>
        <Input
          id={ids.keyInputId}
          label={MANAGEMENT_COPY.keyLabel}
          maxLength={40}
          onChange={(event) => setDraft({ ...draft, key: event.currentTarget.value })}
          value={draft.key}
        />
      </div>
      <div className={styles.AcademyManagement__field}>
        <Input
          id={ids.nameInputId}
          label={MANAGEMENT_COPY.displayNameLabel}
          maxLength={80}
          onChange={(event) => setDraft({ ...draft, displayName: event.currentTarget.value })}
          value={draft.displayName}
        />
      </div>
      <div className={styles.AcademyManagement__field}>
        <Textarea
          id={ids.instructionsId}
          label={MANAGEMENT_COPY.instructionsLabel}
          maxLength={1000}
          onChange={(event) => setDraft({ ...draft, instructions: event.currentTarget.value })}
          rows={3}
          value={draft.instructions}
        />
      </div>
      <div className={styles.AcademyManagement__field}>
        <Input
          id={ids.linkInputId}
          label={MANAGEMENT_COPY.linkLabel}
          onChange={(event) => setDraft({ ...draft, linkUrl: event.currentTarget.value })}
          type="url"
          value={draft.linkUrl}
        />
      </div>
      <div className={styles.AcademyManagement__switch}>
        <Switch
          checked={draft.isActive}
          id={`${ids.keyInputId}-active`}
          onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
        />
        <label htmlFor={`${ids.keyInputId}-active`}>{MANAGEMENT_COPY.activeLabel}</label>
      </div>
      <div className={styles.AcademyManagement__actions}>
        <Button aria-busy={isSaving || undefined} disabled={isSaving} type="submit">
          {isSaving ? MANAGEMENT_COPY.saving : MANAGEMENT_COPY.save}
        </Button>
        <Button disabled={isSaving} onClick={() => setDraft(null)} type="button" variant="secondary">
          {MANAGEMENT_COPY.cancel}
        </Button>
      </div>
      <ErrorMessage message={errorMessage} />
    </form>
  );
}

/**
 * Runs `work` unless another run is in flight, marking the control busy
 * meanwhile. The ref blocks a second submit before the disabled state renders.
 */
async function runExclusive(
  busyRef: RefObject<boolean>,
  setBusy: (isBusy: boolean) => void,
  work: () => Promise<void>
): Promise<void> {
  if (busyRef.current) {
    return;
  }

  busyRef.current = true;
  setBusy(true);

  try {
    await work();
  } finally {
    busyRef.current = false;
    setBusy(false);
  }
}

/** Section title, "Nuevo proveedor" and the section explanation. */
function ProvidersHeader({ isEditing, onCreate, sectionId }: { isEditing: boolean; onCreate: () => void; sectionId: string }) {
  return (
    <>
      <div className={styles.AcademyManagement__sectionHeader}>
        <h2 className={styles.AcademyManagement__sectionTitle} id={sectionId}>
          {MANAGEMENT_COPY.providersTitle}
        </h2>
        <Button disabled={isEditing} onClick={onCreate} size="sm" type="button" variant="secondary">
          <PlusIcon aria-hidden />
          {MANAGEMENT_COPY.newProvider}
        </Button>
      </div>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.providersDescription}</p>
    </>
  );
}

function ProvidersSection({
  initialProviders,
  tribeSlug,
}: {
  initialProviders: VerificationProviderDto[];
  tribeSlug: string;
}) {
  const sectionId = useId();
  const [providers, setProviders] = useState(initialProviders);
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const keyInputId = useId();
  const nameInputId = useId();
  const instructionsId = useId();
  const linkInputId = useId();

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft) {
      return;
    }

    await runExclusive(isSavingRef, setIsSaving, async () => {
      setErrorMessage(null);
      const result = await saveVerificationProvider(tribeSlug, draft.id, {
        displayName: draft.displayName,
        instructions: draft.instructions,
        isActive: draft.isActive,
        key: draft.key,
        linkUrl: draft.linkUrl,
      });

      if (!result.isSuccess) {
        setErrorMessage(result.message);

        return;
      }

      setProviders((current) => [
        ...current.filter((provider) => provider.id !== result.data.id),
        result.data,
      ]);
      setDraft(null);
      toast.success(MANAGEMENT_COPY.providerSaved);
    });
  };

  return (
    <section aria-labelledby={sectionId} className={styles.AcademyManagement__section}>
      <ProvidersHeader isEditing={draft !== null} onCreate={() => setDraft(EMPTY_PROVIDER)} sectionId={sectionId} />
      {providers.length === 0 ? (
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.emptyProviders}</p>
      ) : (
        <ul className={styles.AcademyManagement__rows}>
          {providers.map((provider) => (
            <ProviderRow
              isEditing={draft !== null}
              key={provider.id}
              onEdit={() => setDraft(toProviderDraft(provider))}
              provider={provider}
            />
          ))}
        </ul>
      )}
      {draft ? (
        <ProviderDraftForm
          draft={draft}
          errorMessage={errorMessage}
          ids={{ instructionsId, keyInputId, linkInputId, nameInputId }}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          setDraft={setDraft}
        />
      ) : null}
    </section>
  );
}

function Pagination({
  onPageChange,
  page,
  total,
}: {
  onPageChange: (page: number) => void;
  page: number;
  total: number;
}) {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (lastPage === 1) {
    return null;
  }

  return (
    <div className={styles.AcademyManagement__pagination}>
      <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button" variant="secondary">
        {MANAGEMENT_COPY.previous}
      </Button>
      <span className={styles.AcademyManagement__hint}>{`${page} / ${lastPage}`}</span>
      <Button disabled={page >= lastPage} onClick={() => onPageChange(page + 1)} type="button" variant="secondary">
        {MANAGEMENT_COPY.next}
      </Button>
    </div>
  );
}

type QueueQuery = { page: number; search: string; status: string };

/** Last page of a list with `total` items, never below the first one. */
function getLastPage(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/**
 * Review queue state. The server already loaded the initial query; only a
 * different query fetches (StrictMode-safe: re-running the effect for the
 * same query is a no-op). A decision that empties a row also refills the
 * page, so the key includes an explicit reload.
 */
function useReviewQueue(initialQueue: QueuePage, tribeSlug: string) {
  const [queue, setQueue] = useState(initialQueue);
  const [status, setStatus] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<QueueQuery>({ page: initialQueue.page, search: "", status: "pending" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const queryKey = JSON.stringify({ query, reloadToken });
  const loadedQueryKeyRef = useRef(queryKey);
  const [loadingQueryKey, setLoadingQueryKey] = useState<string | null>(null);

  useEffect(() => {
    if (queryKey === loadedQueryKeyRef.current) {
      return undefined;
    }

    const controller = new AbortController();

    // Deferred so the loading line never flashes from inside the effect body.
    const showLoading = window.setTimeout(() => setLoadingQueryKey(queryKey), 0);

    void fetchVerificationReviewQueue(tribeSlug, query, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      window.clearTimeout(showLoading);
      setLoadingQueryKey(null);

      if (!result.isSuccess) {
        setErrorMessage(result.message);

        return;
      }

      // Overlapping decisions can ask for a page that no longer exists; the server's total says which one does.
      if (result.data.items.length === 0 && query.page > getLastPage(result.data.total)) {
        setQuery((current) => ({ ...current, page: getLastPage(result.data.total) }));

        return;
      }

      loadedQueryKeyRef.current = queryKey;
      setQueue({ items: result.data.items, page: result.data.page, total: result.data.total });
      setErrorMessage(null);
    });

    return () => {
      window.clearTimeout(showLoading);
      controller.abort();
    };
  }, [query, queryKey, tribeSlug]);

  return {
    errorMessage, isLoading: loadingQueryKey === queryKey, query, queue, search, setQuery, setQueue,
    setReloadToken, setSearch, setStatus, status,
  };
}

type ReviewQueueState = ReturnType<typeof useReviewQueue>;

/** Row updates after a conflict or a saved decision. */
function createQueueItemActions({ query, queue, setQuery, setQueue, setReloadToken }: ReviewQueueState) {
  const replaceItem = (item: ReviewQueueItemDto) =>
    setQueue((current) => ({
      ...current,
      items: current.items.map((currentItem) => (currentItem.id === item.id ? item : currentItem)),
    }));

  /**
   * An item the leader just decided leaves a status filter it no longer matches, instead of staying under «pendientes».
   * The page is then read again (the previous one when it no longer exists), so the next request moves up and the
   * pagination stays reachable.
   */
  const settleDecidedItem = (item: ReviewQueueItemDto) => {
    if (!query.status || item.status === query.status) {
      replaceItem(item);

      return;
    }

    const remaining = Math.max(0, queue.total - 1), lastPage = getLastPage(remaining);
    setQueue((current) => ({ ...current, items: current.items.filter((currentItem) => currentItem.id !== item.id), total: remaining }));
    setQuery((current) => ({ ...current, page: Math.min(current.page, lastPage) }));
    setReloadToken((token) => token + 1);
  };

  return { replaceItem, settleDecidedItem };
}

function ReviewQueueSection({ initialQueue, tribeSlug }: { initialQueue: QueuePage; tribeSlug: string }) {
  const sectionId = useId();
  const searchId = useId();
  const state = useReviewQueue(initialQueue, tribeSlug);
  const { isLoading, queue, search, setQuery, status } = state;
  const { replaceItem, settleDecidedItem } = createQueueItemActions(state);

  return (
    <section aria-labelledby={sectionId} className={styles.AcademyManagement__section}>
      <h2 className={styles.AcademyManagement__sectionTitle} id={sectionId}>
        {MANAGEMENT_COPY.queueTitle}
      </h2>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.queueDescription}</p>
      <ListSearchForm
        onSearch={() => setQuery({ page: 1, search, status: status === ALL_STATUSES_VALUE ? "" : status })}
        search={search}
        searchId={searchId}
        setSearch={state.setSearch}
      >
        <Select
          className={styles.AcademyManagement__filterStatus}
          label={MANAGEMENT_COPY.statusFilterLabel}
          onValueChange={state.setStatus}
          options={QUEUE_STATUS_OPTIONS}
          value={status}
        />
      </ListSearchForm>
      <ListStatus errorMessage={state.errorMessage} isLoading={isLoading} />
      {queue.items.length === 0 ? (
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.emptyQueue}</p>
      ) : (
        <ul aria-busy={isLoading || undefined} className={styles.AcademyManagement__rows}>
          {queue.items.map((item) => (
            <ReviewQueueRow item={item} key={item.id} onItemChange={replaceItem} onItemDecided={settleDecidedItem} tribeSlug={tribeSlug} />
          ))}
        </ul>
      )}
      <Pagination
        onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
        page={queue.page}
        total={queue.total}
      />
    </section>
  );
}

/** Member, provider, declared email and the last decision reason of a request. */
function ReviewItemSummary({ item }: { item: ReviewQueueItemDto }) {
  return (
    <span className={styles.AcademyManagement__rowMain}>
      <span className={styles.AcademyManagement__rowTitle}>
        <strong>{item.memberDisplayName}</strong>
        <Badge tone={item.status === "verified" ? "info" : "neutral"}>
          {QUEUE_STATUS_LABEL[item.status]}
        </Badge>
      </span>
      <span className={styles.AcademyManagement__meta}>
        {[item.providerDisplayName, item.declaredEmail].filter(Boolean).join(" · ")}
      </span>
      {item.decisionReason ? (
        <span className={styles.AcademyManagement__hint}>{item.decisionReason}</span>
      ) : null}
    </span>
  );
}

type ReviewDecisionFormProps = {
  isSubmitting: boolean;
  onDecide: (decision: "rejected" | "verified") => void;
  reason: string;
  reasonId: string;
  setReason: (reason: string) => void;
};

/** Optional reason plus "Verificar" and "Rechazar" of a pending request. */
function ReviewDecisionForm({ isSubmitting, onDecide, reason, reasonId, setReason }: ReviewDecisionFormProps) {
  return (
    <div className={styles.AcademyManagement__decision}>
      <Input
        id={reasonId}
        label={MANAGEMENT_COPY.decisionReasonLabel}
        maxLength={500}
        onChange={(event) => setReason(event.currentTarget.value)}
        placeholder={MANAGEMENT_COPY.reasonPlaceholder}
        value={reason}
      />
      <div className={styles.AcademyManagement__actions}>
        <Button disabled={isSubmitting} onClick={() => onDecide("verified")} size="sm" type="button">
          {MANAGEMENT_COPY.verify}
        </Button>
        <Button disabled={isSubmitting} onClick={() => onDecide("rejected")} size="sm" type="button" variant="secondary">
          {MANAGEMENT_COPY.reject}
        </Button>
      </div>
    </div>
  );
}

type ReviewQueueRowProps = {
  item: ReviewQueueItemDto;
  /** A newer state seen in a conflict: the row stays, with its feedback. */
  onItemChange: (item: ReviewQueueItemDto) => void;
  /** The leader's own decision was saved. */
  onItemDecided: (item: ReviewQueueItemDto) => void;
  tribeSlug: string;
};

/** Feedback of one row, announced as an alert. */
function RowFeedback({ message }: { message: string | null }) {
  return message ? (
    <p className={styles.AcademyManagement__rowError} role="alert">
      {message}
    </p>
  ) : null;
}

function ReviewQueueRow({ item, onItemChange, onItemDecided, tribeSlug }: ReviewQueueRowProps) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const isSubmittingRef = useRef(false);

  const decide = async (decision: "rejected" | "verified") => {
    if (isSubmittingRef.current) {
      return;
    }

    if (decision === "rejected" && reason.trim().length < MIN_REASON_LENGTH) {
      setFeedback(MANAGEMENT_COPY.decisionReasonRequired);

      return;
    }

    await runExclusive(isSubmittingRef, setIsSubmitting, async () => {
      setFeedback(null);
      const result = await decideMemberVerification(tribeSlug, item.id, {
        decision,
        expectedVersion: item.version,
        reason,
      });

      if (result.isSuccess) {
        onItemDecided(result.data);
        setReason("");
        toast.success(QUEUE_STATUS_LABEL[result.data.status]);

        return;
      }

      if (result.conflictData) {
        onItemChange(result.conflictData);
      }

      setFeedback(result.status === HTTP_STATUS_CONFLICT ? MANAGEMENT_COPY.conflict : result.message);
    });
  };

  return (
    <li className={styles.AcademyManagement__row}>
      <ReviewItemSummary item={item} />
      {item.status === "pending" ? (
        <ReviewDecisionForm
          isSubmitting={isSubmitting}
          onDecide={(decision) => {
            void decide(decision);
          }}
          reason={reason}
          reasonId={reasonId}
          setReason={setReason}
        />
      ) : null}
      {item.status === "verified" ? (
        <div className={styles.AcademyManagement__actions}>
          <Button onClick={() => setIsRevokeDialogOpen(true)} size="sm" type="button" variant="secondary">
            {MANAGEMENT_COPY.revoke}
          </Button>
        </div>
      ) : null}
      <RowFeedback message={feedback} />
      {isRevokeDialogOpen ? (
        <RevokeVerificationDialog
          item={item}
          onClose={() => setIsRevokeDialogOpen(false)}
          onItemChange={onItemChange}
          onRevoked={onItemDecided}
          tribeSlug={tribeSlug}
        />
      ) : null}
    </li>
  );
}

/**
 * State of a dialog that asks for a reason and submits it exactly once.
 *
 * @returns Field ids, the reason, submit state and a submit handler factory.
 */
function useReasonDialogState() {
  const reasonId = useId();
  const formId = useId();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const reasonReady = reason.trim().length >= MIN_REASON_LENGTH;

  /** Submits once a long enough reason is typed; `work` receives it trimmed and reports its own failures. */
  const createSubmitHandler =
    (work: (trimmedReason: string) => Promise<void>) => async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!reasonReady) {
        return;
      }

      await runExclusive(isSubmittingRef, setIsSubmitting, async () => {
        setErrorMessage(null);
        await work(reason.trim());
      });
    };

  return {
    createSubmitHandler,
    errorMessage,
    formId,
    isSubmitting,
    isSubmittingRef,
    reason,
    reasonId,
    reasonReady,
    setErrorMessage,
    setReason,
  };
}

type ReasonDialogState = ReturnType<typeof useReasonDialogState>;

type ReasonDialogProps = {
  description: string;
  onClose: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  prompt: string;
  state: ReasonDialogState;
  submitLabel: string;
  title: string;
};

/** Accessible dialog that keeps the reason while it saves and shows failures inside it. */
function ReasonDialog({ description, onClose, onSubmit, prompt, state, submitLabel, title }: ReasonDialogProps) {
  const { formId, isSubmitting } = state;

  return (
    <Dialog onOpenChange={(open) => (open || state.isSubmittingRef.current ? undefined : onClose())} open>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <Button disabled={isSubmitting} onClick={onClose} type="button" variant="secondary">
              {MANAGEMENT_COPY.cancel}
            </Button>
            <Button
              aria-busy={isSubmitting || undefined}
              disabled={isSubmitting || !state.reasonReady}
              form={formId}
              type="submit"
              variant="danger"
            >
              {isSubmitting ? MANAGEMENT_COPY.revoking : submitLabel}
            </Button>
          </>
        }
      >
        <form className={styles.AcademyManagement__form} id={formId} noValidate onSubmit={onSubmit}>
          <div className={styles.AcademyManagement__field}>
            <Input
              id={state.reasonId}
              label={prompt}
              maxLength={500}
              onChange={(event) => state.setReason(event.currentTarget.value)}
              required
              value={state.reason}
            />
          </div>
          <ErrorMessage message={state.errorMessage} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks for the reason in an accessible dialog and revokes one approved verification exactly once. The row only
 * changes when the server confirms the revocation; a newer state seen in a conflict replaces the row and the dialog
 * explains it.
 *
 * @param props - The verified request, the route scope and what to do after closing, revoking or seeing a conflict.
 * @returns A dialog that keeps the reason while it saves, blocks a second submit and shows failures inside it.
 */
function RevokeVerificationDialog({
  item,
  onClose,
  onItemChange,
  onRevoked,
  tribeSlug,
}: {
  item: ReviewQueueItemDto;
  onClose: () => void;
  onItemChange: (item: ReviewQueueItemDto) => void;
  onRevoked: (item: ReviewQueueItemDto) => void;
  tribeSlug: string;
}) {
  const state = useReasonDialogState();

  const handleSubmit = state.createSubmitHandler(async (reason) => {
    const result = await decideMemberVerification(tribeSlug, item.id, {
      decision: "revoked",
      expectedVersion: item.version,
      reason,
    });

    if (!result.isSuccess) {
      if (result.conflictData) {
        onItemChange(result.conflictData);
      }

      state.setErrorMessage(result.status === HTTP_STATUS_CONFLICT ? MANAGEMENT_COPY.conflict : result.message);

      return;
    }

    toast.success(MANAGEMENT_COPY.verificationRevoked);
    onClose();
    onRevoked(result.data);
  });

  return (
    <ReasonDialog
      description={`${item.memberDisplayName} · ${item.providerDisplayName}. ${MANAGEMENT_COPY.revokeVerificationDescription}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      prompt={MANAGEMENT_COPY.revokeVerificationPrompt}
      state={state}
      submitLabel={MANAGEMENT_COPY.revokeVerificationSubmit}
      title={MANAGEMENT_COPY.revokeVerificationTitle}
    />
  );
}

type AcademyGrantDto = AcademyMemberRowDto["grants"][number];

const GRANT_SOURCE_LABEL: Partial<Record<AcademyGrantDto["sourceType"], string>> = {
  manual_bonus: MANAGEMENT_COPY.grantBonus,
  subscription_payment: MANAGEMENT_COPY.grantPaid,
};

/**
 * Short label of the grant origin (bonus, payment or legacy).
 *
 * @param grant - Access grant of a member.
 * @returns Spanish label.
 */
function describeGrantSource(grant: AcademyGrantDto): string {
  return GRANT_SOURCE_LABEL[grant.sourceType] ?? MANAGEMENT_COPY.grantLegacy;
}

/**
 * Coverage range of a grant, marking it when it was revoked.
 *
 * @param grant - Access grant of a member.
 * @returns Spanish range text.
 */
function describeGrantRange(grant: AcademyGrantDto): string {
  const range = grant.endsAt
    ? `${MANAGEMENT_COPY.grantUntil} ${formatAcademyDate(grant.endsAt)}`
    : MANAGEMENT_COPY.grantUnbounded;

  return `${range}${grant.revokedAt ? ` (${MANAGEMENT_COPY.grantRevoked})` : ""}`;
}

type MembersQuery = { page: number; search: string };

type RevokingGrant = { grant: AcademyGrantDto; memberName: string };

/**
 * Members list state. The server already loaded the initial query; only a
 * different query or an explicit reload after a bonus change fetches
 * (StrictMode-safe: re-running the effect for the same key is a no-op).
 */
function useMembersList(initialMembers: AcademyMembersPageDto, tribeSlug: string) {
  const [membersPage, setMembersPage] = useState(initialMembers);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<MembersQuery>({ page: initialMembers.page, search: "" });
  const [bonusRecipient, setBonusRecipient] = useState<AcademyMemberRowDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [revokingGrant, setRevokingGrant] = useState<RevokingGrant | null>(null);
  const loadKey = JSON.stringify({ query, reloadToken });
  const loadedKeyRef = useRef(loadKey);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (loadKey === loadedKeyRef.current) {
      return undefined;
    }

    const controller = new AbortController();

    // Deferred so the loading line never flashes from inside the effect body.
    const showLoading = window.setTimeout(() => setLoadingKey(loadKey), 0);

    void fetchAcademyMembers(tribeSlug, query, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      window.clearTimeout(showLoading);
      setLoadingKey(null);

      if (result.isSuccess) {
        loadedKeyRef.current = loadKey;
        setMembersPage(result.data);
        setErrorMessage(null);
      } else {
        setErrorMessage(result.message);
      }
    });

    return () => {
      window.clearTimeout(showLoading);
      controller.abort();
    };
  }, [loadKey, query, tribeSlug]);

  return {
    bonusRecipient, errorMessage, isLoading: loadingKey === loadKey, membersPage, revokingGrant, search,
    setBonusRecipient, setQuery, setReloadToken, setRevokingGrant, setSearch,
  };
}

/** Grants of a member, with "Revocar" on an active manual bonus. */
function MemberGrants({ grants, onRevoke }: { grants: AcademyGrantDto[]; onRevoke: (grant: AcademyGrantDto) => void }) {
  return (
    <ul className={styles.AcademyManagement__grants}>
      {grants.map((grant) => (
        <li className={styles.AcademyManagement__grant} key={grant.id}>
          <span className={styles.AcademyManagement__grantText}>
            <span className={styles.AcademyManagement__grantSource}>{describeGrantSource(grant)}</span>
            <span>{describeGrantRange(grant)}</span>
            {grant.note ? <span className={styles.AcademyManagement__hint}>{grant.note}</span> : null}
          </span>
          {grant.sourceType === "manual_bonus" && !grant.revokedAt ? (
            <Button onClick={() => onRevoke(grant)} size="sm" type="button" variant="ghost">
              {MANAGEMENT_COPY.revoke}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

type MemberRowProps = {
  isLeader: boolean;
  member: AcademyMemberRowDto;
  onBonus: () => void;
  onRevokeGrant: (grant: AcademyGrantDto) => void;
};

/** One member with access badges, grants for leaders and the bonus action. */
function MemberRow({ isLeader, member, onBonus, onRevokeGrant }: MemberRowProps) {
  return (
    <li className={styles.AcademyManagement__row}>
      <span className={styles.AcademyManagement__rowMain}>
        <strong>{member.displayName}</strong>
        <span className={styles.AcademyManagement__badges}>
          <Badge tone={member.hasAcademyAccess ? "info" : "neutral"}>
            {member.hasAcademyAccess ? MANAGEMENT_COPY.accessYes : MANAGEMENT_COPY.accessNo}
          </Badge>
          <Badge>
            {member.isVerified ? MANAGEMENT_COPY.verifiedYes : MANAGEMENT_COPY.verifiedNo}
          </Badge>
          {member.renewalStatus === "active" ? (
            <Badge>{MANAGEMENT_COPY.renewalActive}</Badge>
          ) : null}
        </span>
        {isLeader && member.grants.length > 0 ? (
          <MemberGrants grants={member.grants} onRevoke={onRevokeGrant} />
        ) : null}
      </span>
      {isLeader && (member.membershipStatus === "active" || member.membershipStatus === "muted") ? (
        <Button className={styles.AcademyManagement__rowAction} onClick={onBonus} size="sm" type="button" variant="secondary">
          {MANAGEMENT_COPY.bonusButton}
        </Button>
      ) : null}
    </li>
  );
}

function MembersSection({
  initialMembers,
  isLeader,
  tribeSlug,
}: {
  initialMembers: AcademyMembersPageDto;
  isLeader: boolean;
  tribeSlug: string;
}) {
  const sectionId = useId();
  const searchId = useId();
  const list = useMembersList(initialMembers, tribeSlug);
  const { bonusRecipient, isLoading, membersPage, revokingGrant, setQuery } = list;
  const reload = () => list.setReloadToken((token) => token + 1);

  return (
    <section aria-labelledby={sectionId} className={styles.AcademyManagement__section}>
      <h2 className={styles.AcademyManagement__sectionTitle} id={sectionId}>
        {MANAGEMENT_COPY.membersTitle}
      </h2>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.membersDescription}</p>
      <ListSearchForm
        onSearch={() => setQuery({ page: 1, search: list.search })}
        search={list.search}
        searchId={searchId}
        setSearch={list.setSearch}
      />
      <ListStatus errorMessage={list.errorMessage} isLoading={isLoading} />
      {membersPage.members.length === 0 ? (
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.emptyMembers}</p>
      ) : (
        <ul aria-busy={isLoading || undefined} className={styles.AcademyManagement__rows}>
          {membersPage.members.map((member) => (
            <MemberRow
              isLeader={isLeader}
              key={member.userId}
              member={member}
              onBonus={() => list.setBonusRecipient(member)}
              onRevokeGrant={(grant) => list.setRevokingGrant({ grant, memberName: member.displayName })}
            />
          ))}
        </ul>
      )}
      <Pagination
        onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
        page={membersPage.page}
        total={membersPage.total}
      />
      {revokingGrant ? (
        <RevokeBonusDialog
          grant={revokingGrant.grant}
          memberName={revokingGrant.memberName}
          onClose={() => list.setRevokingGrant(null)}
          onRevoked={reload}
          tribeSlug={tribeSlug}
        />
      ) : null}
      {bonusRecipient ? (
        <BonusDialog
          onClose={() => list.setBonusRecipient(null)}
          onGranted={reload}
          recipient={bonusRecipient}
          tribeSlug={tribeSlug}
        />
      ) : null}
    </section>
  );
}

/**
 * Asks for the reason in an accessible dialog and revokes one manual bonus exactly once.
 *
 * @param props - The bonus, its member, the route scope and what to do after closing or revoking.
 * @returns A dialog that keeps the reason while it saves, blocks a second submit and shows failures inside it.
 */
function RevokeBonusDialog({
  grant,
  memberName,
  onClose,
  onRevoked,
  tribeSlug,
}: {
  grant: AcademyGrantDto;
  memberName: string;
  onClose: () => void;
  onRevoked: () => void;
  tribeSlug: string;
}) {
  const state = useReasonDialogState();

  const handleSubmit = state.createSubmitHandler(async (reason) => {
    const result = await revokeAcademyBonus(tribeSlug, grant.id, reason);

    if (!result.isSuccess) {
      state.setErrorMessage(result.message);

      return;
    }

    onRevoked();
    toast.success(result.data.message ?? MANAGEMENT_COPY.bonusRevoked);
    onClose();
  });

  return (
    <ReasonDialog
      description={`${memberName} · ${MANAGEMENT_COPY.revokeBonusSubject} ${describeGrantRange(grant)}. ${MANAGEMENT_COPY.revokeBonusDescription}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      prompt={MANAGEMENT_COPY.revokeBonusPrompt}
      state={state}
      submitLabel={MANAGEMENT_COPY.revokeBonusSubmit}
      title={MANAGEMENT_COPY.revokeBonusTitle}
    />
  );
}

type BonusDialogFieldsProps = {
  allowUnverified: boolean;
  endDate: string;
  ids: { endId: string; exceptionId: string; reasonId: string };
  reason: string;
  recipient: AcademyMemberRowDto;
  setAllowUnverified: (allowUnverified: boolean) => void;
  setEndDate: (endDate: string) => void;
  setReason: (reason: string) => void;
  today: string;
};

/** End date, reason and, for an unverified member, the explicit exception. */
function BonusDialogFields(props: BonusDialogFieldsProps) {
  const { ids, recipient } = props;

  return (
    <>
      {recipient.renewalStatus === "active" ? (
        <p className={styles.AcademyManagement__warning} role="status">
          {MANAGEMENT_COPY.bonusRenewalWarning}
        </p>
      ) : null}
      <div className={styles.AcademyManagement__field}>
        <Input
          id={ids.endId}
          label={MANAGEMENT_COPY.bonusEndLabel}
          min={props.today}
          onChange={(event) => props.setEndDate(event.currentTarget.value)}
          required
          type="date"
          value={props.endDate}
        />
      </div>
      <div className={styles.AcademyManagement__field}>
        <Input
          id={ids.reasonId}
          label={MANAGEMENT_COPY.bonusReasonLabel}
          maxLength={500}
          onChange={(event) => props.setReason(event.currentTarget.value)}
          required
          value={props.reason}
        />
      </div>
      {!recipient.isVerified ? (
        <div className={styles.AcademyManagement__switch}>
          <Checkbox
            checked={props.allowUnverified}
            id={ids.exceptionId}
            onCheckedChange={(checked) => props.setAllowUnverified(checked === true)}
          />
          <label htmlFor={ids.exceptionId}>{MANAGEMENT_COPY.bonusException}</label>
        </div>
      ) : null}
    </>
  );
}

type BonusDialogFooterProps = {
  canSubmit: boolean;
  formId: string;
  isSubmitting: boolean;
  onClose: () => void;
};

/** Cancel and grant buttons of the bonus dialog. */
function BonusDialogFooter({ canSubmit, formId, isSubmitting, onClose }: BonusDialogFooterProps) {
  return (
    <>
      <Button disabled={isSubmitting} onClick={onClose} type="button" variant="secondary">
        {MANAGEMENT_COPY.cancel}
      </Button>
      <Button
        aria-busy={isSubmitting || undefined}
        disabled={isSubmitting || !canSubmit}
        form={formId}
        type="submit"
      >
        {isSubmitting ? MANAGEMENT_COPY.saving : MANAGEMENT_COPY.bonusSubmit}
      </Button>
    </>
  );
}

/** Field ids, values and submit state of the bonus dialog. */
function useBonusDialogState() {
  const endId = useId();
  const reasonId = useId();
  const exceptionId = useId();
  const formId = useId();
  // One key per dialog opening: a double click or a retry replays the grant.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [allowUnverified, setAllowUnverified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const isSubmittingRef = useRef(false);

  return {
    allowUnverified, endDate, endId, exceptionId, feedback, formId, idempotencyKey, isSubmitting, isSubmittingRef,
    reason, reasonId, setAllowUnverified, setEndDate, setFeedback, setIsSubmitting, setReason,
  };
}

type BonusDialogProps = {
  onClose: () => void;
  onGranted: () => void;
  recipient: AcademyMemberRowDto;
  tribeSlug: string;
};

/** Grants a manual academy bonus once per opening, replaying the same idempotency key. */
function BonusDialog({ onClose, onGranted, recipient, tribeSlug }: BonusDialogProps) {
  const {
    allowUnverified, endDate, endId, exceptionId, feedback, formId, idempotencyKey, isSubmitting, isSubmittingRef,
    reason, reasonId, setAllowUnverified, setEndDate, setFeedback, setIsSubmitting, setReason,
  } = useBonusDialogState();
  const today = getTodayDateKey(new Date());

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    await runExclusive(isSubmittingRef, setIsSubmitting, async () => {
      setFeedback(null);
      const result = await grantAcademyBonus(tribeSlug, {
        allowUnverifiedRecipient: allowUnverified,
        endsAt: buildBonusEndsAt(endDate),
        idempotencyKey,
        reason,
        recipientUserId: recipient.userId,
      });

      if (!result.isSuccess) {
        setFeedback({ isError: true, message: result.message });

        return;
      }

      onGranted();
      toast.success(MANAGEMENT_COPY.bonusSuccess);

      if (result.data.hasActiveRenewal) {
        setFeedback({ isError: false, message: MANAGEMENT_COPY.bonusRenewalWarning });

        return;
      }

      onClose();
    });
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent
        title={MANAGEMENT_COPY.bonusDialogTitle}
        description={`${recipient.displayName}. ${MANAGEMENT_COPY.bonusDialogDescription}`}
        footer={
          <BonusDialogFooter
            canSubmit={Boolean(endDate) && reason.trim().length >= MIN_REASON_LENGTH && (recipient.isVerified || allowUnverified)}
            formId={formId}
            isSubmitting={isSubmitting}
            onClose={onClose}
          />
        }
      >
        <form className={styles.AcademyManagement__form} id={formId} noValidate onSubmit={handleSubmit}>
          <BonusDialogFields
            allowUnverified={allowUnverified}
            endDate={endDate}
            ids={{ endId, exceptionId, reasonId }}
            reason={reason}
            recipient={recipient}
            setAllowUnverified={setAllowUnverified}
            setEndDate={setEndDate}
            setReason={setReason}
            today={today}
          />
          <FeedbackMessage feedback={feedback} successClassName={styles.AcademyManagement__warning} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
