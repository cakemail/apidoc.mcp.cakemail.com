// ABOUTME: Tests for JWT-based authentication in lib/auth.ts.
// ABOUTME: Uses a generated RSA keypair to sign and verify mock tokens.

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { authenticateRequest, _resetForTesting } from "../lib/auth.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function signToken(payload: Record<string, unknown>, opts?: jwt.SignOptions): string {
  const defaults: jwt.SignOptions = {
    algorithm: "RS256",
    issuer: "urn:cakemail",
    ...("exp" in payload ? {} : { expiresIn: "1h" }),
  };
  return jwt.sign(payload, privateKey, { ...defaults, ...opts });
}

const validPayload = {
  id: 42,
  account_id: 100,
  email: "test@example.com",
  accounts: "100",
  lineage: "1-100",
  scopes: ["user"],
  tz: "UTC",
  user_key: "key123",
};

// Mock global fetch to serve the public key and /token endpoint
const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "https://api.cakemail.dev/token/pubkey") {
      return new Response(publicKey, { status: 200 });
    }

    if (url === "https://api.cakemail.dev/token") {
      return new Response(
        JSON.stringify({
          access_token: signToken(validPayload),
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  }) as typeof fetch;
});

beforeEach(() => {
  _resetForTesting();
  delete process.env.API_KEY;
});

describe("Bearer JWT authentication", () => {
  it("extracts userId and accountId from a valid JWT", async () => {
    const token = signToken(validPayload);
    const result = await authenticateRequest(`Bearer ${token}`);

    expect(result).toEqual({
      type: "cakemail",
      userId: "42",
      accountId: "100",
      accessToken: token,
    });
  });

  it("returns null for an expired JWT", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signToken({
      ...validPayload,
      iat: now - 120,
      exp: now - 60, // expired 60s ago, well past the 10s clock tolerance
    });
    const result = await authenticateRequest(`Bearer ${token}`);
    expect(result).toBeNull();
  });

  it("returns null for a JWT signed with wrong key", async () => {
    const { privateKey: otherKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const token = jwt.sign(validPayload, otherKey, {
      algorithm: "RS256",
      issuer: "urn:cakemail",
      expiresIn: "1h",
    });
    const result = await authenticateRequest(`Bearer ${token}`);
    expect(result).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    const result = await authenticateRequest("Bearer not.a.jwt");
    expect(result).toBeNull();
  });
});

describe("Basic auth with JWT verification", () => {
  it("exchanges credentials and extracts userId from returned JWT", async () => {
    const creds = Buffer.from("user@test.com:password123").toString("base64");
    const result = await authenticateRequest(`Basic ${creds}`);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("cakemail");
    expect(result!.userId).toBe("42");
    expect(result!.accountId).toBe("100");
  });
});

describe("Admin API key", () => {
  it("returns admin result when API_KEY matches", async () => {
    process.env.API_KEY = "admin-secret";
    const result = await authenticateRequest("Bearer admin-secret");

    expect(result).toEqual({
      type: "admin",
      userId: null,
      accountId: null,
      accessToken: "admin-secret",
    });
  });

  it("falls through to JWT verification when API_KEY does not match", async () => {
    process.env.API_KEY = "admin-secret";
    const token = signToken(validPayload);
    const result = await authenticateRequest(`Bearer ${token}`);

    expect(result).toEqual({
      type: "cakemail",
      userId: "42",
      accountId: "100",
      accessToken: token,
    });
  });
});

describe("edge cases", () => {
  it("returns null for missing auth header", async () => {
    expect(await authenticateRequest(undefined)).toBeNull();
  });

  it("returns null for unsupported scheme", async () => {
    expect(await authenticateRequest("Digest abc123")).toBeNull();
  });
});
