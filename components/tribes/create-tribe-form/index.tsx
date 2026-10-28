"use client";

import { useEffect, useId, useRef, useState, type RefObject, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { CheckCircle2Icon, PencilLineIcon } from "lucide-react";

import { Button, Input, AnimatedCollapse, PresenceSwap, cn } from "@golfo/ui";

import {
  CREATE_TRIBE_FORM_ERROR_FIELD,
  CREATE_TRIBE_FORM_SUBMIT_STATUS,
  type CreateTribeFormErrorField,
  type CreateTribeFormSubmitOutcome,
  type CreateTribeFormValues,
} from "@/lib/tribes/create-tribe-form-feedback";
import { normalizeTribeSlug } from "@/src/modules/tribes/domain/value-objects/tribe-slug";
import styles from "./styles.module.scss";

const TRIBE_SLUG_NORMALIZATION_FORM = "NFD";
const TRIBE_SLUG_PREVIEW_FALLBACK = "tu-tribu";
const TRIBE_SLUG_TRAILING_SEPARATOR = "-";
const CREATE_TRIBE_FORM_ARIA = {
  livePolite: "polite",
} as const;
const CREATE_TRIBE_FORM_BUTTON = {
  secondaryVariant: "secondary",
  smallSize: "sm",
  submitType: "submit",
} as const;
const CREATE_TRIBE_FORM_FIELD = {
  hiddenType: "hidden",
  method: "post",
  name: "name",
  slug: "slug",
} as const;
const CREATE_TRIBE_FORM_INTERACTION = {
  buttonType: "button",
} as const;

/** Presence keys for the synced/edited slug status pill. */
const SLUG_STATUS_KEY = {
  edited: "edited",
  synced: "synced",
} as const;

/** Browser event fired when a page is shown, including restores from the back-forward cache. */
const PAGE_SHOW_EVENT = "pageshow";

/** Inline feedback of the last failed submission. */
type CreateTribeFormFeedback = {
  field: CreateTribeFormErrorField | null;
  message: string;
  suggestedSlug: string | null;
};

export type CreateTribeFormProps = {
  /** Field that owns the server-rendered error (`null` for form-level errors). */
  errorField?: CreateTribeFormErrorField | null;
  errorMessage?: string | null;
  initialName?: string;
  initialSlug?: string;
  /**
   * Enhanced submission. When present, the form submits through it instead of
   * the native post and shows a failed outcome inline without navigating.
   * The returned promise must resolve (never reject). Without it (or before
   * hydration) the native form post and its redirect flow are used.
   */
  onSubmitTribe?: (
    values: CreateTribeFormValues
  ) => Promise<CreateTribeFormSubmitOutcome>;
  submitPath: string;
  suggestedSlug?: string | null;
};

function normalizeTribeSlugDraft(input: string): string {
  const normalizedSlug = normalizeTribeSlug(input);
  const hasTrailingSeparator = /[^a-z0-9]$/i.test(
    input.normalize(TRIBE_SLUG_NORMALIZATION_FORM).replace(/[\u0300-\u036f]/g, "")
  );

  if (hasTrailingSeparator && normalizedSlug.length > 0) {
    return normalizedSlug + TRIBE_SLUG_TRAILING_SEPARATOR;
  }

  return normalizedSlug;
}

/**
 * Re-enables the submit button when a back navigation restores the page from
 * the bfcache with the button still disabled, so the form stays usable.
 * @param isSubmittingRef - Synchronous submit guard.
 * @param setIsSubmitting - Setter of the rendered submitting state.
 */
function useResetSubmitOnPageShow(
  isSubmittingRef: RefObject<boolean>,
  setIsSubmitting: (isSubmitting: boolean) => void
) {
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    };

    window.addEventListener(PAGE_SHOW_EVENT, handlePageShow);

    return () => {
      window.removeEventListener(PAGE_SHOW_EVENT, handlePageShow);
    };
  }, [isSubmittingRef, setIsSubmitting]);
}

type CreateTribeFocusTargets = {
  name: RefObject<HTMLInputElement | null>;
  slug: RefObject<HTMLInputElement | null>;
  submit: RefObject<HTMLButtonElement | null>;
};

/**
 * Refs of the controls that can take focus after a failed submission.
 * @returns The name input, slug input and submit button refs.
 */
function useCreateTribeFocusTargets(): CreateTribeFocusTargets {
  const name = useRef<HTMLInputElement>(null);
  const slug = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);

  return { name, slug, submit };
}

/**
 * Moves focus to the field that owns a failed submission, or to the submit
 * button for form-level errors.
 * @param field - Field that owns the error (`null` for form-level errors).
 * @param targets - Focusable controls of the form.
 */
