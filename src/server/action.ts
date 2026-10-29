import "server-only";
import type { z } from "zod";
import { fieldErrors, type FieldErrors } from "@/lib/validation";
import { requireUserOrThrow, UnauthorizedError, type CurrentUser } from "./auth";
import { UserError } from "./errors";

export { NotFoundError, UserError } from "./errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/**
 * Wraps a server action: authenticates, validates input with zod and maps
 * errors to a serialisable result. Unexpected errors are logged, not leaked.
 */
export function authedAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>, user: CurrentUser) => Promise<T>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await requireUserOrThrow();
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const errors = fieldErrors(parsed.error);
        const first = Object.values(errors).flat()[0] ?? parsed.error.issues[0]?.message;
        return { ok: false, error: first ?? "Ungültige Eingabe", fieldErrors: errors };
      }
      const data = await handler(parsed.data, user);
      return { ok: true, data };
    } catch (error) {
      if (error instanceof UserError || error instanceof UnauthorizedError) {
        return { ok: false, error: error.message };
      }
      console.error("[action] unexpected error", error);
      return { ok: false, error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }
  };
}
