/** Presents current notification facts and explicit recovery callbacks without auth, HTTP or storage ownership. @module messaging-notification-recovery */
import { useId } from "react";
import { Button, Checkbox, Label, Select } from "@golfo/ui";
import type { NotificationDeliveryCatalogItem } from "@/src/modules/messaging/application/results/notification-delivery-catalog-result";
import { MESSAGING_DELIVERY_STATE_LABEL } from "@/src/modules/messaging/constants/messaging-diagnostic-browser";
import { MESSAGE_DELIVERY_STATE } from "@/src/modules/messaging/constants/message-delivery";
import { NOTIFICATION_RECOVERY_DATE_LABEL_CHARACTERS } from "@/src/modules/messaging/constants/notification-recovery-ui";
import styles from "./styles.module.scss";

/** The container supplies guarded current facts, renewed consent and bound original observation state. */
export type MessagingNotificationRecoveryProps = {
  items: readonly NotificationDeliveryCatalogItem[];
  selectedDeliveryId: string;
  targetName: string | null;
  catalogAvailable: boolean;
  hasMore: boolean;
  busy: boolean;
  canRead: boolean;
  canRecover: boolean;
  confirmed: boolean;
  hasReference: boolean;
  originalCompleted: boolean;
  mayResume: boolean;
  canArchive: boolean;
  archiveConfirmed: boolean;
  historyCount: number;
  historyFull: boolean;
  message: { kind: "status" | "alert"; text: string } | null;
  onSelect: (deliveryId: string) => void;
  onConfirm: (confirmed: boolean) => void;
  onRefresh: () => void;
  onMore: () => void;
  onRecover: () => void;
  onReadOriginal: () => void;
  onResumeOriginal: () => void;
  onClearCompleted: () => void;
  onStopObserving: () => void;
  onArchiveConfirm: (confirmed: boolean) => void;
  onArchive: () => void;
  onRestoreHistory: (index: number) => void;
};

