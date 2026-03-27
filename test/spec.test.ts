// ABOUTME: Tests for the OpenAPI spec loader and query functions.
// ABOUTME: Uses a minimal inline spec fixture to avoid network calls.

import { describe, it, expect } from "vitest";
import {
  listEndpoints,
  getEndpoint,
  resolveRefs,
  type OpenAPISpec,
} from "../lib/spec.js";

const fixture: OpenAPISpec = {
  openapi: "3.0.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/campaigns": {
      get: {
        operationId: "listCampaigns",
        summary: "List all campaigns",
        tags: ["Campaign"],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer" },
            description: "Page number",
          },
          {
            name: "per_page",
            in: "query",
            schema: { type: "integer" },
            description: "Items per page",
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
              schema: { $ref: "#/components/schemas/CampaignCreate" },
            },
          },
        },
      },
    },
    "/campaigns/{campaign_id}": {
      get: {
        operationId: "getCampaign",
        summary: "Get a campaign",
        tags: ["Campaign"],
        parameters: [
          {
            name: "campaign_id",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
      },
      delete: {
        operationId: "deleteCampaign",
        summary: "Delete a campaign",
        tags: ["Campaign"],
        parameters: [
          {
            name: "campaign_id",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
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
  components: {
    schemas: {
      CampaignCreate: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Campaign name" },
          sender: { $ref: "#/components/schemas/Sender" },
        },
      },
      Sender: {
        type: "object",
        properties: {
          email: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  },
};

describe("listEndpoints", () => {
  it("returns all endpoints when no filters", () => {
    const results = listEndpoints(fixture);
    expect(results).toHaveLength(5);
  });

  it("filters by tag", () => {
    const results = listEndpoints(fixture, { tag: "Campaign" });
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.tag === "Campaign")).toBe(true);
  });

  it("filters by tag case-insensitively", () => {
    const results = listEndpoints(fixture, { tag: "campaign" });
    expect(results).toHaveLength(4);
  });

  it("filters by search term in summary", () => {
    const results = listEndpoints(fixture, { search: "list" });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.operationId).sort()).toEqual([
      "listCampaigns",
      "listContacts",
    ]);
  });

  it("filters by search term in path", () => {
    const results = listEndpoints(fixture, { search: "campaign_id" });
    expect(results).toHaveLength(2);
  });

  it("combines tag and search filters", () => {
    const results = listEndpoints(fixture, {
      tag: "Campaign",
      search: "delete",
    });
    expect(results).toHaveLength(1);
    expect(results[0].operationId).toBe("deleteCampaign");
  });

  it("returns correct shape per endpoint", () => {
    const results = listEndpoints(fixture, { search: "listCampaigns" });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      method: "GET",
      path: "/campaigns",
      summary: "List all campaigns",
      operationId: "listCampaigns",
      tag: "Campaign",
    });
  });

  it("returns empty array for no matches", () => {
    const results = listEndpoints(fixture, { tag: "Nonexistent" });
    expect(results).toEqual([]);
  });
});

describe("getEndpoint", () => {
  it("returns endpoint details by path and method", () => {
    const result = getEndpoint(fixture, "/campaigns", "get");
    expect(result).not.toBeNull();
    expect(result!.operationId).toBe("listCampaigns");
    expect(result!.parameters).toHaveLength(2);
  });

  it("is case-insensitive on method", () => {
    const result = getEndpoint(fixture, "/campaigns", "GET");
    expect(result).not.toBeNull();
    expect(result!.operationId).toBe("listCampaigns");
  });

  it("returns null for nonexistent path", () => {
    const result = getEndpoint(fixture, "/nope", "get");
    expect(result).toBeNull();
  });

  it("returns null for nonexistent method", () => {
    const result = getEndpoint(fixture, "/campaigns", "delete");
    expect(result).toBeNull();
  });

  it("resolves $ref in request body schema", () => {
    const result = getEndpoint(fixture, "/campaigns", "post");
    expect(result).not.toBeNull();
    const schema =
      result!.requestBody?.content?.["application/json"]?.schema;
    expect(schema).toBeDefined();
    // Should be resolved, not a $ref
    expect(schema).toHaveProperty("type", "object");
    expect(schema).toHaveProperty("properties");
    expect(schema!.properties.name).toEqual({
      type: "string",
      description: "Campaign name",
    });
  });

  it("resolves nested $ref in request body schema", () => {
    const result = getEndpoint(fixture, "/campaigns", "post");
    const schema =
      result!.requestBody?.content?.["application/json"]?.schema;
    // sender was a $ref to Sender, should be resolved
    expect(schema!.properties.sender).toEqual({
      type: "object",
      properties: {
        email: { type: "string" },
        name: { type: "string" },
      },
    });
  });

  it("finds endpoint by operationId", () => {
    const result = getEndpoint(fixture, "createCampaign");
    expect(result).not.toBeNull();
    expect(result!.path).toBe("/campaigns");
    expect(result!.method).toBe("POST");
  });

  it("returns null for nonexistent operationId", () => {
    const result = getEndpoint(fixture, "doesNotExist");
    expect(result).toBeNull();
  });
});

describe("resolveRefs", () => {
  it("resolves a simple $ref", () => {
    const obj = { $ref: "#/components/schemas/Sender" };
    const resolved = resolveRefs(obj, fixture);
    expect(resolved).toEqual({
      type: "object",
      properties: {
        email: { type: "string" },
        name: { type: "string" },
      },
    });
  });

  it("passes through non-ref objects unchanged", () => {
    const obj = { type: "string", description: "hello" };
    const resolved = resolveRefs(obj, fixture);
    expect(resolved).toEqual(obj);
  });

  it("resolves nested refs in objects", () => {
    const obj = {
      type: "object",
      properties: {
        sender: { $ref: "#/components/schemas/Sender" },
      },
    };
    const resolved = resolveRefs(obj, fixture);
    expect(resolved.properties.sender).toEqual({
      type: "object",
      properties: {
        email: { type: "string" },
        name: { type: "string" },
      },
    });
  });

  it("resolves refs in arrays", () => {
    const obj = [{ $ref: "#/components/schemas/Sender" }, { type: "string" }];
    const resolved = resolveRefs(obj, fixture);
    expect(resolved[0]).toHaveProperty("type", "object");
    expect(resolved[1]).toEqual({ type: "string" });
  });

  it("handles circular refs by limiting depth", () => {
    const circularSpec: OpenAPISpec = {
      ...fixture,
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              child: { $ref: "#/components/schemas/Node" },
            },
          },
        },
      },
    };
    // Should not hang or throw — just stop resolving at depth limit
    const resolved = resolveRefs(
      { $ref: "#/components/schemas/Node" },
      circularSpec
    );
    expect(resolved).toHaveProperty("type", "object");
  });
});
