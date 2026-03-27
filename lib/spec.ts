// ABOUTME: Loads the Cakemail OpenAPI spec and provides query functions.
// ABOUTME: Supports listing endpoints, getting details with $ref resolution, and caching.

const SPEC_URL = "https://api.cakemail.dev/openapi.json";
const MAX_REF_DEPTH = 10;

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, OperationObject>>;
  components?: { schemas?: Record<string, SchemaObject> };
  [key: string]: unknown;
}

export interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  [key: string]: unknown;
}

export interface RequestBodyObject {
  content?: Record<string, { schema?: SchemaObject }>;
  required?: boolean;
  description?: string;
  [key: string]: unknown;
}

export interface SchemaObject {
  [key: string]: unknown;
}

export interface EndpointSummary {
  method: string;
  path: string;
  summary: string;
  operationId: string;
  tag: string;
}

export interface EndpointDetail {
  method: string;
  path: string;
  summary: string;
  description?: string;
  operationId: string;
  tag: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, unknown>;
}

interface ListFilters {
  tag?: string;
  search?: string;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export function listEndpoints(
  spec: OpenAPISpec,
  filters?: ListFilters
): EndpointSummary[] {
  const results: EndpointSummary[] = [];
  const tagFilter = filters?.tag?.toLowerCase();
  const searchFilter = filters?.search?.toLowerCase();

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = methods[method];
      if (!op) continue;

      const tag = op.tags?.[0] ?? "";
      const summary = op.summary ?? "";
      const operationId = op.operationId ?? "";

      if (tagFilter && tag.toLowerCase() !== tagFilter) continue;

      if (searchFilter) {
        const haystack =
          `${path} ${summary} ${operationId} ${op.description ?? ""}`.toLowerCase();
        if (!haystack.includes(searchFilter)) continue;
      }

      results.push({
        method: method.toUpperCase(),
        path,
        summary,
        operationId,
        tag,
      });
    }
  }

  return results;
}

export function getEndpoint(
  spec: OpenAPISpec,
  pathOrOperationId: string,
  method?: string
): EndpointDetail | null {
  if (method) {
    const normalizedMethod = method.toLowerCase();
    const pathMethods = spec.paths[pathOrOperationId];
    if (!pathMethods) return null;

    const op = pathMethods[normalizedMethod];
    if (!op) return null;

    return buildDetail(spec, pathOrOperationId, normalizedMethod, op);
  }

  // Search by operationId
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const m of HTTP_METHODS) {
      const op = methods[m];
      if (op?.operationId === pathOrOperationId) {
        return buildDetail(spec, path, m, op);
      }
    }
  }

  return null;
}

function buildDetail(
  spec: OpenAPISpec,
  path: string,
  method: string,
  op: OperationObject
): EndpointDetail {
  const detail: EndpointDetail = {
    method: method.toUpperCase(),
    path,
    summary: op.summary ?? "",
    operationId: op.operationId ?? "",
    tag: op.tags?.[0] ?? "",
  };

  if (op.description) detail.description = op.description;
  if (op.parameters) detail.parameters = op.parameters;

  if (op.requestBody) {
    detail.requestBody = resolveRefs(op.requestBody, spec) as RequestBodyObject;
  }

  if (op.responses) {
    detail.responses = resolveRefs(op.responses, spec) as Record<
      string,
      unknown
    >;
  }

  return detail;
}

export function resolveRefs(
  obj: unknown,
  spec: OpenAPISpec,
  depth: number = 0
): unknown {
  if (depth >= MAX_REF_DEPTH) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveRefs(item, spec, depth));
  }

  if (obj === null || typeof obj !== "object") return obj;

  const record = obj as Record<string, unknown>;

  if (typeof record.$ref === "string") {
    const resolved = followRef(record.$ref, spec);
    if (resolved === undefined) return obj;
    return resolveRefs(resolved, spec, depth + 1);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = resolveRefs(value, spec, depth);
  }
  return result;
}

function followRef(ref: string, spec: OpenAPISpec): unknown {
  // Only handle internal refs: #/components/schemas/Foo
  if (!ref.startsWith("#/")) return undefined;

  const parts = ref.slice(2).split("/");
  let current: unknown = spec;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current === undefined ? undefined : structuredClone(current);
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedSpec: OpenAPISpec | null = null;
let cachedAt = 0;

export async function loadSpec(): Promise<OpenAPISpec> {
  if (cachedSpec && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSpec;
  }

  const response = await fetch(SPEC_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${response.status}`);
  }

  cachedSpec = (await response.json()) as OpenAPISpec;
  cachedAt = Date.now();
  return cachedSpec;
}

export function setSpec(spec: OpenAPISpec): void {
  cachedSpec = spec;
  cachedAt = Date.now();
}
