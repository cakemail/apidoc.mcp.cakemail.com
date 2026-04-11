// ABOUTME: Vercel serverless function that serves the MCP protocol over Streamable HTTP.
// ABOUTME: No user auth required — this is a spec browser, not a data access point.

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../lib/server.js";
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


  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const auth = req.headers["authorization"];
    const token =
      typeof auth === "string" && auth.startsWith("Bearer ")
        ? auth.slice(7)
        : null;
    if (token !== apiKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }


  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  if (req.method === "POST" || req.method === "GET") {
    const server = createServer();
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
}
