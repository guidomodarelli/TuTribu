"use client";
/** Explains, before any write, that the platform cannot protect this section yet and only the TuTribu team can fix it. @module platform-security-notice */
import { useState } from "react";
import { Button, toast } from "@golfo/ui";
import { openSitepingReport } from "@/lib/siteping/siteping-report-launcher";
import type { PlatformSecurityRequirement } from "@/src/modules/shared/domain/value-objects/platform-security-requirement";
import { PLATFORM_SECURITY_DIAGNOSTIC_CODE, PLATFORM_SECURITY_NOTICE_COPY, PLATFORM_SECURITY_REQUIREMENT_COPY } from "@/src/modules/academy-admissions/constants/platform-security-notice";
import styles from "./styles.module.scss";

type PlatformSecurityNoticeProps = {
  /** Requirement the current read reported. */
  requirement: PlatformSecurityRequirement;
  /** What stays unavailable on this screen; defaults to the generic consequence. */
  consequence?: string;
  /** Rereads the requirement; without it the notice offers no recheck. */
  onRecheck?: () => void;
  /** True while that recheck runs. */
  rechecking?: boolean;
  /** True while another read or write of the screen runs, so the recheck waits. */
  busy?: boolean;
};

/**
 * @param props - Current platform requirement, the screen's own consequence and its optional recheck.
 * @returns A callout with the reason, a copyable diagnostic code, a recheck when the screen can reread the requirement and a report action; it never offers a write.
 */
export function PlatformSecurityNotice({ requirement, consequence = PLATFORM_SECURITY_NOTICE_COPY.consequence, onRecheck, rechecking = false, busy = false }: PlatformSecurityNoticeProps) {
  const [reportUnavailable, setReportUnavailable] = useState(false);
  const code = PLATFORM_SECURITY_DIAGNOSTIC_CODE[requirement];
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.success(PLATFORM_SECURITY_NOTICE_COPY.copied); }
    catch { toast.error(PLATFORM_SECURITY_NOTICE_COPY.copyFailed); }
  };
  return <section className={styles.PlatformSecurityNotice} aria-label={PLATFORM_SECURITY_NOTICE_COPY.title}>
    <p className={styles.PlatformSecurityNotice__title}>{PLATFORM_SECURITY_NOTICE_COPY.title}</p>
    <p className={styles.PlatformSecurityNotice__reason}>{PLATFORM_SECURITY_REQUIREMENT_COPY[requirement]}</p>
    <p className={styles.PlatformSecurityNotice__note}>{consequence}</p>
    <p className={styles.PlatformSecurityNotice__diagnostic}>{PLATFORM_SECURITY_NOTICE_COPY.diagnosticLabel}: <code className={styles.PlatformSecurityNotice__code}>{code}</code></p>
    <div className={styles.PlatformSecurityNotice__actions}>
      {onRecheck && <Button variant="secondary" size="sm" loading={rechecking} disabled={busy && !rechecking} onClick={onRecheck}>{PLATFORM_SECURITY_NOTICE_COPY.recheck}</Button>}
      <Button variant="ghost" size="sm" aria-label={`${PLATFORM_SECURITY_NOTICE_COPY.copy} ${code}`} onClick={() => void copy()}>{PLATFORM_SECURITY_NOTICE_COPY.copy}</Button>
      <Button variant="ghost" size="sm" onClick={() => setReportUnavailable(!openSitepingReport())}>{PLATFORM_SECURITY_NOTICE_COPY.report}</Button>
    </div>
    {reportUnavailable && <p role="status" className={styles.PlatformSecurityNotice__note}>{PLATFORM_SECURITY_NOTICE_COPY.reportUnavailable}</p>}
  </section>;
}
