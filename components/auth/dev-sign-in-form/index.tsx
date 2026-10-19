"use client";

import { useId, useState, type FormEvent } from "react";

import { Button, Input } from "@golfo/ui";
import {
  DEV_SIGN_IN_RESULT,
  type DevSignInResult,
} from "@/src/modules/auth/constants/dev-sign-in";
import { startDevSignIn } from "@/src/modules/auth/infrastructure/better-auth/client";
import styles from "./styles.module.scss";

type DevSignInFormProps = {
  callbackUrl: string;
  defaultEmail: string;
};

const DEV_SIGN_IN_FORM_COPY = {
  description:
    "Solo en el servidor local. Usá las credenciales DEV_SIGN_IN_* de tu .env.local.",
  emailLabel: "Email",
  emptyFields: "Completá el email y la contraseña.",
  passwordLabel: "Contraseña",
  submit: "Entrar sin Google",
  title: "Acceso de desarrollo",
} as const;

const DEV_SIGN_IN_ERROR_COPY = {
  [DEV_SIGN_IN_RESULT.failed]:
    "No pudimos iniciar sesión. Revisá la consola del servidor e intentá de nuevo.",
  [DEV_SIGN_IN_RESULT.invalidCredentials]:
    "El email o la contraseña no coinciden con el usuario de desarrollo.",
} as const satisfies Partial<Record<DevSignInResult, string>>;

/**
 * Email and password form of the development-only sign-in. The sign-in page
 * renders it only when the server registered that method (`next dev` with
 * `DEV_SIGN_IN` set). A successful sign-in loads the callback page from
 * scratch because the whole app must re-render with the new session.
 */
export function DevSignInForm({ callbackUrl, defaultEmail }: DevSignInFormProps) {
  const formId = useId();
  const emailInputId = `${formId}-email`;
  const passwordInputId = `${formId}-password`;
  const errorId = `${formId}-error`;
  const titleId = `${formId}-title`;
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!email.trim() || !password) {
      setErrorMessage(DEV_SIGN_IN_FORM_COPY.emptyFields);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    const result = await startDevSignIn(email.trim(), password);

    if (result === DEV_SIGN_IN_RESULT.signedIn) {
      window.location.assign(callbackUrl);
      return;
    }

    setErrorMessage(DEV_SIGN_IN_ERROR_COPY[result]);
    setIsSubmitting(false);
  };

  return (
    <form
      aria-labelledby={titleId}
      className={styles.DevSignInForm}
      noValidate
      onSubmit={handleSubmit}
    >
      <h2 className={styles.DevSignInForm__title} id={titleId}>
        {DEV_SIGN_IN_FORM_COPY.title}
      </h2>
      <p className={styles.DevSignInForm__description}>
        {DEV_SIGN_IN_FORM_COPY.description}
      </p>
      <label className={styles.DevSignInForm__field} htmlFor={emailInputId}>
        <span>{DEV_SIGN_IN_FORM_COPY.emailLabel}</span>
        <Input
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={errorMessage ? true : undefined}
          autoComplete="username"
          id={emailInputId}
          onChange={(event) => setEmail(event.currentTarget.value)}
          type="email"
          value={email}
        />
      </label>
      <label className={styles.DevSignInForm__field} htmlFor={passwordInputId}>
        <span>{DEV_SIGN_IN_FORM_COPY.passwordLabel}</span>
        <Input
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={errorMessage ? true : undefined}
          autoComplete="current-password"
          id={passwordInputId}
          onChange={(event) => setPassword(event.currentTarget.value)}
          type="password"
          value={password}
        />
      </label>
      {errorMessage ? (
        <p className={styles.DevSignInForm__error} id={errorId} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Button
        className={styles.DevSignInForm__submit}
        loading={isSubmitting}
        type="submit"
        variant="secondary"
      >
        {DEV_SIGN_IN_FORM_COPY.submit}
      </Button>
    </form>
  );
}