function focusCreateTribeField(
  field: CreateTribeFormErrorField | null,
  targets: CreateTribeFocusTargets
) {
  switch (field) {
    case CREATE_TRIBE_FORM_ERROR_FIELD.name:
      targets.name.current?.focus();
      break;
    case CREATE_TRIBE_FORM_ERROR_FIELD.slug:
      targets.slug.current?.focus();
      break;
    case null:
      targets.submit.current?.focus();
  }
}

/**
 * Inline pill that says whether the slug still follows the name.
 * @param props - Whether the slug matches the name.
 * @returns The live status pill.
 */
function CreateTribeSlugStatus({ isSlugSynced }: { isSlugSynced: boolean }) {
  return (
    <span
      aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
      className={cn(
        styles.CreateTribeForm__statusInline,
        isSlugSynced
          ? styles["CreateTribeForm__statusInline--synced"]
          : styles["CreateTribeForm__statusInline--unsynced"]
      )}
    >
      <PresenceSwap
        as="span"
        className={styles.CreateTribeForm__statusContent}
        mode="popLayout"
        presenceKey={
          isSlugSynced ? SLUG_STATUS_KEY.synced : SLUG_STATUS_KEY.edited
        }
      >
        {isSlugSynced ? (
          <CheckCircle2Icon aria-hidden />
        ) : (
          <PencilLineIcon aria-hidden />
        )}
        <span>{isSlugSynced ? "Sincronizado" : "Editado"}</span>
      </PresenceSwap>
    </span>
  );
}

/**
 * Class of the slug input: synced or unsynced only once the name yields a slug.
 * @param normalizedNameSlug - Slug derived from the name.
 * @param isSlugSynced - Whether the slug matches the name.
 * @returns The input class names.
 */
function getSlugInputClassName(
  normalizedNameSlug: string,
  isSlugSynced: boolean
): string {
  const syncClassName = isSlugSynced
    ? styles["CreateTribeForm__slugInput--synced"]
    : styles["CreateTribeForm__slugInput--unsynced"];

  return cn(
    styles.CreateTribeForm__slugInput,
    normalizedNameSlug && syncClassName
  );
}

type CreateTribeSlugFieldProps = {
  feedbackId: string;
  inputId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isSlugInvalid: boolean;
  isSlugSynced: boolean;
  normalizedNameSlug: string;
  onSlugBlur: (slug: string) => void;
  onSlugChange: (slug: string) => void;
  onSync: () => void;
  slug: string;
  slugPreview: string;
};

/**
 * Slug input with its sync-with-name action, sync status and URL preview.
 * @param props - Slug draft, its sync state and handlers.
 * @returns The slug field.
 */
function CreateTribeSlugField({
  feedbackId,
  inputId,
  inputRef,
  isSlugInvalid,
  isSlugSynced,
  normalizedNameSlug,
  onSlugBlur,
  onSlugChange,
  onSync,
  slug,
  slugPreview,
}: CreateTribeSlugFieldProps) {
  return (
    <div className={styles.CreateTribeForm__field}>
      <div className={styles.CreateTribeForm__labelRow}>
        <label className={styles.CreateTribeForm__label} htmlFor={inputId}>
          Slug
        </label>
        <Button
          className={styles.CreateTribeForm__syncButton}
          disabled={!normalizedNameSlug || isSlugSynced}
          onClick={onSync}
          size={CREATE_TRIBE_FORM_BUTTON.smallSize}
          type={CREATE_TRIBE_FORM_INTERACTION.buttonType}
          variant={CREATE_TRIBE_FORM_BUTTON.secondaryVariant}
        >
          Sincronizar con el nombre
        </Button>
      </div>
      <div className={styles.CreateTribeForm__slugInputWrap}>
        <Input
          aria-describedby={isSlugInvalid ? feedbackId : undefined}
          aria-invalid={isSlugInvalid || undefined}
          className={getSlugInputClassName(normalizedNameSlug, isSlugSynced)}
          id={inputId}
          onBlur={(event) => {
            onSlugBlur(event.currentTarget.value);
          }}
          onChange={(event) => {
            onSlugChange(event.currentTarget.value);
          }}
          placeholder="creadoras-que-construyen-futuro"
          ref={inputRef}
          required
          value={slug}
        />
        {normalizedNameSlug ? (
          <CreateTribeSlugStatus isSlugSynced={isSlugSynced} />
        ) : null}
      </div>
      <p className={styles.CreateTribeForm__hint}>
        Tu tribu quedará en <strong>/{slugPreview}</strong>
      </p>
    </div>
  );
}

