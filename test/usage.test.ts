// ABOUTME: Tests for the /api/usage endpoint handler.
// ABOUTME: Verifies admin and user auth paths and stats filtering.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/auth.js", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("../lib/supabase.js", () => ({
  getUsageStats: vi.fn(),
  getAdminUsageStats: vi.fn(),
}));

import handler from "../api/usage.js";
import { authenticateRequest } from "../lib/auth.js";
import { getUsageStats, getAdminUsageStats } from "../lib/supabase.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const mockAuth = vi.mocked(authenticateRequest);
const mockStats = vi.mocked(getUsageStats);
const mockAdminStats = vi.mocked(getAdminUsageStats);

function createReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: "GET",
    headers: { authorization: "Bearer test-token" },
    query: {},
    ...overrides,
  } as unknown as VercelRequest;
}

function createRes(): VercelResponse & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res as unknown as VercelResponse & { _status: number; _body: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.API_KEY;
});

describe("/api/usage", () => {
  it("rejects non-GET methods", async () => {
    const res = createRes();
    await handler(createReq({ method: "POST" }), res);
    expect(res._status).toBe(405);
  });

  it("returns 401 when no auth header", async () => {
    mockAuth.mockResolvedValue(null);
    const res = createRes();
    await handler(createReq({ headers: {} }), res);
    expect(res._status).toBe(401);
  });

  it("returns 401 when auth succeeds but userId is null", async () => {
    mockAuth.mockResolvedValue({ type: "admin", userId: null, accessToken: "k" });
    const res = createRes();
    await handler(createReq(), res);
    expect(res._status).toBe(401);
  });

  it("returns user stats for authenticated Cakemail user", async () => {
    mockAuth.mockResolvedValue({ type: "cakemail", userId: "42", accessToken: "t" });
    mockStats.mockResolvedValue({ total: 3, byTool: [{ tool: "call_api", count: 3 }] });
    const res = createRes();
    await handler(createReq(), res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ total: 3, byTool: [{ tool: "call_api", count: 3 }] });
    expect(mockStats).toHaveBeenCalledWith({ userId: "42", since: undefined, until: undefined });
    expect(mockAdminStats).not.toHaveBeenCalled();
  });

  it("passes date range filters for user stats", async () => {
    mockAuth.mockResolvedValue({ type: "cakemail", userId: "42", accessToken: "t" });
    mockStats.mockResolvedValue({ total: 0, byTool: [] });
    const res = createRes();
    await handler(createReq({ query: { since: "2026-01-01", until: "2026-03-01" } }), res);

    expect(mockStats).toHaveBeenCalledWith({ userId: "42", since: "2026-01-01", until: "2026-03-01" });
  });
});

describe("/api/usage (admin)", () => {
  it("returns admin stats when API_KEY matches", async () => {
    process.env.API_KEY = "secret-admin-key";
    const adminStats = { total: 10, byUser: [{ user_type: "cakemail", user_id: "42", count: 10 }] };
    mockAdminStats.mockResolvedValue(adminStats);
    const res = createRes();
    await handler(createReq({ headers: { authorization: "Bearer secret-admin-key" } }), res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual(adminStats);
    expect(mockAdminStats).toHaveBeenCalledWith({ since: undefined, until: undefined });
    expect(mockStats).not.toHaveBeenCalled();
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("passes date range filters for admin stats", async () => {
    process.env.API_KEY = "secret-admin-key";
    mockAdminStats.mockResolvedValue({ total: 0, byUser: [] });
    const res = createRes();
    await handler(
      createReq({
        headers: { authorization: "Bearer secret-admin-key" },
        query: { since: "2026-01-01", until: "2026-03-01" },
      }),
      res
    );

    expect(mockAdminStats).toHaveBeenCalledWith({ since: "2026-01-01", until: "2026-03-01" });
  });

  it("does not grant admin when API_KEY env var is not set", async () => {
    mockAuth.mockResolvedValue(null);
    const res = createRes();
    await handler(createReq({ headers: { authorization: "Bearer some-key" } }), res);

    expect(res._status).toBe(401);
    expect(mockAdminStats).not.toHaveBeenCalled();
  });

  it("does not grant admin when token does not match API_KEY", async () => {
    process.env.API_KEY = "secret-admin-key";
    mockAuth.mockResolvedValue(null);
    const res = createRes();
    await handler(createReq({ headers: { authorization: "Bearer wrong-key" } }), res);

    expect(res._status).toBe(401);
    expect(mockAdminStats).not.toHaveBeenCalled();
  });

  it("rejects admin auth without Bearer prefix", async () => {
    process.env.API_KEY = "secret-admin-key";
    mockAuth.mockResolvedValue(null);
    const res = createRes();
    await handler(createReq({ headers: { authorization: "secret-admin-key" } }), res);

    expect(res._status).toBe(401);
    expect(mockAdminStats).not.toHaveBeenCalled();
  });
});
