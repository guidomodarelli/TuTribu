"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "beez-ui";

import { Link } from "@/components/navigation/link";
import { activateAcademy } from "@/lib/academy/academy-api-client";
import { ROUTES } from "@/src/constants/routes";
import type { AcademySettingsDto } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import styles from "./styles.module.scss";

const ACADEMY_ACTIVATION_COPY = {
  activateButton: "Activar academia",
  activatePending: "Activando…",
  activeDescription:
    "La academia está activa. Desde Gestionar academia configurás la oferta, los proveedores de verificación, las admisiones y la venta.",
  activeStatus: "Modo academia activo",
  activatedToast: "Activaste la academia. Tus integrantes actuales conservan todo su acceso.",
  cancelButton: "Cancelar",
  classicDescription:
    "Tu tribu funciona en modo clásico. Al activar la academia, la entrada pasa a ser gratuita y los cursos de academia y el contenido de la tribu se habilitan con una suscripción o una bonificación.",
  classicStatus: "Modo clásico",
  confirmButton: "Sí, activar academia",
  confirmTitle: "¿Activar la academia en esta tribu?",
  conflict: "La configuración cambió mientras decidías. Revisá el estado actual.",
  effects: [
    "Tus integrantes actuales conservan todo lo que ven hoy, sin vencimiento.",
    "Quienes entren desde ahora empiezan con acceso básico: cursos básicos, bienvenida y su estado.",
    "Las suscripciones y precios actuales siguen igual; nadie paga distinto.",
    "Las admisiones y la venta empiezan cerradas; las abrís desde Gestionar academia.",
    "No se puede volver al modo clásico desde la app.",
  ],
  heading: "Academia",
  manageLink: "Gestionar academia",
} as const;

const ACADEMY_MODE = "academy";

type AcademyActivationProps = {
  settings: AcademySettingsDto;
  tribeSlug: string;
};

/**
 * Tribe settings section where the active leader switches the tribe to the
 * academy mode. The server checks the role again and keeps current members'
 * access; a successful activation refreshes the route because navigation and
 * permissions of the whole tribe change.
 *
 * @param props - Current academy settings and tribe slug.
 * @returns Academy activation section.
 */
export function AcademyActivation({ settings: initialSettings, tribeSlug }: AcademyActivationProps) {
  const router = useRouter();
  const headingId = useId();
  const statusId = useId();
  const [settings, setSettings] = useState(initialSettings);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Guards a second confirmation landing before the disabled state renders.
  const isSubmittingRef = useRef(false);
  const isAcademy = settings.accessModel === ACADEMY_MODE;

  const confirmActivation = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await activateAcademy(tribeSlug, settings.configVersion);

      if (result.isSuccess) {
        setSettings(result.data);
        setIsDialogOpen(false);
        setFeedback(ACADEMY_ACTIVATION_COPY.activatedToast);
        toast.success(ACADEMY_ACTIVATION_COPY.activatedToast);
        // Access model changes navigation and permissions across the tribe.
        router.refresh();
        return;
      }

      if (result.conflictData) {
        setSettings(result.conflictData);
        setFeedback(ACADEMY_ACTIVATION_COPY.conflict);
      } else {
        setFeedback(result.message);
      }

      setIsDialogOpen(false);
      toast.error(result.conflictData ? ACADEMY_ACTIVATION_COPY.conflict : result.message);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className={styles.AcademyActivation}>
      <div className={styles.AcademyActivation__intro}>
        <h2 className={styles.AcademyActivation__title} id={headingId}>
          {ACADEMY_ACTIVATION_COPY.heading}
        </h2>
        <p className={styles.AcademyActivation__status} id={statusId}>
          {isAcademy ? ACADEMY_ACTIVATION_COPY.activeStatus : ACADEMY_ACTIVATION_COPY.classicStatus}
        </p>
        <p className={styles.AcademyActivation__description}>
          {isAcademy
            ? ACADEMY_ACTIVATION_COPY.activeDescription
            : ACADEMY_ACTIVATION_COPY.classicDescription}
        </p>
      </div>

      <div className={styles.AcademyActivation__actions}>
        {isAcademy ? (
          <Link
            className={styles.AcademyActivation__manageLink}
            href={ROUTES.tribes.academyManage(tribeSlug)}
          >
            {ACADEMY_ACTIVATION_COPY.manageLink}
          </Link>
        ) : (
          <Button
            aria-describedby={statusId}
            disabled={isSubmitting}
            onClick={() => setIsDialogOpen(true)}
            type="button"
          >
            {ACADEMY_ACTIVATION_COPY.activateButton}
          </Button>
        )}
      </div>

      {feedback ? (
        <p className={styles.AcademyActivation__feedback} role="status">
          {feedback}
        </p>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!isSubmitting) {
            setIsDialogOpen(open);
          }
        }}
        open={isDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ACADEMY_ACTIVATION_COPY.confirmTitle}</DialogTitle>
            <DialogDescription>{ACADEMY_ACTIVATION_COPY.classicDescription}</DialogDescription>
          </DialogHeader>
          <ul className={styles.AcademyActivation__effects}>
            {ACADEMY_ACTIVATION_COPY.effects.map((effect) => (
              <li key={effect}>{effect}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              disabled={isSubmitting}
              onClick={() => setIsDialogOpen(false)}
              type="button"
              variant="outline"
            >
              {ACADEMY_ACTIVATION_COPY.cancelButton}
            </Button>
            <Button
              aria-busy={isSubmitting || undefined}
              disabled={isSubmitting}
              onClick={() => {
                void confirmActivation();
              }}
              type="button"
            >
              {isSubmitting
                ? ACADEMY_ACTIVATION_COPY.activatePending
                : ACADEMY_ACTIVATION_COPY.confirmButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
