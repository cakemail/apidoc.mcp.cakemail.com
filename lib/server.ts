// ABOUTME: MCP server with tools for discovering and calling the Cakemail API.
// ABOUTME: Provides list_endpoints, get_endpoint, and call_api tools.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { loadSpec, listEndpoints, getEndpoint } from "./spec.js";
import { logToolCall } from "./supabase.js";
import type { AuthResult } from "./auth.js";

const CAKEMAIL_API = "https://api.cakemail.dev";

export function createServer(auth?: AuthResult): McpServer {
  const server = new McpServer({
    name: "cakemail-api",
    version: "1.0.0",
  });

  server.tool(
    "list_endpoints",
    "List available Cakemail API endpoints. Filter by tag (e.g. Campaign, Contact, Account) or search term. Returns a summary of each matching endpoint.",
    {
      tag: z
        .string()
        .optional()
        .describe(
          "Filter by API category tag (e.g. Campaign, Contact, Account, Domain, DKIM, Email API)"
        ),
      search: z
        .string()
        .optional()
        .describe(
          "Search term to filter endpoints by path, summary, or operationId"
        ),
    },
    async ({ tag, search }) => {
      logToolCall({
        userType: auth?.type ?? "unknown",
        userId: auth?.userId ?? null,
        accountId: auth?.accountId ?? null,
        tool: "list_endpoints",
        query: [tag && `tag:${tag}`, search].filter(Boolean).join(" ") || "*",
      }).catch(() => {});

      const spec = await loadSpec();
      const results = listEndpoints(spec, { tag, search });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No endpoints found matching your filters.",
            },
          ],
        };
      }

      const lines = results.map(
        (r) => `${r.method} ${r.path} — ${r.summary} [${r.tag}] (${r.operationId})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} endpoints:\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_endpoint",
    "Get full details for a specific Cakemail API endpoint including parameters, request body schema, and response schema. Look up by operationId or by path + method.",
    {
      operationId: z
        .string()
        .optional()
        .describe("The operationId of the endpoint (e.g. listCampaigns, createCampaign)"),
      path: z
        .string()
        .optional()
        .describe("The API path (e.g. /campaigns, /contacts/{contact_id})"),
      method: z
        .string()
        .optional()
        .describe("The HTTP method (e.g. GET, POST, PATCH, DELETE)"),
    },
    async ({ operationId, path, method }) => {
      logToolCall({
        userType: auth?.type ?? "unknown",
        userId: auth?.userId ?? null,
        accountId: auth?.accountId ?? null,
        tool: "get_endpoint",
        query: operationId ?? `${method} ${path}`,
      }).catch(() => {});

      const spec = await loadSpec();

      let detail;
      if (operationId) {
        detail = getEndpoint(spec, operationId);
      } else if (path && method) {
        detail = getEndpoint(spec, path, method);
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide either an operationId, or both path and method.",
            },
          ],
        };
      }

      if (!detail) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Endpoint not found. Use list_endpoints to discover available endpoints.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: formatEndpointDetail(detail),
          },
        ],
      };
    }
  );

  server.tool(
    "call_api",
    "Read data from the Cakemail API (GET only). Useful for verifying API behavior with real data.",
    {
      path: z.string().describe("API path (e.g. /campaigns, /contacts/123)"),
      query: z
        .record(z.string(), z.string())
        .optional()
        .describe("Query parameters as key-value pairs"),
    },
    async ({ path, query }) => {
      logToolCall({
        userType: auth?.type ?? "unknown",
        userId: auth?.userId ?? null,
        accountId: auth?.accountId ?? null,
        tool: "call_api",
        query: `GET ${path}`,
      }).catch(() => {});

      if (!auth?.accessToken) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No authentication context. Connect with Cakemail credentials to call the API.",
            },
          ],
        };
      }

      if (/^[a-z]+:\/\//i.test(path)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Invalid path: must be a relative path (e.g. /campaigns). Absolute URLs are not allowed.",
            },
          ],
        };
      }

      const url = new URL(path, CAKEMAIL_API);
      if (url.origin !== new URL(CAKEMAIL_API).origin) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Invalid path: URL must point to the Cakemail API.",
            },
          ],
        };
      }
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          url.searchParams.set(key, value);
        }
      }

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            Accept: "application/json",
          },
        });
        const contentType = response.headers.get("content-type") ?? "";
        let responseText: string;

        if (contentType.includes("application/json")) {
          const json = await response.json();
          responseText = JSON.stringify(json, null, 2);
        } else {
          responseText = await response.text();
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `${response.status} ${response.statusText}\n\n${responseText}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

function formatEndpointDetail(detail: {
  method: string;
  path: string;
  summary: string;
  description?: string;
  operationId: string;
  tag: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: Record<string, unknown>;
  }>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
}): string {
  const sections: string[] = [];

  sections.push(`${detail.method} ${detail.path}`);
  sections.push(`operationId: ${detail.operationId}`);
  sections.push(`Tag: ${detail.tag}`);
  sections.push(`Summary: ${detail.summary}`);

  if (detail.description) {
    sections.push(`\nDescription:\n${detail.description}`);
  }

  if (detail.parameters && detail.parameters.length > 0) {
    const paramLines = detail.parameters.map((p) => {
      const req = p.required ? " (required)" : "";
      const type = p.schema?.type ? ` [${p.schema.type}]` : "";
      const desc = p.description ? ` — ${p.description}` : "";
      return `  ${p.name}${type}${req}${desc} (in ${p.in})`;
    });
    sections.push(`\nParameters:\n${paramLines.join("\n")}`);
  }

  if (detail.requestBody) {
    sections.push(
      `\nRequest Body:\n${JSON.stringify(detail.requestBody, null, 2)}`
    );
  }

  if (detail.responses) {
    sections.push(
      `\nResponses:\n${JSON.stringify(detail.responses, null, 2)}`
    );
  }

  return sections.join("\n");
}