type CreateTribeFeedbackRegionProps = {
  feedbackId: string;
  isOpen: boolean;
  message: string | null;
  onUseSuggestion: (suggestedSlug: string) => void;
  suggestedSlug: string | null;
};

/**
 * Collapsible live region with the last submission error and, for slug
 * conflicts, the suggested slug.
 * @param props - Error message, suggestion and visibility.
 * @returns The feedback region.
 */
function CreateTribeFeedbackRegion({
  feedbackId,
  isOpen,
  message,
  onUseSuggestion,
  suggestedSlug,
}: CreateTribeFeedbackRegionProps) {
  return (
    <AnimatedCollapse isOpen={isOpen}>
      <div
        aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
        className={styles.CreateTribeForm__feedback}
        id={feedbackId}
      >
        {message === null ? null : (
          <p className={styles.CreateTribeForm__error}>{message}</p>
        )}

        {suggestedSlug ? (
          <Button
            onClick={() => {
              onUseSuggestion(suggestedSlug);
            }}
            type={CREATE_TRIBE_FORM_INTERACTION.buttonType}
            variant={CREATE_TRIBE_FORM_BUTTON.secondaryVariant}
          >
            Usar sugerencia
          </Button>
        ) : null}
      </div>
    </AnimatedCollapse>
  );
}

/**
 * A server-rendered slug counts as a manual edit when it differs from the slug
 * derived from the name.
 * @param initialName - Server-rendered name.
 * @param initialSlug - Server-rendered slug.
 * @returns Whether the slug must stop following the name.
 */
function hasManualInitialSlug(initialName: string, initialSlug: string): boolean {
  const normalizedInitialSlug = normalizeTribeSlug(initialSlug);

  return (
    normalizedInitialSlug.length > 0 &&
    normalizedInitialSlug !== normalizeTribeSlug(initialName)
  );
}

type CreateTribeFeedbackOptions = Pick<
  CreateTribeFormProps,
  "errorField" | "errorMessage" | "suggestedSlug"
>;

/**
 * Inline feedback of the last failed submission, seeded by the server error
 * and hidden once an edit makes it stale.
 * @param options - Server-rendered error.
 * @returns The feedback, its visibility per field and its updaters.
 */
function useCreateTribeFeedback({
  errorField = null,
  errorMessage = null,
  suggestedSlug = null,
}: CreateTribeFeedbackOptions) {
  const [feedback, setFeedback] = useState<CreateTribeFormFeedback | null>(
    errorMessage
      ? { field: errorField, message: errorMessage, suggestedSlug }
      : null
  );
  const [isFeedbackDismissed, setIsFeedbackDismissed] = useState(false);
  const isFeedbackVisible = Boolean(feedback) && !isFeedbackDismissed;
  const visibleFeedbackField = isFeedbackVisible ? (feedback?.field ?? null) : null;

  /** Hides feedback that an edit to `field` made stale. */
  const dismissFeedbackOwnedBy = (field: CreateTribeFormErrorField) => {
    if (isFeedbackVisible && feedback?.field === field) {
      setIsFeedbackDismissed(true);
    }
  };

  /** Shows the feedback of a failed enhanced submission. */
  const showFailedOutcome = (outcome: CreateTribeFormFeedback) => {
    setFeedback({
      field: outcome.field,
      message: outcome.message,
      suggestedSlug: outcome.suggestedSlug,
    });
    setIsFeedbackDismissed(false);
  };

  return {
    dismissFeedbackOwnedBy,
    feedback,
    isFormLevelFeedbackVisible: isFeedbackVisible && feedback?.field === null,
    isNameInvalid: visibleFeedbackField === CREATE_TRIBE_FORM_ERROR_FIELD.name,
    isSlugInvalid: visibleFeedbackField === CREATE_TRIBE_FORM_ERROR_FIELD.slug,
    setIsFeedbackDismissed,
    showFailedOutcome,
  };
}

type CreateTribeSubmitOptions = {
  focusTargets: CreateTribeFocusTargets;
  onEnhancedSubmitStart: () => void;
  onFailedOutcome: (outcome: CreateTribeFormFeedback) => void;
  onSubmitTribe: CreateTribeFormProps["onSubmitTribe"];
  values: CreateTribeFormValues;
};

/**
 * Submits the form once at a time, natively or through the enhanced handler,
 * and moves focus to the field of a failed outcome.
 * @param options - Values, the enhanced handler and the failure callbacks.
 * @returns The submitting state and the submit handler.
 */
