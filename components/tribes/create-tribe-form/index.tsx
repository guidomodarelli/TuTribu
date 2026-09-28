"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, PencilLineIcon } from "lucide-react";

import { Button, Input, AnimatedCollapse, PresenceSwap, cn } from "beez-ui";

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
  outlineVariant: "outline",
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
  const hasTrailingSeparator = /[^a-z0-9]+$/i.test(
    input.normalize(TRIBE_SLUG_NORMALIZATION_FORM).replace(/[\u0300-\u036f]/g, "")
  );

  if (hasTrailingSeparator && normalizedSlug.length > 0) {
    return normalizedSlug + TRIBE_SLUG_TRAILING_SEPARATOR;
  }

  return normalizedSlug;
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
  const nameInputId = useId();
  const slugInputId = useId();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const normalizedInitialNameSlug = normalizeTribeSlug(initialName);
  const normalizedInitialSlug = normalizeTribeSlug(initialSlug);
  const [hasManualSlugChanges, setHasManualSlugChanges] = useState(
    normalizedInitialSlug.length > 0 &&
      normalizedInitialSlug !== normalizedInitialNameSlug
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<CreateTribeFormFeedback | null>(
    errorMessage
      ? { field: errorField, message: errorMessage, suggestedSlug }
      : null
  );
  const [isFeedbackDismissed, setIsFeedbackDismissed] = useState(false);
  // Field to focus once a failed enhanced submission has re-rendered the form
  // (the submit button is disabled until then, so it cannot take focus earlier).
  const [focusRequest, setFocusRequest] = useState<{
    field: CreateTribeFormErrorField | null;
  } | null>(null);
  const feedbackId = useId();
  const nameFeedbackId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  // Synchronous guard: a second activation before the button re-renders as
  // disabled would create the tribe twice (native post or enhanced request).
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    // A back navigation can restore this page from the bfcache with the
    // button still disabled; re-enable it so the form stays usable.
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
  }, []);

  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    switch (focusRequest.field) {
      case CREATE_TRIBE_FORM_ERROR_FIELD.name:
        nameInputRef.current?.focus();
        break;
      case CREATE_TRIBE_FORM_ERROR_FIELD.slug:
        slugInputRef.current?.focus();
        break;
      default:
        submitButtonRef.current?.focus();
    }
  }, [focusRequest]);

  const normalizedNameSlug = normalizeTribeSlug(name);
  const canonicalSlug = normalizeTribeSlug(slug);
  const isSlugSynced =
    Boolean(normalizedNameSlug) && canonicalSlug === normalizedNameSlug;

  const slugPreview =
    canonicalSlug || normalizedNameSlug || TRIBE_SLUG_PREVIEW_FALLBACK;
  const isFeedbackVisible = Boolean(feedback) && !isFeedbackDismissed;
  const visibleFeedbackField = isFeedbackVisible ? (feedback?.field ?? null) : null;
  const isNameInvalid =
    visibleFeedbackField === CREATE_TRIBE_FORM_ERROR_FIELD.name;
  const isSlugInvalid =
    visibleFeedbackField === CREATE_TRIBE_FORM_ERROR_FIELD.slug;
  const isFormLevelFeedbackVisible =
    isFeedbackVisible && feedback?.field === null;

  /** Hides feedback that an edit to `field` made stale. */
  const dismissFeedbackOwnedBy = (field: CreateTribeFormErrorField) => {
    if (isFeedbackVisible && feedback?.field === field) {
      setIsFeedbackDismissed(true);
    }
  };

  const handleSubmitOutcome = (outcome: CreateTribeFormSubmitOutcome) => {
    if (outcome.status === CREATE_TRIBE_FORM_SUBMIT_STATUS.navigating) {
      // Keep the submit locked while the browser leaves the page; a bfcache
      // restore re-enables it through `pageshow`.
      return;
    }

    isSubmittingRef.current = false;
    setIsSubmitting(false);
    setFeedback({
      field: outcome.field,
      message: outcome.message,
      suggestedSlug: outcome.suggestedSlug,
    });
    setIsFeedbackDismissed(false);
    setFocusRequest({ field: outcome.field });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
    // The previous error no longer describes the values being submitted.
    setIsFeedbackDismissed(true);
    void onSubmitTribe({ name, slug: canonicalSlug }).then(handleSubmitOutcome);
  };

  const feedbackSuggestedSlug = feedback?.suggestedSlug ?? null;
  const feedbackContent = feedback ? (
    <p className={styles.CreateTribeForm__error}>{feedback.message}</p>
  ) : null;

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
        value={canonicalSlug}
        readOnly
      />
      <div className={styles.CreateTribeForm__field}>
        <label
          className={styles.CreateTribeForm__label}
          htmlFor={nameInputId}
        >
          Nombre de la tribu
        </label>
        <Input
          aria-describedby={isNameInvalid ? nameFeedbackId : undefined}
          aria-invalid={isNameInvalid || undefined}
          id={nameInputId}
          name={CREATE_TRIBE_FORM_FIELD.name}
          onChange={(event) => {
            const nextName = event.currentTarget.value;
            setName(nextName);
            dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.name);

            if (!hasManualSlugChanges) {
              setSlug(normalizeTribeSlug(nextName));
              dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.slug);
            }
          }}
          placeholder="Ej. Creadoras que construyen futuro"
          ref={nameInputRef}
          required
          value={name}
        />
        <AnimatedCollapse isOpen={isNameInvalid}>
          <div
            aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
            className={styles.CreateTribeForm__feedback}
            id={nameFeedbackId}
          >
            {feedbackContent}
          </div>
        </AnimatedCollapse>
      </div>

      <div className={styles.CreateTribeForm__field}>
        <div className={styles.CreateTribeForm__labelRow}>
          <label
            className={styles.CreateTribeForm__label}
            htmlFor={slugInputId}
          >
            Slug
          </label>
          <Button
            className={styles.CreateTribeForm__syncButton}
            disabled={!normalizedNameSlug || isSlugSynced}
            onClick={() => {
              setHasManualSlugChanges(false);
              setSlug(normalizedNameSlug);
              dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.slug);
            }}
            size={CREATE_TRIBE_FORM_BUTTON.smallSize}
            type={CREATE_TRIBE_FORM_INTERACTION.buttonType}
            variant={CREATE_TRIBE_FORM_BUTTON.outlineVariant}
          >
            Sincronizar con el nombre
          </Button>
        </div>
        <div className={styles.CreateTribeForm__slugInputWrap}>
          <Input
            aria-describedby={isSlugInvalid ? feedbackId : undefined}
            aria-invalid={isSlugInvalid || undefined}
            className={cn(
              styles.CreateTribeForm__slugInput,
              normalizedNameSlug &&
                (isSlugSynced
                  ? styles["CreateTribeForm__slugInput--synced"]
                  : styles["CreateTribeForm__slugInput--unsynced"])
            )}
            id={slugInputId}
            onBlur={(event) => {
              setSlug(normalizeTribeSlug(event.currentTarget.value));
            }}
            onChange={(event) => {
              setHasManualSlugChanges(true);
              setSlug(normalizeTribeSlugDraft(event.currentTarget.value));
              dismissFeedbackOwnedBy(CREATE_TRIBE_FORM_ERROR_FIELD.slug);
            }}
            placeholder="creadoras-que-construyen-futuro"
            ref={slugInputRef}
            required
            value={slug}
          />
          {normalizedNameSlug ? (
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
          ) : null}
        </div>
        <p className={styles.CreateTribeForm__hint}>
          Tu tribu quedará en <strong>/{slugPreview}</strong>
        </p>
      </div>

      <AnimatedCollapse isOpen={isSlugInvalid || isFormLevelFeedbackVisible}>
        <div
          aria-live={CREATE_TRIBE_FORM_ARIA.livePolite}
          className={styles.CreateTribeForm__feedback}
          id={feedbackId}
        >
          {feedbackContent}

          {feedbackSuggestedSlug ? (
            <Button
              onClick={() => {
                setHasManualSlugChanges(true);
                setSlug(feedbackSuggestedSlug);
                // The conflict is resolved: hide it and keep focus on the fixed field.
                setIsFeedbackDismissed(true);
                slugInputRef.current?.focus();
              }}
              type={CREATE_TRIBE_FORM_INTERACTION.buttonType}
              variant={CREATE_TRIBE_FORM_BUTTON.outlineVariant}
            >
              Usar sugerencia
            </Button>
          ) : null}
        </div>
      </AnimatedCollapse>

      <div className={styles.CreateTribeForm__actions}>
        <Button
          aria-busy={isSubmitting || undefined}
          aria-describedby={isFormLevelFeedbackVisible ? feedbackId : undefined}
          disabled={isSubmitting}
          ref={submitButtonRef}
          type={CREATE_TRIBE_FORM_BUTTON.submitType}
        >
          {isSubmitting ? "Creando tribu…" : "Crear tribu"}
        </Button>
      </div>
    </form>
  );
}
