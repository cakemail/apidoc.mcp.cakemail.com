// ABOUTME: Admin-only endpoint for viewing tool usage statistics.
// ABOUTME: Returns per-user call counts with optional date range filtering.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUsageStats } from "../lib/supabase.js";

function authenticate(req: VercelRequest): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return true;

  const auth = req.headers["authorization"];
  if (!auth) return false;

  const token =
    typeof auth === "string" && auth.startsWith("Bearer ")
      ? auth.slice(7)
      : auth;
  return token === apiKey;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!authenticate(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const since = req.query.since as string | undefined;
  const until = req.query.until as string | undefined;

  const stats = await getUsageStats({ since, until });
  res.status(200).json(stats);
}
