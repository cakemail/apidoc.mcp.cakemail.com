// ABOUTME: Endpoint for viewing tool usage statistics.
// ABOUTME: Admin (API_KEY) sees all-user stats; Cakemail users see their own.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "../lib/auth.js";
import { getUsageStats, getAdminUsageStats } from "../lib/supabase.js";

function authenticateAdmin(req: VercelRequest): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return false;

  const auth = req.headers["authorization"];
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return false;

  return auth.slice(7) === apiKey;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;

  if (authenticateAdmin(req)) {
    const stats = await getAdminUsageStats({ since, until });
    res.status(200).json(stats);
    return;
  }

  const auth = await authenticateRequest(req.headers["authorization"]);
  if (!auth || !auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const stats = await getUsageStats({ userId: auth.userId, since, until });
  res.status(200).json(stats);
}
