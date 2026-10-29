import { Button } from "@golfo/ui";

const TRIBE_EVENT_RETRY_BUTTON_COPY = {
  retry: "Reintentar",
} as const;

const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantSecondary: "secondary",
} as const;

/**
 * Small secondary button that retries a failed load of an event panel.
 * @param props - Retry handler.
 * @returns The retry button.
 */
export function TribeEventRetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button
      size={BUTTON_ATTRIBUTE.sizeSmall}
      type={BUTTON_ATTRIBUTE.typeButton}
      variant={BUTTON_ATTRIBUTE.variantSecondary}
      onClick={onRetry}
    >
      {TRIBE_EVENT_RETRY_BUTTON_COPY.retry}
    </Button>
  );
}