function useCreateTribeSubmit({
  focusTargets,
  onEnhancedSubmitStart,
  onFailedOutcome,
  onSubmitTribe,
  values,
}: CreateTribeSubmitOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous guard: a second activation before the button re-renders as
  // disabled would create the tribe twice (native post or enhanced request).
  const isSubmittingRef = useRef(false);

  useResetSubmitOnPageShow(isSubmittingRef, setIsSubmitting);

  const handleSubmitOutcome = (outcome: CreateTribeFormSubmitOutcome) => {
    if (outcome.status === CREATE_TRIBE_FORM_SUBMIT_STATUS.navigating) {
      // Keep the submit locked while the browser leaves the page; a bfcache
      // restore re-enables it through `pageshow`.
      return;
    }

    isSubmittingRef.current = false;
    // Commit the re-enabled form first: the submit button is disabled until
    // then, so it could not take focus earlier.
    flushSync(() => {
      setIsSubmitting(false);
      onFailedOutcome(outcome);
    });
    focusCreateTribeField(outcome.field, focusTargets);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (isSubmittingRef.current) {
      event.preventDefault();
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    if (!onSubmitTribe) {
      // Native post: the browser navigates and the route answers with redirects.
      return;
    }

    event.preventDefault();
    onEnhancedSubmitStart();
    void onSubmitTribe(values).then(handleSubmitOutcome);
  };

  return { handleSubmit, isSubmitting };
}

type CreateTribeNameFieldProps = {
  error: string | undefined;
  inputId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onNameChange: (name: string) => void;
  value: string;
};

/**
 * Name input of the new tribe.
 * @param props - Name draft, its error and change handler.
 * @returns The name field.
 */
function CreateTribeNameField({
  error,
  inputId,
  inputRef,
  onNameChange,
  value,
}: CreateTribeNameFieldProps) {
  return (
    <div className={styles.CreateTribeForm__field}>
      <Input
        error={error}
        id={inputId}
        label="Nombre de la tribu"
        name={CREATE_TRIBE_FORM_FIELD.name}
        onChange={(event) => {
          onNameChange(event.currentTarget.value);
        }}
        placeholder="Ej. Creadoras que construyen futuro"
        ref={inputRef}
        required
        value={value}
      />
    </div>
  );
}

type CreateTribeSubmitActionProps = {
  buttonRef: RefObject<HTMLButtonElement | null>;
  describedBy: string | undefined;
  isSubmitting: boolean;
};

/**
 * Submit button, busy while the tribe is being created.
 * @param props - Button ref, its description and the submitting state.
 * @returns The form actions.
 */
function CreateTribeSubmitAction({
  buttonRef,
  describedBy,
  isSubmitting,
}: CreateTribeSubmitActionProps) {
  return (
    <div className={styles.CreateTribeForm__actions}>
      <Button
        aria-busy={isSubmitting || undefined}
        aria-describedby={describedBy}
        disabled={isSubmitting}
        ref={buttonRef}
        type={CREATE_TRIBE_FORM_BUTTON.submitType}
      >
        {isSubmitting ? "Creando tribu…" : "Crear tribu"}
      </Button>
    </div>
  );
}

type TribeSlugDraftOptions = {
  dismissFeedbackOwnedBy: (field: CreateTribeFormErrorField) => void;
  initialName: string;
  initialSlug: string;
};

/**
 * Name and slug drafts: the slug follows the name until the person edits it,
 * and every edit hides the feedback it made stale.
 * @param options - Server-rendered values and the feedback dismisser.
 * @returns The drafts, their derived slugs and their edit handlers.
 */
function useTribeSlugDraft({
  dismissFeedbackOwnedBy,
  initialName,
  initialSlug,
}: TribeSlugDraftOptions) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [hasManualSlugChanges, setHasManualSlugChanges] = useState(() =>
    hasManualInitialSlug(initialName, initialSlug)
  );
  const normalizedNameSlug = normalizeTribeSlug(name);
  const canonicalSlug = normalizeTribeSlug(slug);

  const changeName = (nextName: string) => {
    setName(nextName);
    dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.name);

    if (!hasManualSlugChanges) {
      setSlug(normalizeTribeSlug(nextName));
      dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.slug);
    }
  };

  const changeSlug = (nextSlug: string) => {
    setHasManualSlugChanges(true);
    setSlug(normalizeTribeSlugDraft(nextSlug));
    dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.slug);
  };

  const syncSlugWithName = () => {
    setHasManualSlugChanges(false);
    setSlug(normalizedNameSlug);
    dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.slug);
  };

  return {
    applySuggestedSlug: (nextSlug: string) => {
      setHasManualSlugChanges(true);
      setSlug(nextSlug);
    },
    canonicalSlug,
    changeName,
    changeSlug,
    isSlugSynced:
      Boolean(normalizedNameSlug) && canonicalSlug === normalizedNameSlug,
    name,
    normalizedNameSlug,
    normalizeSlugOnBlur: (nextSlug: string) => {
      setSlug(normalizeTribeSlug(nextSlug));
    },
    slug,
    slugPreview:
      canonicalSlug || normalizedNameSlug || TRIBE_SLUG_PREVIEW_FALLBACK,
    syncSlugWithName,
  };
}

