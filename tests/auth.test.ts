import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { signSessionToken, verifySessionToken } from "@/lib/auth/token";

const secret = "a".repeat(40);

describe("password hashing", () => {
  it("verifies the correct password and rejects others", async () => {
    const hash = await hashPassword("korrekt-pferd-batterie");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("korrekt-pferd-batterie", hash)).toBe(true);
    expect(await verifyPassword("falsch", hash)).toBe(false);
  });

  it("uses a random salt", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "plain-text")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips the user id", async () => {
    const token = await signSessionToken("user1", secret);
    expect((await verifySessionToken(token, secret))?.userId).toBe("user1");
  });

  it("rejects tampered tokens and wrong secrets", async () => {
    const token = await signSessionToken("user1", secret);
    expect(await verifySessionToken(token, "b".repeat(40))).toBeNull();
    expect(await verifySessionToken(`${token}x`, secret)).toBeNull();
    expect(await verifySessionToken(undefined, secret)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.check("k", 0)).toBe(true);
    expect(limiter.check("k", 1)).toBe(true);
    expect(limiter.check("k", 2)).toBe(false);
    expect(limiter.check("k", 1001)).toBe(true);
  });
});
