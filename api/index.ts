// ABOUTME: Landing page explaining what this MCP server is and how to connect.
// ABOUTME: Serves HTML at the root URL.

import type { VercelRequest, VercelResponse } from "@vercel/node";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>apidoc-mcp – MCP Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { color: #fff; font-size: 1.8rem; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    h2 { color: #fff; font-size: 1.2rem; margin: 2rem 0 0.75rem; }
    p { margin-bottom: 1rem; color: #ccc; }
    code {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 0.15rem 0.4rem;
      font-size: 0.9em;
      color: #e5e5e5;
    }
    pre {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    pre code { background: none; border: none; padding: 0; }
    .tools { display: grid; gap: 1rem; margin-bottom: 1rem; }
    .tool {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 1rem;
    }
    .tool h3 { color: #fff; font-size: 1rem; margin: 0 0 0.25rem; }
    .tool p { color: #999; margin-bottom: 0; font-size: 0.9rem; }
    .badge {
      display: inline-block;
      background: #1a3a1a;
      color: #4ade80;
      border: 1px solid #2d5a2d;
      border-radius: 12px;
      padding: 0.1rem 0.6rem;
      font-size: 0.75rem;
      margin-left: 0.5rem;
      vertical-align: middle;
    }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .note {
      background: #1a1a2e;
      border: 1px solid #2a2a4e;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
      color: #aab;
    }
    footer { margin-top: 3rem; color: #666; font-size: 0.85rem; border-top: 1px solid #222; padding-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>apidoc-mcp <span class="badge">MCP</span></h1>
    <p class="subtitle">Discover API endpoints through the Model Context Protocol.</p>

    <h2>What is this?</h2>
    <p>
      This is an <a href="https://modelcontextprotocol.io">MCP server</a> that lets AI assistants
      explore an API. It loads the full OpenAPI specification and exposes it through tools
      for discovery.
    </p>

    <h2>Available Tools</h2>
    <div class="tools">
      <div class="tool">
        <h3>list_endpoints</h3>
        <p>Browse available API endpoints. Filter by tag or search term.</p>
      </div>
      <div class="tool">
        <h3>get_endpoint</h3>
        <p>Get full details for a specific endpoint: parameters, request body schema, and response schema.</p>
      </div>
    </div>

    <h2>Connect with Claude Code</h2>
    <pre><code>claude mcp add apidoc-mcp \\
  --transport http \\
  https://apidoc.mcp.cakemail.com/api/mcp</code></pre>

    <h2>Connect with any MCP client</h2>
    <pre><code>{
  "mcpServers": {
    "apidoc-mcp": {
      "type": "streamable-http",
      "url": "https://apidoc.mcp.cakemail.com/api/mcp"
    }
  }
}</code></pre>

    <footer>
      Powered by the <a href="https://api.cakemail.dev/openapi.json">OpenAPI spec</a>.
    </footer>
  </div>
</body>
</html>`;

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
