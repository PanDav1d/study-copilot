import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";
import { EMBED_HEADER } from "@/lib/constants";

const PUBLIC_PATHS = ["/login", "/register", "/api/desktop/session"];

/**
 * First line of defence: redirect unauthenticated page requests to /login.
 * Every server action, route handler and page additionally calls `requireUser()`.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.AUTH_SECRET ?? "",
  );

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  // Logged-in users on /login are redirected by the page itself (it checks that
  // the user still exists – a valid token for a deleted user must not loop).
  // `?embed=1`: the page is shown in the split pane – rendered without the app shell.
  if (request.nextUrl.searchParams.get("embed") === "1") {
    const headers = new Headers(request.headers);
    headers.set(EMBED_HEADER, "1");
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.next();
}

export const config = {
  // Skip static assets (incl. the pdf.js worker) and the PDF upload endpoint (it
  // authenticates itself and must not be buffered by the proxy because of its size).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|pdfjs/|api/documents/upload).*)"],
};
