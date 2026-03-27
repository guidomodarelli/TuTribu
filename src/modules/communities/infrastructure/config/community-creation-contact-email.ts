import "server-only";

const CONTACT_EMAIL_ENV = "CONTACT_EMAIL";

export function getContactEmail(): string | null {
  const rawContactEmail = process.env[CONTACT_EMAIL_ENV]?.trim() ?? "";

  return rawContactEmail.length > 0 ? rawContactEmail : null;
}
