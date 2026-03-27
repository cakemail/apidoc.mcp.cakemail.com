// ABOUTME: Proxy endpoint for Cakemail token authentication.
// ABOUTME: Accepts username/password, returns access and refresh tokens.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createToken, refreshToken } from "../lib/auth.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { grant_type, username, password, account_id, refresh_token } =
    req.body ?? {};

  if (grant_type === "refresh_token") {
    if (!refresh_token) {
      res.status(400).json({ error: "refresh_token is required" });
      return;
    }
    const result = await refreshToken(refresh_token);
    if ("status" in result) {
      res.status(result.status as number).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
    return;
  }

  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const result = await createToken({
    username,
    password,
    account_id: account_id != null ? Number(account_id) : undefined,
  });

  if ("status" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(200).json(result);
}