/**
 * Wires the feedback, the name and slug drafts and the submission of the form.
 * @param props - Form props without the submit path.
 * @returns Ids, focus targets, drafts, feedback and the submit handler.
 */
function useCreateTribeFormModel({
  errorField = null,
  errorMessage = null,
  initialName = "",
  initialSlug = "",
  onSubmitTribe,
  suggestedSlug = null,
}: Omit<CreateTribeFormProps, "submitPath">) {
  const nameInputId = useId();
  const slugInputId = useId();
  const formFeedback = useCreateTribeFeedback({
    errorField,
    errorMessage,
    suggestedSlug,
  });
  const slugDraft = useTribeSlugDraft({
    dismissFeedbackOwnedBy: formFeedback.dismissFeedbackOwnedBy,
    initialName,
    initialSlug,
  });
  const feedbackId = useId();
  const focusTargets = useCreateTribeFocusTargets();
  const { handleSubmit, isSubmitting } = useCreateTribeSubmit({
    focusTargets,
    onEnhancedSubmitStart: () => {
      // The previous error no longer describes the values being submitted.
      formFeedback.setIsFeedbackDismissed(true);
    },
    onFailedOutcome: formFeedback.showFailedOutcome,
    onSubmitTribe,
    values: { name: slugDraft.name, slug: slugDraft.canonicalSlug },
  });

  return { feedbackId, focusTargets, formFeedback, handleSubmit, isSubmitting, nameInputId, slugDraft, slugInputId };
}

export function CreateTribeForm({
  errorField = null,
  errorMessage = null,
  initialName = "",
  initialSlug = "",
  onSubmitTribe,
  submitPath,
  suggestedSlug = null,
}: CreateTribeFormProps) {
  const { feedbackId, focusTargets, formFeedback, handleSubmit, isSubmitting, nameInputId, slugDraft, slugInputId } = useCreateTribeFormModel({ errorField, errorMessage, initialName, initialSlug, onSubmitTribe, suggestedSlug });
  const { feedback, isFormLevelFeedbackVisible, isSlugInvalid } = formFeedback;

  return (
    <form
      action={submitPath}
      aria-busy={isSubmitting || undefined}
      className={styles.CreateTribeForm}
      method={CREATE_TRIBE_FORM_FIELD.method}
      onSubmit={handleSubmit}
    >
      <input
        name={CREATE_TRIBE_FORM_FIELD.slug}
        type={CREATE_TRIBE_FORM_FIELD.hiddenType}
        value={slugDraft.canonicalSlug}
        readOnly
      />
      <CreateTribeNameField
        error={formFeedback.isNameInvalid ? feedback?.message : undefined}
        inputId={nameInputId}
        inputRef={focusTargets.name}
        onNameChange={slugDraft.changeName}
        value={slugDraft.name}
      />

      <CreateTribeSlugField
        feedbackId={feedbackId}
        inputId={slugInputId}
        inputRef={focusTargets.slug}
        isSlugInvalid={isSlugInvalid}
        isSlugSynced={slugDraft.isSlugSynced}
        normalizedNameSlug={slugDraft.normalizedNameSlug}
        onSlugBlur={slugDraft.normalizeSlugOnBlur}
        onSlugChange={slugDraft.changeSlug}
        onSync={slugDraft.syncSlugWithName}
        slug={slugDraft.slug}
        slugPreview={slugDraft.slugPreview}
      />

      <CreateTribeFeedbackRegion
        feedbackId={feedbackId}
        isOpen={isSlugInvalid || isFormLevelFeedbackVisible}
        message={feedback?.message ?? null}
        onUseSuggestion={(nextSlug) => {
          slugDraft.applySuggestedSlug(nextSlug);
          // The conflict is resolved: hide it and keep focus on the fixed field.
          formFeedback.setIsFeedbackDismissed(true);
          focusTargets.slug.current?.focus();
        }}
        suggestedSlug={feedback?.suggestedSlug ?? null}
      />

      <CreateTribeSubmitAction
        buttonRef={focusTargets.submit}
        describedBy={isFormLevelFeedbackVisible ? feedbackId : undefined}
        isSubmitting={isSubmitting}
      />
    </form>
  );
}
