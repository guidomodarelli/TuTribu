/** Presents safe tribe aggregates separately from the sole current country/quota configuration. @module admission-metrics */
import { Link } from "@/components/navigation/link";
import type { AdmissionMetricsResult } from "@/src/modules/academy-admissions/application/results/admission-metrics-result";
import type { MessagingUsagePolicyStateResult } from "@/src/modules/messaging/application/results/messaging-usage-policy-result";
import { ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { ADMISSION_METRIC_PHASE_LABELS, ADMISSION_METRIC_RUN_LABELS, ADMISSION_OBSERVATION_COPY } from "@/src/modules/academy-admissions/constants/admission-activity-labels";
import { formatAdmissionObservationDuration, formatAdmissionObservationTime } from "@/lib/academy-admissions/admission-observation-format";
import { resolveAdmissionMaintenanceStaleness } from "@/lib/academy-admissions/admission-maintenance-staleness";
import styles from "./styles.module.scss";

/** Values are computed from the current own DTO; no private dimension is accepted as a label. */
type MetricValue = { label: string; value: number | string };
/** @param values - Fixed labels and observed counters. @returns One compact semantic definition list. */
function renderCounts(values: readonly MetricValue[]) {
  return <dl className={styles.AdmissionMetrics__counts}>{values.map((item) => <div className={styles.AdmissionMetrics__count} key={item.label}><dt className={styles.AdmissionMetrics__label}>{item.label}</dt><dd className={typeof item.value === "number" ? styles.AdmissionMetrics__value : `${styles.AdmissionMetrics__value} ${styles["AdmissionMetrics__value--text"]}`}>{item.value}</dd></div>)}</dl>;
}

/** Only own aggregate/settings props enter presentation; all authority and reads belong to the route. */
export type AdmissionMetricsProps = { metrics: AdmissionMetricsResult; currentUsage: MessagingUsagePolicyStateResult; usageHref: string };
/** @param props - Independently observed aggregate and current configuration; neither replaces the other. @returns UTC consumption, distinct delivery/attempt counters and actual worker history. */
export function AdmissionMetrics({ metrics, currentUsage, usageHref }: AdmissionMetricsProps) {
  const currentPolicy = currentUsage.policy;
  const changedConfiguration = (currentPolicy?.version ?? null) !== metrics.usage.policyVersion;
  const requests = metrics.requests, deliveries = metrics.deliveries, attempts = metrics.attempts;
  const maintenanceStaleness = resolveAdmissionMaintenanceStaleness(metrics);
  return <div className={styles.AdmissionMetrics}>
    <p className={styles.AdmissionMetrics__help}>Datos observados el <time dateTime={metrics.asOf}>{formatAdmissionObservationTime(metrics.asOf)}</time>. Cada consulta conserva su fecha y sus versiones.</p>
    <section className={styles.AdmissionMetrics__section} aria-label="Consumo del día UTC">
      <h2 className={styles.AdmissionMetrics__title}>Consumo del día UTC</h2>
      <p>Período iniciado el <time dateTime={metrics.usage.dayStartUtc}>{formatAdmissionObservationTime(metrics.usage.dayStartUtc)}</time>.</p>
      {renderCounts([{ label: "Códigos consumidos", value: metrics.usage.verificationToday }, { label: "Avisos consumidos", value: metrics.usage.notificationToday }])}
      <p className={styles.AdmissionMetrics__help}>El proveedor factura los envíos a la cuenta del líder. Los cupos de TuTribu no representan un saldo ni una garantía monetaria exacta.</p>
      <p>Versión de uso observada: {metrics.usage.policyVersion ?? ADMISSION_OBSERVATION_COPY.noVersion}. {changedConfiguration ? "Configuración consultada" : "Configuración actual"}: {currentPolicy ? `versión ${currentPolicy.version}` : "todavía sin configurar"}.</p>
      {changedConfiguration && <p role="status">La configuración cambió entre las consultas. El consumo observado se conserva por separado; consultá nuevamente para comparar el estado actual.</p>}
      {currentPolicy && renderCounts([{ label: changedConfiguration ? "Cupo de códigos de la versión consultada" : "Cupo actual de códigos", value: currentPolicy.verificationDailyLimit }, { label: changedConfiguration ? "Cupo de avisos de la versión consultada" : "Cupo actual de avisos", value: currentPolicy.notificationDailyLimit }])}
      <Link href={usageHref}>Administrar países y cupos</Link>
      <p className={styles.AdmissionMetrics__help}>Cambiar países, cupos o conexión conserva el consumo. Las consultas y los reintentos deduplicados no crean otra versión de configuración.</p>
    </section>
    <section className={styles.AdmissionMetrics__section} aria-label="Solicitudes y revisiones">
      <h2 className={styles.AdmissionMetrics__title}>Solicitudes y revisiones</h2>
      {renderCounts([{ label: "Pendientes", value: requests.pending }, { label: "Aprobadas", value: requests.approved }, { label: "Rechazadas", value: requests.rejected }, { label: "Canceladas", value: requests.cancelled }, { label: "Vencidas", value: requests.expired }, { label: "Revisiones automáticas", value: metrics.reviews.automatic }, { label: "Revisiones manuales", value: metrics.reviews.manual }, { label: "Antigüedad de la pendiente más antigua", value: formatAdmissionObservationDuration(requests.oldestPendingAgeMs) }])}
    </section>
    <section className={styles.AdmissionMetrics__section} aria-label="Verificación por canal">
      <h2 className={styles.AdmissionMetrics__title}>Verificación por canal</h2>
      {metrics.verification.length ? <div className={styles.AdmissionMetrics__scroll} role="region" aria-label="Tabla de verificación por canal" tabIndex={0}><table className={styles.AdmissionMetrics__table}><caption className={styles.AdmissionMetrics__caption}>Desafíos de contacto registrados</caption><thead><tr><th scope="col">Canal</th><th scope="col">Emitidos</th><th scope="col">Verificados</th><th scope="col">Invalidados</th><th scope="col">Vencidos</th><th scope="col">Intentos de código fallidos</th></tr></thead><tbody>{metrics.verification.map((row) => <tr key={row.channel}><th scope="row">{row.channel === MESSAGING_PUBLIC_CHANNEL.email ? "Correo" : row.channel === MESSAGING_PUBLIC_CHANNEL.sms ? "SMS" : "WhatsApp"}</th><td>{row.issued}</td><td>{row.verified}</td><td>{row.invalidated}</td><td>{row.expired}</td><td>{row.failedAttempts}</td></tr>)}</tbody></table></div> : <p>No hay desafíos registrados por canal.</p>}
    </section>
    <section className={styles.AdmissionMetrics__section} aria-label="Entregas e intentos externos">
      <h2 className={styles.AdmissionMetrics__title}>Entregas e intentos externos</h2>
      <h3 className={styles.AdmissionMetrics__subtitle}>Estado de las entregas</h3>
      {renderCounts([{ label: "En cola", value: deliveries.queued }, { label: "Aceptadas", value: deliveries.accepted }, { label: "Entregadas", value: deliveries.delivered }, { label: "Fallidas", value: deliveries.failed }, { label: "Desconocidas", value: deliveries.unknown }, { label: "Omitidas", value: deliveries.suppressed }, { label: "Canceladas", value: deliveries.cancelled }, { label: "Reservas de trabajo activas", value: deliveries.inFlightLeases }, { label: "Antigüedad de la cola", value: formatAdmissionObservationDuration(deliveries.oldestQueuedAgeMs) }])}
      <h3 className={styles.AdmissionMetrics__subtitle}>Intentos de contacto con el proveedor</h3>
      {renderCounts([{ label: "En curso", value: attempts.inFlight }, { label: "Aceptados", value: attempts.accepted }, { label: "Entregados", value: attempts.delivered }, { label: "Rechazados", value: attempts.rejected }, { label: "Desconocidos", value: attempts.unknown }])}
      <p className={styles.AdmissionMetrics__help}>Un intento potencialmente facturable consume cupo. La aceptación del proveedor no confirma la entrega; un resultado desconocido conserva su consumo mientras se consulta el original.</p>
    </section>
    <section className={styles.AdmissionMetrics__section} aria-label="Procesos y errores registrados">
      <h2 className={styles.AdmissionMetrics__title}>Procesos y errores registrados</h2>
      {maintenanceStaleness?.kind === "stale" && <p role="alert" className={styles.AdmissionMetrics__stale}>El mantenimiento no completa una ejecución desde hace {formatAdmissionObservationDuration(maintenanceStaleness.ageMs)}. Los avisos, los vencimientos y los reintentos pueden atrasarse hasta que vuelva a completarse.</p>}
      {maintenanceStaleness?.kind === "never" && <p role="alert" className={styles.AdmissionMetrics__stale}>El mantenimiento todavía no completó ninguna ejecución. Los avisos, los vencimientos y los reintentos pueden atrasarse hasta que lo haga.</p>}
      {metrics.maintenance?.lastCompletedAt && <p>Última ejecución completa del mantenimiento: <time dateTime={metrics.maintenance.lastCompletedAt}>{formatAdmissionObservationTime(metrics.maintenance.lastCompletedAt)}</time>.</p>}
      {metrics.lastSuccessfulRun ? <p>Última ejecución exitosa: {ADMISSION_METRIC_RUN_LABELS[metrics.lastSuccessfulRun.operation]}, <time dateTime={metrics.lastSuccessfulRun.at}>{formatAdmissionObservationTime(metrics.lastSuccessfulRun.at)}</time>.</p> : <p>Todavía no hay una ejecución exitosa registrada.</p>}
      {metrics.durations.length ? <div className={styles.AdmissionMetrics__scroll} role="region" aria-label="Tabla de tiempos observados" tabIndex={0}><table className={styles.AdmissionMetrics__table}><caption className={styles.AdmissionMetrics__caption}>Tiempos de las fases con muestras reales</caption><thead><tr><th scope="col">Fase</th><th scope="col">Muestras</th><th scope="col">Percentil 95</th></tr></thead><tbody>{metrics.durations.map((row) => <tr key={row.phase}><th scope="row">{ADMISSION_METRIC_PHASE_LABELS[row.phase]}</th><td>{row.sampleCount}</td><td>{formatAdmissionObservationDuration(row.p95Ms)}</td></tr>)}</tbody></table></div> : <p>No hay muestras de duración registradas.</p>}
      {metrics.errors.length ? <ul className={styles.AdmissionMetrics__errors}>{metrics.errors.map((error) => <li key={error.code}>{ADMISSION_ERROR_MESSAGE[error.code]} Cantidad: {error.count}.</li>)}</ul> : <p>No hay errores agregados registrados.</p>}
    </section>
  </div>;
}
