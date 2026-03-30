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
  accountId: string | null;
  tool: string;
  query: string;
}): Promise<void> {
  const db = getClient();
  await db.from("query_logs").insert({
    user_type: params.userType,
    user_id: params.userId,
    account_id: params.accountId,
    query: `[${params.tool}] ${params.query}`,
    source: SOURCE,
  });
}

export async function getUsageStats(params: {
  userId: string;
  since?: string;
  until?: string;
}): Promise<{
  total: number;
  byTool: { tool: string; count: number }[];
}> {
  const db = getClient();
  let query = db
    .from("query_logs")
    .select("query, created_at")
    .eq("source", SOURCE)
    .eq("user_id", params.userId);

  if (params.since) {
    query = query.gte("created_at", params.since);
  }
  if (params.until) {
    query = query.lte("created_at", params.until);
  }

  const { data, error } = await query;
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data) {
    const match = (row.query as string).match(/^\[(\w+)\]/);
    const tool = match ? match[1] : "unknown";
    counts.set(tool, (counts.get(tool) ?? 0) + 1);
  }

  return {
    total: data.length,
    byTool: Array.from(counts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function getAdminUsageStats(params?: {
  since?: string;
  until?: string;
}): Promise<{
  total: number;
  byUser: { user_type: string; user_id: string | null; account_id: string | null; count: number }[];
}> {
  const db = getClient();
  let query = db
    .from("query_logs")
    .select("user_type, user_id, account_id, created_at")
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
    { user_type: string; user_id: string | null; account_id: string | null; count: number }
  >();
  for (const row of data) {
    const key = `${row.user_type}:${row.user_id ?? "admin"}:${row.account_id ?? ""}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        user_type: row.user_type,
        user_id: row.user_id,
        account_id: row.account_id,
        count: 1,
      });
    }
  }

  return {
    total: data.length,
    byUser: Array.from(counts.values()).sort((a, b) => b.count - a.count),
  };
}
