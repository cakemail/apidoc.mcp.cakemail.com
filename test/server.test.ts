// ABOUTME: Tests for the MCP server tool handlers.
// ABOUTME: Injects a fixture spec and validates tool output formatting.

import { describe, it, expect, beforeAll } from "vitest";
import { createServer } from "../lib/server.js";
import { setSpec, type OpenAPISpec } from "../lib/spec.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const fixture: OpenAPISpec = {
  openapi: "3.0.0",
  info: {
    title: "Test API",
    version: "1.0.0",
    description: "A test API",
  },
  paths: {
    "/campaigns": {
      get: {
        operationId: "listCampaigns",
        summary: "List all campaigns",
        description: "Returns a paginated list of campaigns.",
        tags: ["Campaign"],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer" },
            description: "Page number",
          },
        ],
      },
      post: {
        operationId: "createCampaign",
        summary: "Create a campaign",
        tags: ["Campaign"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    "/contacts": {
      get: {
        operationId: "listContacts",
        summary: "List contacts",
        tags: ["Contact"],
        parameters: [],
      },
    },
  },
  components: { schemas: {} },
};

let client: Client;

beforeAll(async () => {
  setSpec(fixture);
  const server = createServer({ type: "cakemail", userId: "1", accountId: "100", accessToken: "test-token" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
});

describe("list_endpoints tool", () => {
  it("lists all endpoints with no filters", async () => {
    const result = await client.callTool({
      name: "list_endpoints",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("GET /campaigns");
    expect(text).toContain("POST /campaigns");
    expect(text).toContain("GET /contacts");
    expect(text).toContain("listCampaigns");
  });

  it("filters by tag", async () => {
    const result = await client.callTool({
      name: "list_endpoints",
      arguments: { tag: "Campaign" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("GET /campaigns");
    expect(text).toContain("POST /campaigns");
    expect(text).not.toContain("GET /contacts");
  });

  it("filters by search", async () => {
    const result = await client.callTool({
      name: "list_endpoints",
      arguments: { search: "create" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("POST /campaigns");
    expect(text).not.toContain("GET /campaigns");
  });

  it("returns a message when no matches", async () => {
    const result = await client.callTool({
      name: "list_endpoints",
      arguments: { tag: "Nonexistent" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("No endpoints found");
  });
});

describe("get_endpoint tool", () => {
  it("returns details by path and method", async () => {
    const result = await client.callTool({
      name: "get_endpoint",
      arguments: { path: "/campaigns", method: "get" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("listCampaigns");
    expect(text).toContain("List all campaigns");
    expect(text).toContain("page");
  });

  it("returns details by operationId", async () => {
    const result = await client.callTool({
      name: "get_endpoint",
      arguments: { operationId: "createCampaign" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("createCampaign");
    expect(text).toContain("POST /campaigns");
  });

  it("returns error for nonexistent endpoint", async () => {
    const result = await client.callTool({
      name: "get_endpoint",
      arguments: { path: "/nope", method: "get" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("not found");
  });

  it("returns error when neither path+method nor operationId given", async () => {
    const result = await client.callTool({
      name: "get_endpoint",
      arguments: {},
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("operationId");
  });
});

describe("call_api tool", () => {
  it("returns error when no auth context", async () => {
    // Create a server without auth
    const noAuthServer = createServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await noAuthServer.connect(st);
    const noAuthClient = new Client({ name: "test", version: "1.0.0" });
    await noAuthClient.connect(ct);

    const result = await noAuthClient.callTool({
      name: "call_api",
      arguments: { path: "/campaigns" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("authentication");
  });

  it("rejects absolute URLs to prevent SSRF", async () => {
    const result = await client.callTool({
      name: "call_api",
      arguments: { path: "https://evil.com/steal" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Absolute URLs are not allowed");
  });

  it("rejects absolute URLs with other schemes", async () => {
    const result = await client.callTool({
      name: "call_api",
      arguments: { path: "ftp://evil.com/data" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Absolute URLs are not allowed");
  });
});
