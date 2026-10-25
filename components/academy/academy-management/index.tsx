"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
  decisionReasonRequired: "Indicá un motivo para rechazar o revocar.",
  descriptionLabel: "Explicación del diferencial",
  displayNameLabel: "Nombre visible",
  emptyMembers: "No hay integrantes para mostrar.",
  emptyProviders: "Todavía no hay proveedores.",
  emptyQueue: "No hay solicitudes con esos filtros.",
  grantBonus: "Bono",
  grantLegacy: "Legado",
  grantPaid: "Pago",
  grantRevoked: "revocado",
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
  reasonPlaceholder: "Obligatorio para rechazar o revocar",
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
    <main className={styles.AcademyManagement}>
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
    </main>
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
  const [benefits, setBenefits] = useState(initialSettings.benefits.join(LINE_SEPARATOR));
  const [pending, setPending] = useState<"availability" | "offer" | null>(null);
  const [feedback, setFeedback] = useState<{ isError: boolean; message: string } | null>(null);
  const isBusyRef = useRef(false);

  const applySettings = (next: AcademySettingsDto) => {
    setSettings(next);
    setTitle(next.title);
    setDescription(next.description);
    setBenefits(next.benefits.join(LINE_SEPARATOR));
  };

  const handleOfferSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isBusyRef.current) {
      return;
    }

    isBusyRef.current = true;
    setPending("offer");
    setFeedback(null);

    try {
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
        applySettings(result.conflictData);
      }

      setFeedback({ isError: true, message: result.message });
    } finally {
      isBusyRef.current = false;
      setPending(null);
    }
  };

  const toggleAvailability = async (change: { admissionEnabled?: boolean; salesEnabled?: boolean }) => {
    if (isBusyRef.current) {
      return;
    }

    isBusyRef.current = true;
    setPending("availability");
    setFeedback(null);

    try {
      const result = await setAcademyAvailability(tribeSlug, {
        admissionEnabled: change.admissionEnabled ?? settings.admissionEnabled,
        expectedConfigVersion: settings.configVersion,
        salesEnabled: change.salesEnabled ?? settings.salesEnabled,
      });

      if (result.isSuccess) {
        applySettings(result.data);
        toast.success(MANAGEMENT_COPY.settingsSaved);

        return;
      }

      if (result.conflictData) {
        applySettings(result.conflictData);
      }

      setFeedback({ isError: true, message: result.message });
    } finally {
      isBusyRef.current = false;
      setPending(null);
    }
  };

  const isAcademyMode = settings.accessModel === "academy";

  return (
    <section
      aria-labelledby={`${titleId}-section`}
      className={`${styles.AcademyManagement__section} ${styles["AcademyManagement__section--spacious"]}`}
    >
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

      <div className={styles.AcademyManagement__group}>
        <h3 className={styles.AcademyManagement__subTitle}>{MANAGEMENT_COPY.availabilityTitle}</h3>
        <ul className={styles.AcademyManagement__toggles}>
          <AvailabilityToggle
            checked={settings.admissionEnabled}
            description={MANAGEMENT_COPY.admissionDescription}
            disabled={!isAcademyMode || pending !== null}
            label={MANAGEMENT_COPY.admissionLabel}
            onCheckedChange={(checked) => toggleAvailability({ admissionEnabled: checked })}
          />
          <AvailabilityToggle
            checked={settings.salesEnabled}
            description={MANAGEMENT_COPY.salesDescription}
            disabled={!isAcademyMode || pending !== null}
            label={MANAGEMENT_COPY.salesLabel}
            onCheckedChange={(checked) => toggleAvailability({ salesEnabled: checked })}
          />
        </ul>
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.availabilityHint}</p>
      </div>

      <form className={styles.AcademyManagement__form} noValidate onSubmit={handleOfferSubmit}>
        <div className={styles.AcademyManagement__groupHeading}>
          <h3 className={styles.AcademyManagement__subTitle}>{MANAGEMENT_COPY.offerTitle}</h3>
          <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.offerDescription}</p>
        </div>
        <div className={styles.AcademyManagement__field}>
          <Input
            id={titleId}
            label={MANAGEMENT_COPY.titleLabel}
            maxLength={120}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
            value={title}
          />
        </div>
        <div className={styles.AcademyManagement__field}>
          <Textarea
            id={descriptionId}
            label={MANAGEMENT_COPY.descriptionLabel}
            maxLength={2000}
            onChange={(event) => setDescription(event.currentTarget.value)}
            rows={4}
            value={description}
          />
        </div>
        <div className={styles.AcademyManagement__field}>
          <Textarea
            description={MANAGEMENT_COPY.benefitsHelp}
            id={benefitsId}
            label={MANAGEMENT_COPY.benefitsLabel}
            onChange={(event) => setBenefits(event.currentTarget.value)}
            rows={4}
            value={benefits}
          />
        </div>
        <div className={styles.AcademyManagement__actions}>
          <Button aria-busy={pending === "offer" || undefined} disabled={pending !== null || !title.trim()} type="submit">
            {pending === "offer" ? MANAGEMENT_COPY.saving : MANAGEMENT_COPY.save}
          </Button>
        </div>
      </form>
      {feedback ? (
        <p
          className={feedback.isError ? styles.AcademyManagement__error : styles.AcademyManagement__hint}
          role={feedback.isError ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft || isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setErrorMessage(null);

    try {
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
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <section aria-labelledby={sectionId} className={styles.AcademyManagement__section}>
      <div className={styles.AcademyManagement__sectionHeader}>
        <h2 className={styles.AcademyManagement__sectionTitle} id={sectionId}>
          {MANAGEMENT_COPY.providersTitle}
        </h2>
        <Button disabled={draft !== null} onClick={() => setDraft(EMPTY_PROVIDER)} size="sm" type="button" variant="secondary">
          <PlusIcon aria-hidden />
          {MANAGEMENT_COPY.newProvider}
        </Button>
      </div>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.providersDescription}</p>
      {providers.length === 0 ? (
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.emptyProviders}</p>
      ) : (
        <ul className={styles.AcademyManagement__rows}>
          {providers.map((provider) => (
            <li className={styles.AcademyManagement__row} key={provider.id}>
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
                disabled={draft !== null}
                onClick={() =>
                  setDraft({
                    displayName: provider.displayName,
                    id: provider.id,
                    instructions: provider.instructions,
                    isActive: provider.isActive,
                    key: provider.key,
                    linkUrl: provider.linkUrl ?? "",
                  })
                }
                type="button"
                variant="secondary"
              >
                {MANAGEMENT_COPY.edit}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <form className={styles.AcademyManagement__panel} noValidate onSubmit={handleSubmit}>
          <div className={styles.AcademyManagement__field}>
            <Input
              id={keyInputId}
              label={MANAGEMENT_COPY.keyLabel}
              maxLength={40}
              onChange={(event) => setDraft({ ...draft, key: event.currentTarget.value })}
              value={draft.key}
            />
          </div>
          <div className={styles.AcademyManagement__field}>
            <Input
              id={nameInputId}
              label={MANAGEMENT_COPY.displayNameLabel}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, displayName: event.currentTarget.value })}
              value={draft.displayName}
            />
          </div>
          <div className={styles.AcademyManagement__field}>
            <Textarea
              id={instructionsId}
              label={MANAGEMENT_COPY.instructionsLabel}
              maxLength={1000}
              onChange={(event) => setDraft({ ...draft, instructions: event.currentTarget.value })}
              rows={3}
              value={draft.instructions}
            />
          </div>
          <div className={styles.AcademyManagement__field}>
            <Input
              id={linkInputId}
              label={MANAGEMENT_COPY.linkLabel}
              onChange={(event) => setDraft({ ...draft, linkUrl: event.currentTarget.value })}
              type="url"
              value={draft.linkUrl}
            />
          </div>
          <div className={styles.AcademyManagement__switch}>
            <Switch
              checked={draft.isActive}
              id={`${keyInputId}-active`}
              onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
            />
            <label htmlFor={`${keyInputId}-active`}>{MANAGEMENT_COPY.activeLabel}</label>
          </div>
          <div className={styles.AcademyManagement__actions}>
            <Button aria-busy={isSaving || undefined} disabled={isSaving} type="submit">
              {isSaving ? MANAGEMENT_COPY.saving : MANAGEMENT_COPY.save}
            </Button>
            <Button disabled={isSaving} onClick={() => setDraft(null)} type="button" variant="secondary">
              {MANAGEMENT_COPY.cancel}
            </Button>
          </div>
          {errorMessage ? (
            <p className={styles.AcademyManagement__error} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </form>
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

function ReviewQueueSection({ initialQueue, tribeSlug }: { initialQueue: QueuePage; tribeSlug: string }) {
  const sectionId = useId();
  const searchId = useId();
  const [queue, setQueue] = useState(initialQueue);
  const [status, setStatus] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ page: initialQueue.page, search: "", status: "pending" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The server already loaded the initial query; only a different query
  // fetches (StrictMode-safe: re-running the effect for the same query is a no-op).
  const loadedQueryKeyRef = useRef(JSON.stringify(query));

  useEffect(() => {
    const queryKey = JSON.stringify(query);

    if (queryKey === loadedQueryKeyRef.current) {
      return undefined;
    }

    const controller = new AbortController();

    void fetchVerificationReviewQueue(tribeSlug, query, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      if (result.isSuccess) {
        loadedQueryKeyRef.current = queryKey;
        setQueue({ items: result.data.items, page: result.data.page, total: result.data.total });
        setErrorMessage(null);
      } else {
        setErrorMessage(result.message);
      }
    });

    return () => controller.abort();
  }, [query, tribeSlug]);

  const replaceItem = (item: ReviewQueueItemDto) =>
    setQueue((current) => ({
      ...current,
      items: current.items.map((currentItem) => (currentItem.id === item.id ? item : currentItem)),
    }));

  return (
    <section aria-labelledby={sectionId} className={styles.AcademyManagement__section}>
      <h2 className={styles.AcademyManagement__sectionTitle} id={sectionId}>
        {MANAGEMENT_COPY.queueTitle}
      </h2>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.queueDescription}</p>
      <form
        className={styles.AcademyManagement__filters}
        onSubmit={(event) => {
          event.preventDefault();
          setQuery({ page: 1, search, status: status === ALL_STATUSES_VALUE ? "" : status });
        }}
        role="search"
      >
        <Select
          className={styles.AcademyManagement__filterStatus}
          label={MANAGEMENT_COPY.statusFilterLabel}
          onValueChange={setStatus}
          options={QUEUE_STATUS_OPTIONS}
          value={status}
        />
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
      {errorMessage ? (
        <p className={styles.AcademyManagement__error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      {queue.items.length === 0 ? (
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.emptyQueue}</p>
      ) : (
        <ul className={styles.AcademyManagement__rows}>
          {queue.items.map((item) => (
            <ReviewQueueRow item={item} key={item.id} onItemChange={replaceItem} tribeSlug={tribeSlug} />
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

function ReviewQueueRow({
  item,
  onItemChange,
  tribeSlug,
}: {
  item: ReviewQueueItemDto;
  onItemChange: (item: ReviewQueueItemDto) => void;
  tribeSlug: string;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const decide = async (decision: "rejected" | "revoked" | "verified") => {
    if (isSubmittingRef.current) {
      return;
    }

    if (decision !== "verified" && reason.trim().length < MIN_REASON_LENGTH) {
      setFeedback(MANAGEMENT_COPY.decisionReasonRequired);

      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await decideMemberVerification(tribeSlug, item.id, {
        decision,
        expectedVersion: item.version,
        reason,
      });

      if (result.isSuccess) {
        onItemChange(result.data);
        setReason("");
        toast.success(QUEUE_STATUS_LABEL[result.data.status]);

        return;
      }

      if (result.conflictData) {
        onItemChange(result.conflictData);
      }

      setFeedback(result.status === HTTP_STATUS_CONFLICT ? MANAGEMENT_COPY.conflict : result.message);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <li className={styles.AcademyManagement__row}>
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
      {item.status === "pending" || item.status === "verified" ? (
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
            {item.status === "pending" ? (
              <>
                <Button disabled={isSubmitting} onClick={() => decide("verified")} size="sm" type="button">
                  {MANAGEMENT_COPY.verify}
                </Button>
                <Button disabled={isSubmitting} onClick={() => decide("rejected")} size="sm" type="button" variant="secondary">
                  {MANAGEMENT_COPY.reject}
                </Button>
              </>
            ) : (
              <Button disabled={isSubmitting} onClick={() => decide("revoked")} size="sm" type="button" variant="secondary">
                {MANAGEMENT_COPY.revoke}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {feedback ? (
        <p className={styles.AcademyManagement__rowError} role="alert">
          {feedback}
        </p>
      ) : null}
    </li>
  );
}

type AcademyGrantDto = AcademyMemberRowDto["grants"][number];

/**
 * Short label of the grant origin (bonus, payment or legacy).
 *
 * @param grant - Access grant of a member.
 * @returns Spanish label.
 */
function describeGrantSource(grant: AcademyGrantDto): string {
  return grant.sourceType === "manual_bonus"
    ? MANAGEMENT_COPY.grantBonus
    : grant.sourceType === "subscription_payment"
      ? MANAGEMENT_COPY.grantPaid
      : MANAGEMENT_COPY.grantLegacy;
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
  const [membersPage, setMembersPage] = useState(initialMembers);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ page: initialMembers.page, search: "" });
  const [bonusRecipient, setBonusRecipient] = useState<AcademyMemberRowDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // The server already loaded the initial query; only a different query
  // fetches (StrictMode-safe: re-running the effect for the same query is a no-op).
  const loadedQueryKeyRef = useRef(JSON.stringify(query));

  useEffect(() => {
    const queryKey = JSON.stringify(query);

    if (queryKey === loadedQueryKeyRef.current) {
      return undefined;
    }

    const controller = new AbortController();

    void fetchAcademyMembers(tribeSlug, query, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      if (result.isSuccess) {
        loadedQueryKeyRef.current = queryKey;
        setMembersPage(result.data);
        setErrorMessage(null);
      } else {
        setErrorMessage(result.message);
      }
    });

    return () => controller.abort();
  }, [query, reloadToken, tribeSlug]);

  const handleRevoke = async (grantId: string) => {
    const reason = window.prompt(MANAGEMENT_COPY.revokeBonusPrompt);

    if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
      return;
    }

    const result = await revokeAcademyBonus(tribeSlug, grantId, reason.trim());

    if (!result.isSuccess) {
      setErrorMessage(result.message);

      return;
    }

    toast.success(result.data.message ?? MANAGEMENT_COPY.grantRevoked);
    setReloadToken((token) => token + 1);
  };

  return (
    <section aria-labelledby={sectionId} className={styles.AcademyManagement__section}>
      <h2 className={styles.AcademyManagement__sectionTitle} id={sectionId}>
        {MANAGEMENT_COPY.membersTitle}
      </h2>
      <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.membersDescription}</p>
      <form
        className={styles.AcademyManagement__filters}
        onSubmit={(event) => {
          event.preventDefault();
          setQuery({ page: 1, search });
        }}
        role="search"
      >
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
      {errorMessage ? (
        <p className={styles.AcademyManagement__error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      {membersPage.members.length === 0 ? (
        <p className={styles.AcademyManagement__hint}>{MANAGEMENT_COPY.emptyMembers}</p>
      ) : (
        <ul className={styles.AcademyManagement__rows}>
          {membersPage.members.map((member) => (
            <li className={styles.AcademyManagement__row} key={member.userId}>
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
                  <ul className={styles.AcademyManagement__grants}>
                    {member.grants.map((grant) => (
                      <li className={styles.AcademyManagement__grant} key={grant.id}>
                        <span className={styles.AcademyManagement__grantText}>
                          <span className={styles.AcademyManagement__grantSource}>{describeGrantSource(grant)}</span>
                          <span>{describeGrantRange(grant)}</span>
                          {grant.note ? <span className={styles.AcademyManagement__hint}>{grant.note}</span> : null}
                        </span>
                        {grant.sourceType === "manual_bonus" && !grant.revokedAt ? (
                          <Button onClick={() => handleRevoke(grant.id)} size="sm" type="button" variant="ghost">
                            {MANAGEMENT_COPY.revoke}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </span>
              {isLeader && (member.membershipStatus === "active" || member.membershipStatus === "muted") ? (
                <Button className={styles.AcademyManagement__rowAction} onClick={() => setBonusRecipient(member)} size="sm" type="button" variant="secondary">
                  {MANAGEMENT_COPY.bonusButton}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination
        onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
        page={membersPage.page}
        total={membersPage.total}
      />
      {bonusRecipient ? (
        <BonusDialog
          onClose={() => setBonusRecipient(null)}
          onGranted={() => setReloadToken((token) => token + 1)}
          recipient={bonusRecipient}
          tribeSlug={tribeSlug}
        />
      ) : null}
    </section>
  );
}

function BonusDialog({
  onClose,
  onGranted,
  recipient,
  tribeSlug,
}: {
  onClose: () => void;
  onGranted: () => void;
  recipient: AcademyMemberRowDto;
  tribeSlug: string;
}) {
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
  const [feedback, setFeedback] = useState<{ isError: boolean; message: string } | null>(null);
  const isSubmittingRef = useRef(false);
  const today = getTodayDateKey(new Date());

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFeedback(null);

    try {
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
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent
        title={MANAGEMENT_COPY.bonusDialogTitle}
        description={`${recipient.displayName}. ${MANAGEMENT_COPY.bonusDialogDescription}`}
        footer={
          <>
            <Button disabled={isSubmitting} onClick={onClose} type="button" variant="secondary">
              {MANAGEMENT_COPY.cancel}
            </Button>
            <Button
              aria-busy={isSubmitting || undefined}
              disabled={
                isSubmitting ||
                !endDate ||
                reason.trim().length < MIN_REASON_LENGTH ||
                (!recipient.isVerified && !allowUnverified)
              }
              form={formId}
              type="submit"
            >
              {isSubmitting ? MANAGEMENT_COPY.saving : MANAGEMENT_COPY.bonusSubmit}
            </Button>
          </>
        }
      >
        <form className={styles.AcademyManagement__form} id={formId} noValidate onSubmit={handleSubmit}>
          {recipient.renewalStatus === "active" ? (
            <p className={styles.AcademyManagement__warning} role="status">
              {MANAGEMENT_COPY.bonusRenewalWarning}
            </p>
          ) : null}
          <div className={styles.AcademyManagement__field}>
            <Input
              id={endId}
              label={MANAGEMENT_COPY.bonusEndLabel}
              min={today}
              onChange={(event) => setEndDate(event.currentTarget.value)}
              required
              type="date"
              value={endDate}
            />
          </div>
          <div className={styles.AcademyManagement__field}>
            <Input
              id={reasonId}
              label={MANAGEMENT_COPY.bonusReasonLabel}
              maxLength={500}
              onChange={(event) => setReason(event.currentTarget.value)}
              required
              value={reason}
            />
          </div>
          {!recipient.isVerified ? (
            <div className={styles.AcademyManagement__switch}>
              <Checkbox
                checked={allowUnverified}
                id={exceptionId}
                onCheckedChange={(checked) => setAllowUnverified(checked === true)}
              />
              <label htmlFor={exceptionId}>{MANAGEMENT_COPY.bonusException}</label>
            </div>
          ) : null}
          {feedback ? (
            <p
              className={feedback.isError ? styles.AcademyManagement__error : styles.AcademyManagement__warning}
              role={feedback.isError ? "alert" : "status"}
            >
              {feedback.message}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
