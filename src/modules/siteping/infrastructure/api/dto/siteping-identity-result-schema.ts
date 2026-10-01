/** Validates the public identity DTO owned by TuTribu before mounting the widget. */
import { z } from "zod";

/** The identity endpoint exposes only widget access, display identity and project. */
export const sitepingIdentityResultSchema = z.object({
  enabled: z.boolean(),
  identity: z.object({ email: z.string(), name: z.string() }).nullable(),
  projectName: z.string().min(1),
});
