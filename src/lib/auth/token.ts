import { SignJWT, jwtVerify } from "jose";

/** Edge-compatible session token helpers (used by proxy and server code). */
export const SESSION_COOKIE = "sc_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string, secret: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined, secret: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? { userId: payload.sub, issuedAt: payload.iat ?? 0 } : null;
  } catch {
    return null;
  }
}
