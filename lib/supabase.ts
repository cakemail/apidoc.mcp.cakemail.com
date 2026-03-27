// ABOUTME: Supabase client for logging MCP tool usage and querying stats.
// ABOUTME: Writes to the shared query_logs table with source='apidoc'.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SOURCE = "apidoc";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return client;
}

export async function logToolCall(params: {
  userType: string;
  userId: string | null;
  tool: string;
  query: string;
}): Promise<void> {
  const db = getClient();
  await db.from("query_logs").insert({
    user_type: params.userType,
    user_id: params.userId,
    query: `[${params.tool}] ${params.query}`,
    source: SOURCE,
  });
}

export async function getUsageStats(params?: {
  since?: string;
  until?: string;
}): Promise<{
  total: number;
  byUser: { user_type: string; user_id: string | null; count: number }[];
}> {
  const db = getClient();
  let query = db
    .from("query_logs")
    .select("user_type, user_id, created_at")
    .eq("source", SOURCE);

  if (params?.since) {
    query = query.gte("created_at", params.since);
  }
  if (params?.until) {
    query = query.lte("created_at", params.until);
  }

  const { data, error } = await query;
  if (error) throw error;

  const counts = new Map<
    string,
    { user_type: string; user_id: string | null; count: number }
  >();
  for (const row of data) {
    const key = `${row.user_type}:${row.user_id ?? "admin"}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        user_type: row.user_type,
        user_id: row.user_id,
        count: 1,
      });
    }
  }

  return {
    total: data.length,
    byUser: Array.from(counts.values()).sort((a, b) => b.count - a.count),
  };
}
