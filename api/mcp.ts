// ABOUTME: Vercel serverless function that serves the MCP protocol over Streamable HTTP.
// ABOUTME: Authenticates via admin API key, Basic Auth (Cakemail credentials), or Bearer token.

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../lib/server.js";
import { authenticateRequest } from "../lib/auth.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.status(204).end();
    return;
  }

  const auth = await authenticateRequest(req.headers["authorization"]);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  if (req.method === "POST" || req.method === "GET") {
    const server = createServer(auth);
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
}