/** @param props - Own current metadata and callbacks only. @returns Accessible recovery controls with uncertainty visible inside TuTribu, even without email. */
export function MessagingNotificationRecovery(props: MessagingNotificationRecoveryProps) {
  const instanceId = useId(), deliveryControlId = `${instanceId}-delivery`, consentControlId = `${instanceId}-consent`, archiveControlId = `${instanceId}-archive`;
  const selected = props.items.find((item) => item.id === props.selectedDeliveryId);
  const unresolved = selected?.state === MESSAGE_DELIVERY_STATE.unknown || selected?.state === MESSAGE_DELIVERY_STATE.accepted;
  return <section className={styles.MessagingNotificationRecovery} aria-labelledby={`${instanceId}-heading`}>
    <h2 id={`${instanceId}-heading`} className={styles.MessagingNotificationRecovery__title}>Recuperación de avisos</h2>
    <p className={styles.MessagingNotificationRecovery__help}>Consultá el estado del aviso antes de recuperar su entrega con otra conexión de esta tribu. La recuperación conserva su plazo y los consumos anteriores.</p>
    {props.historyFull && !props.hasReference && <p className={styles.MessagingNotificationRecovery__help} role="status">El historial de esta pestaña llegó a su límite. Consultá un intento conservado antes de iniciar otra recuperación; no se borrará una referencia para hacer lugar.</p>}
    <div className={styles.MessagingNotificationRecovery__actions}>
      <Button type="button" variant="secondary" disabled={props.busy || !props.canRead} onClick={props.onRefresh}>Actualizar avisos</Button>
      {props.hasMore && <Button type="button" variant="secondary" disabled={props.busy || !props.canRead} onClick={props.onMore}>Ver avisos anteriores</Button>}
    </div>
    {!props.catalogAvailable ? <p className={styles.MessagingNotificationRecovery__help}>Consultá los avisos para elegir una entrega. No se enviará ningún mensaje al consultar.</p>
      : props.items.length === 0 ? <p className={styles.MessagingNotificationRecovery__help}>No hay avisos registrados en esta página.</p>
        : <div className={styles.MessagingNotificationRecovery__field}>
          <Select value={props.selectedDeliveryId} disabled={props.busy || props.hasReference || !props.canRead} onValueChange={props.onSelect} id={deliveryControlId} label="Aviso que querés recuperar" options={props.items.map((item, index) => ({ value: item.id, label: `Aviso ${index + 1} · ${MESSAGING_DELIVERY_STATE_LABEL[item.state]} · ${item.createdAt.slice(0, NOTIFICATION_RECOVERY_DATE_LABEL_CHARACTERS)}` }))} placeholder="Elegí un aviso" />
        </div>}
    {selected && <p className={styles.MessagingNotificationRecovery__help}>Estado actual: {MESSAGING_DELIVERY_STATE_LABEL[selected.state]}. Plazo del aviso: <time dateTime={selected.deadlineAt}>{selected.deadlineAt.slice(0, NOTIFICATION_RECOVERY_DATE_LABEL_CHARACTERS)}</time>.</p>}
    {unresolved && <p className={styles.MessagingNotificationRecovery__feedback} role="alert">El envío anterior puede haber sido aceptado. No se habilita otro envío a ciegas; consultá su estado antes de continuar.</p>}
    {selected?.recoveryDeliveryId && <p className={styles.MessagingNotificationRecovery__help}>Este aviso ya tiene una entrega de recuperación. Consultá el resultado original y su estado antes de otra acción.</p>}
    <p className={styles.MessagingNotificationRecovery__help}>{props.hasReference ? "El intento conservado mantiene el aviso, la conexión y las versiones elegidas originalmente. Consultá su resultado antes de volver a confirmar." : props.targetName ? `La entrega nueva usará la conexión seleccionada: ${props.targetName}. El servidor vuelve a comprobar sus requisitos actuales.` : "Prepará y seleccioná otra conexión para recuperar este aviso."}</p>
    {(selected || props.hasReference) && <><div className={styles.MessagingNotificationRecovery__consent}>
      <Checkbox id={consentControlId} checked={props.confirmed} disabled={props.busy || !props.canRead || props.originalCompleted} onCheckedChange={(checked) => props.onConfirm(checked === true)} />
      <Label htmlFor={consentControlId}>Revisé el aviso, la conexión y el impacto; quiero registrar esta recuperación.</Label>
    </div>
    <div className={styles.MessagingNotificationRecovery__actions}>
      {!props.hasReference && <Button type="button" disabled={props.busy || !props.canRecover || !props.confirmed} onClick={props.onRecover}>Registrar recuperación</Button>}
      {props.hasReference && <>
        <Button type="button" variant="secondary" disabled={props.busy || !props.canRead} onClick={props.onReadOriginal}>Consultar recuperación original</Button>
        {!props.originalCompleted && <Button type="button" disabled={props.busy || !props.mayResume || !props.confirmed} onClick={props.onResumeOriginal}>Reanudar intento original</Button>}
        {props.originalCompleted && <Button type="button" variant="secondary" disabled={props.busy || !props.canRead} onClick={props.onClearCompleted}>Preparar otra recuperación</Button>}
      </>}
    </div></>}
    {props.busy && <div className={styles.MessagingNotificationRecovery__actions}><Button type="button" variant="secondary" onClick={props.onStopObserving}>Dejar de observar</Button></div>}
    {props.hasReference && props.canArchive && !props.originalCompleted && <>
      <p className={styles.MessagingNotificationRecovery__help}>Podés conservar esta referencia en el historial y liberar el formulario. Esto no cancela ni revierte la operación del servidor; puede completar después.</p>
      <div className={styles.MessagingNotificationRecovery__consent}><Checkbox id={archiveControlId} checked={props.archiveConfirmed} disabled={props.busy || !props.canRead} onCheckedChange={(checked) => props.onArchiveConfirm(checked === true)} /><Label htmlFor={archiveControlId}>Revisé que el intento puede continuar y quiero conservar su referencia en el historial.</Label></div>
      <div className={styles.MessagingNotificationRecovery__actions}><Button type="button" variant="secondary" disabled={props.busy || !props.canRead || !props.archiveConfirmed} onClick={props.onArchive}>Conservar intento y liberar formulario</Button></div>
    </>}
    {props.historyCount > 0 && <div className={styles.MessagingNotificationRecovery__actions}>{Array.from({ length: props.historyCount }, (_, index) => <Button key={index} type="button" variant="secondary" disabled={props.busy || !props.canRead || props.hasReference} onClick={() => props.onRestoreHistory(index)}>Consultar intento conservado {index + 1}</Button>)}</div>}
    {props.hasReference && <p className={styles.MessagingNotificationRecovery__help}>La referencia del intento original está conservada en esta pestaña. Consultarla no registra otra recuperación. Dejar de observar no cancela ni revierte el trabajo del servidor.</p>}
    {props.originalCompleted && <p className={styles.MessagingNotificationRecovery__help}>La recuperación quedó registrada. Esto no confirma que el aviso se haya enviado o entregado.</p>}
    {props.message && <p className={styles.MessagingNotificationRecovery__feedback} role={props.message.kind === "alert" ? "alert" : "status"}>{props.message.text}</p>}
  </section>;
}
