# apidoc.mcp.cakemail.com

MCP server that lets AI assistants discover and call the Cakemail API. Loads the OpenAPI specification dynamically and exposes it through three tools for discovery and execution. Deployed on Vercel.

## Architecture

```
api.cakemail.dev/openapi.json  →  Loaded into memory on first request
                                        ↓
                                  MCP Server (Vercel)
                                  ├── list_endpoints   (browse/search)
                                  ├── get_endpoint     (full details)
                                  └── call_api         (execute)
                                        ↑
                                  AI Assistant (Claude, Cursor, etc.)
```

- **Source**: OpenAPI spec fetched from `https://api.cakemail.dev/openapi.json`
- **Spec size**: ~470KB, 222 operations, 497 schemas
- **Transport**: MCP Streamable HTTP protocol

## MCP Tools

### `list_endpoints`

Browse available API endpoints with optional filters.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `tag`     | string | no       | Filter by category (e.g. Campaign, Contact, Account) |
| `search`  | string | no       | Search in path, summary, or operationId |

### `get_endpoint`

Get full details for a specific endpoint (parameters, request/response schemas).

| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `operationId` | string | no       | Endpoint operationId (e.g. listCampaigns) |
| `path`        | string | no       | API path (e.g. /campaigns) |
| `method`      | string | no       | HTTP method (e.g. GET, POST) |

Provide either `operationId` or both `path` + `method`.

### `call_api`

Execute a Cakemail API call using your authenticated credentials.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `method`  | string | yes      | HTTP method (GET, POST, PATCH, DELETE) |
| `path`    | string | yes      | API path (e.g. /campaigns) |
| `query`   | object | no       | Query parameters as key-value pairs |
| `body`    | object | no       | JSON request body |

## Authentication

Two methods are supported:

- **Basic Auth** — use your Cakemail email and password (recommended for MCP clients)
- **Bearer token** — admin API key or a Cakemail access token from `/api/auth`

### Generate your Basic Auth credentials

```bash
echo -n 'you@example.com:your-password' | base64
```

### Get a token via `/api/auth`

```bash
curl -X POST https://apidoc.mcp.cakemail.com/api/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"you@example.com","password":"your-password"}'
```

## Connecting to the MCP Server

### Claude Code

```bash
claude mcp add cakemail-api \
  --transport http \
  https://apidoc.mcp.cakemail.com/api/mcp \
  --header "Authorization: Basic BASE64_ENCODED_CREDENTIALS"
```

### Any MCP client

```json
{
  "mcpServers": {
    "cakemail-api": {
      "type": "streamable-http",
      "url": "https://apidoc.mcp.cakemail.com/api/mcp",
      "headers": {
        "Authorization": "Basic BASE64_ENCODED_CREDENTIALS"
      }
    }
  }
}
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/mcp` | POST/GET | Basic or Bearer | MCP Streamable HTTP endpoint |
| `/api/auth` | POST | None | Get access token with Cakemail credentials |
| `/api/usage` | GET | Admin API key | Tool usage stats. Optional: `?since=2026-03-01&until=2026-03-31` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `API_KEY` | Admin API key for service authentication |
| `SUPABASE_URL` | Shared Supabase project URL (same as kb.mcp) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |

## Development

```bash
npm install
npm test            # run tests
npm run test:watch  # run tests in watch mode
```
