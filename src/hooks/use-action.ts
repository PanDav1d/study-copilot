"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { FieldErrors } from "@/lib/validation";

type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: FieldErrors };

/**
 * Runs a server action, shows errors as toasts and refreshes server components.
 * Returns the data on success, undefined on failure.
 */
export function useAction<I, T>(
  action: (input: I) => Promise<Result<T>>,
  opts: { success?: string; refresh?: boolean } = {},
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { success, refresh = true } = opts;

  const run = useCallback(
    (input: I) =>
      new Promise<T | undefined>((resolve) => {
        startTransition(async () => {
          let result: Result<T>;
          try {
            result = await action(input);
          } catch {
            toast.error("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
            resolve(undefined);
            return;
          }
          if (!result.ok) {
            setFieldErrors(result.fieldErrors ?? {});
            toast.error(result.error);
            resolve(undefined);
            return;
          }
          setFieldErrors({});
          if (success) toast.success(success);
          if (refresh) router.refresh();
          // Actions without a return value still need a defined result – callers test `!== undefined`.
          resolve(result.data === undefined ? (null as T) : result.data);
        });
      }),
    [action, router, success, refresh],
  );

  return { run, pending, fieldErrors, setFieldErrors };
}
