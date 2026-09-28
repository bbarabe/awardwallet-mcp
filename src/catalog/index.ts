import { z } from "zod";
import { API_NAMES, type AwardWalletClient } from "../awardwallet/client.js";
import { accountAccessOperations } from "./account-access.js";
import { creditCardBonusOperations } from "./credit-card-bonus.js";
import { emailParsingOperations } from "./email-parsing.js";
import { flightAwardSearchOperations } from "./flight-award-search.js";
import { hotelAwardSearchOperations } from "./hotel-award-search.js";
import type { ApiId, ApiOperation, SecretField } from "./types.js";
import { webParsingOperations } from "./web-parsing.js";

export const ALL_OPERATIONS: readonly ApiOperation[] = [
  ...accountAccessOperations,
  ...webParsingOperations,
  ...emailParsingOperations,
  ...creditCardBonusOperations,
  ...flightAwardSearchOperations,
  ...hotelAwardSearchOperations,
];

const BY_ID = new Map(ALL_OPERATIONS.map((op) => [op.id, op]));

export function findOperation(id: string): ApiOperation | undefined {
  return BY_ID.get(id);
}

/** Operations whose API has credentials on this server. */
export function availableOperations(client: AwardWalletClient): ApiOperation[] {
  return ALL_OPERATIONS.filter((op) => client.isConfigured(op.api));
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);

/** Keyword ranking over id, title, keywords, API name and description. */
export function searchOperations(
  operations: ApiOperation[],
  query: string,
  filters: { api?: ApiId; access?: "read" | "write" },
  limit: number,
): ApiOperation[] {
  const filtered = operations.filter((op) => (!filters.api || op.api === filters.api) && (!filters.access || op.access === filters.access));
  const terms = words(query);
  if (terms.length === 0) return filtered.slice(0, limit);

  const scored = filtered.map((op) => {
    const fields: [string, number][] = [
      [op.id.replace(/[._]/g, " "), 4],
      [op.title, 4],
      [(op.keywords ?? []).join(" "), 3],
      [API_NAMES[op.api], 2],
      [op.description, 1],
    ];
    let score = 0;
    for (const term of terms) {
      for (const [text, weight] of fields) {
        const tokens = words(text);
        if (tokens.includes(term)) score += weight * 2;
        else if (tokens.some((t) => t.startsWith(term) || (term.length > 3 && t.includes(term)))) score += weight;
      }
    }
    return { op, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.op);
}

export function describeOperation(op: ApiOperation) {
  return {
    id: op.id,
    api: API_NAMES[op.api],
    title: op.title,
    access: op.access,
    request: `${op.method} ${op.path}`,
    description: op.description,
    docs: op.docsUrl,
    input: z.toJSONSchema(op.input, { io: "input", unrepresentable: "any" }),
    secretFields: op.secretFields?.map((s) => ({ path: `body.${s.path}`, label: s.label, required: s.required })),
  };
}

export class OperationInputError extends Error {}

export interface PreparedCall {
  op: ApiOperation;
  path: string;
  query?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
}

/** Validates caller input against the operation's schema. Only the parsed value is ever sent upstream. */
export function prepareCall(op: ApiOperation, input: unknown): PreparedCall {
  const parsed = op.input.safeParse(input ?? {});
  if (!parsed.success) {
    throw new OperationInputError(`Invalid input for ${op.id}:\n${z.prettifyError(parsed.error)}\nSee the input schema from search_api_operations or ${op.docsUrl}.`);
  }
  const value = parsed.data as Record<string, unknown>;
  const path = op.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const raw = String(value[name] ?? "");
    // URL parsing would resolve "." and ".." against the API path.
    if (raw === "" || raw === "." || raw === "..") throw new OperationInputError(`Invalid ${name} for ${op.id}: '${raw}'.`);
    return encodeURIComponent(raw);
  });

  let query: PreparedCall["query"];
  if (value["query"] && typeof value["query"] === "object") {
    query = {};
    for (const [key, v] of Object.entries(value["query"] as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      // AwardWallet list filters take comma-separated values.
      query[key] = Array.isArray(v) ? v.join(",") : (v as string | number | boolean);
    }
  }
  const body = value["body"] && typeof value["body"] === "object" ? structuredClone(value["body"] as Record<string, unknown>) : undefined;
  return { op, path, query, body };
}

/** Which secret fields the secure form must ask for. */
export function secretsToCollect(op: ApiOperation, collectOptional: boolean): SecretField[] {
  return (op.secretFields ?? []).filter((s) => s.required || collectOptional);
}

/** Places secret values into the request body at their dot paths. */
export function withSecrets(body: Record<string, unknown> | undefined, secrets: Record<string, string>): Record<string, unknown> {
  const out = body ? structuredClone(body) : {};
  for (const [path, value] of Object.entries(secrets)) {
    const parts = path.split(".");
    let target: Record<string, unknown> = out;
    for (const part of parts.slice(0, -1)) {
      const next = target[part];
      if (!next || typeof next !== "object" || Array.isArray(next)) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]!] = value;
  }
  return out;
}

export async function executeCall(client: AwardWalletClient, call: PreparedCall, secrets: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
  const hasSecrets = Object.keys(secrets).length > 0;
  const body = hasSecrets ? withSecrets(call.body, secrets) : call.body;
  return client.request(call.op.api, call.op.method, call.path, { query: call.query, body, signal });
}
