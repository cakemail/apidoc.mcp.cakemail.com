// ABOUTME: MCP server with tools for discovering API endpoints.
// ABOUTME: Provides list_endpoints and get_endpoint tools.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { loadSpec, listEndpoints, getEndpoint } from "./spec.js";


export function createServer(): McpServer {
  const server = new McpServer({
    name: "apidoc-mcp",
    version: "1.0.0",
  });

  server.tool(
    "list_endpoints",
    "List available API endpoints. Filter by tag or search term. Returns a summary of each matching endpoint.",
    {
      tag: z
        .string()
        .optional()
        .describe("Filter by API category tag"),
      search: z
        .string()
        .optional()
        .describe("Search term to filter endpoints by path, summary, or operationId"),
    },
    async ({ tag, search }) => {

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
    "Get full details for a specific API endpoint including parameters, request body schema, and response schema. Look up by operationId or by path + method.",
    {
      operationId: z
        .string()
        .optional()
        .describe("The operationId of the endpoint"),
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
              text: "Endpoint not found. Use list_endpoints to discover available endpoints.",
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
