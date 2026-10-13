/** Provides a semantic responsive page surface for current admission settings workflows. @module admission-settings-page */
import type { ReactNode } from "react";
import { Link } from "@/components/navigation/link";
import styles from "./styles.module.scss";
/** @param props - Existing workflow content and optional safe navigation. @returns One main landmark with product spacing and ordinary navigation links. */
export function AdmissionSettingsPage({ children, title, links = [] }: { children: ReactNode; title?: string; links?: readonly { href: string; label: string }[] }) {
  return <main className={styles.AdmissionSettingsPage}>{title && <h1 className={styles.AdmissionSettingsPage__title}>{title}</h1>}{links.length > 0 && <nav className={styles.AdmissionSettingsPage__navigation} aria-label="Configuración de academia">{links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav>}{children}</main>;
}
