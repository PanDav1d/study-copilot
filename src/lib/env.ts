import "server-only";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(500).default(50),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters long"),
  ALLOW_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Set by the desktop app (Tauri): per-launch secret for the local sign-in, and the chosen data folder.
  DESKTOP_TOKEN: z.string().min(32).optional(),
  DATA_DIR: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function uploadDir() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env().UPLOAD_DIR);
}

/** Running inside the desktop app: single local user, no passwords. */
export function isDesktop() {
  return !!env().DESKTOP_TOKEN;
}
