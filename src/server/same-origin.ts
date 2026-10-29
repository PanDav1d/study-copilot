import "server-only";
import type { NextRequest } from "next/server";

/** CSRF protection for route handlers that accept uploads: the request must come from this origin. */
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
