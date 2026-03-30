// ABOUTME: Authenticates requests via admin API key, Basic Auth with Cakemail credentials, or Bearer token.
// ABOUTME: Verifies Bearer JWTs locally using the Cakemail public key.

import { JwtService } from "@cakemail-org/ngapi-ts-auth-middleware";

const CAKEMAIL_API = "https://api.cakemail.dev";

export interface AuthResult {
  type: "admin" | "cakemail";
  userId: string | null;
  accountId: string | null;
  accessToken: string;
}

let jwtService: JwtService | null = null;

async function getJwtService(): Promise<JwtService> {
  if (jwtService) return jwtService;
  const response = await fetch(`${CAKEMAIL_API}/token/pubkey`);
  if (!response.ok) throw new Error("Failed to fetch public key");
  const publicKey = await response.text();
  jwtService = new JwtService(publicKey);
  return jwtService;
}

const sessionCache = new Map<
  string,
  { result: AuthResult; expiresAt: number }
>();

/** Reset module-level caches. Exported for testing only. */
export function _resetForTesting(): void {
  jwtService = null;
  sessionCache.clear();
}

function parseAuthHeader(
  authHeader: string | string[] | undefined
): { scheme: "bearer" | "basic"; value: string } | null {
  if (!authHeader) return null;
  const header = typeof authHeader === "string" ? authHeader : authHeader[0];

  if (header.startsWith("Bearer ")) {
    return { scheme: "bearer", value: header.slice(7) };
  }
  if (header.startsWith("Basic ")) {
    return { scheme: "basic", value: header.slice(6) };
  }
  return null;
}

function decodeBasicAuth(
  encoded: string
): { username: string; password: string } | null {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;
    return {
      username: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    };
  } catch {
    return null;
  }
}

async function loginWithCredentials(
  username: string,
  password: string
): Promise<AuthResult | null> {
  const cacheKey = `basic:${username}`;
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  try {
    const response = await fetch(`${CAKEMAIL_API}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    const svc = await getJwtService();
    const decoded = await svc.verify(data.access_token);

    const result: AuthResult = {
      type: "cakemail",
      userId: String(decoded.id),
      accountId: String(decoded.account_id),
      accessToken: data.access_token,
    };

    sessionCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    return result;
  } catch {
    return null;
  }
}

async function validateBearerToken(
  token: string
): Promise<AuthResult | null> {
  try {
    const svc = await getJwtService();
    const decoded = await svc.verify(token);

    return {
      type: "cakemail",
      userId: String(decoded.id),
      accountId: String(decoded.account_id),
      accessToken: token,
    };
  } catch {
    return null;
  }
}

export async function authenticateRequest(
  authHeader: string | string[] | undefined
): Promise<AuthResult | null> {
  const parsed = parseAuthHeader(authHeader);
  if (!parsed) return null;

  if (parsed.scheme === "bearer") {
    const apiKey = process.env.API_KEY;
    if (apiKey && parsed.value === apiKey) {
      return { type: "admin", userId: null, accountId: null, accessToken: parsed.value };
    }
    return validateBearerToken(parsed.value);
  }

  if (parsed.scheme === "basic") {
    const credentials = decodeBasicAuth(parsed.value);
    if (!credentials) return null;
    return loginWithCredentials(credentials.username, credentials.password);
  }

  return null;
}

export async function createToken(params: {
  username: string;
  password: string;
  account_id?: number;
}): Promise<
  | {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token: string;
      accounts: number[];
    }
  | { error: string; status: number }
> {
  const body = new URLSearchParams({
    grant_type: "password",
    username: params.username,
    password: params.password,
  });
  if (params.account_id != null) {
    body.set("account_id", String(params.account_id));
  }

  const response = await fetch(`${CAKEMAIL_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return { error: text, status: response.status };
  }

  return response.json();
}

export async function refreshToken(
  refreshTokenValue: string
): Promise<Record<string, unknown> | { error: string; status: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
  });

  const response = await fetch(`${CAKEMAIL_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return { error: text, status: response.status };
  }

  return response.json();
}
