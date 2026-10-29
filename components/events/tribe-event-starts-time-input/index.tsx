import { Input } from "@golfo/ui";

const TRIBE_EVENT_STARTS_TIME_INPUT_COPY = {
  startsTimeLabel: "Hora de inicio",
} as const;

const TIME_INPUT_TYPE = "time";

type TribeEventStartsTimeInputProps = {
  /** Validation message shown under the control, if any. */
  error?: string;
  id: string;
  onValueChange: (value: string) => void;
  value: string;
};

/**
 * Required start time control of the event forms (Buenos Aires wall clock).
 * @param props - Control id, value, change handler and validation message.
 * @returns The start time input.
 */
export function TribeEventStartsTimeInput({
  error,
  id,
  onValueChange,
  value,
}: TribeEventStartsTimeInputProps) {
  return (
    <Input
      error={error}
      id={id}
      label={TRIBE_EVENT_STARTS_TIME_INPUT_COPY.startsTimeLabel}
      required
      type={TIME_INPUT_TYPE}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    />
  );
}
