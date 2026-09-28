import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AwardWalletApiError } from "../awardwallet/client.js";
import { OperationInputError } from "../catalog/index.js";

/** Stays well under Claude Code's default 25k-token tool-result cap. */
export const MAX_RESULT_CHARS = 60_000;

type Path = (string | number)[];

/** Path to the largest array (by serialized size), looking through objects up to a few levels deep. */
function largestArray(value: unknown, path: Path = [], depth = 0): { path: Path; size: number } | undefined {
  if (Array.isArray(value)) return value.length ? { path, size: JSON.stringify(value).length } : undefined;
  if (!value || typeof value !== "object" || depth > 3) return undefined;
  let best: { path: Path; size: number } | undefined;
  for (const [key, child] of Object.entries(value)) {
    const found = largestArray(child, [...path, key], depth + 1);
    if (found && (!best || found.size > best.size)) best = found;
  }
  return best;
}

function parentOf(root: unknown, path: Path): Record<string | number, unknown> {
  let node = root as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  return node;
}

/**
 * Serializes `data` within MAX_RESULT_CHARS. Oversized results lose whole items from their largest
 * arrays, so the JSON stays valid and the notes, errors and page tokens next to them survive.
 */
export function fitResult(data: unknown, limit = MAX_RESULT_CHARS): string {
  let text = JSON.stringify(data);
  if (text.length <= limit || !data || typeof data !== "object" || Array.isArray(data)) {
    return text.length <= limit ? text : `${text.slice(0, limit)}\n…[truncated: ${text.length} characters]`;
  }
  const root = structuredClone(data) as Record<string, unknown>;
  const notes: string[] = [];
  const budget = limit - 400; // room for the truncation notes
  for (let round = 0; round < 8 && text.length > budget; round++) {
    const target = largestArray(root);
    if (!target || target.path.length === 0) break;
    const parent = parentOf(root, target.path);
    const key = target.path[target.path.length - 1]!;
    const items = parent[key] as unknown[];
    parent[key] = [];
    const base = JSON.stringify(root).length;
    let n = 0;
    let size = base;
    for (const item of items) {
      const next = size + JSON.stringify(item).length + (n > 0 ? 1 : 0);
      if (next > budget) break;
      size = next;
      n++;
    }
    parent[key] = items.slice(0, n);
    notes.push(`${target.path.join(".")}: showing ${n} of ${items.length} items`);
    text = JSON.stringify(root);
  }
  if (text.length > budget) return `${text.slice(0, limit)}\n…[truncated: ${text.length} characters]`;
  return JSON.stringify({
    truncated: `Result was too large (${notes.join("; ")}). Narrow the request with filters, a smaller limit or pagination to see the rest.`,
    ...root,
  });
}

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: fitResult(data) }] };
}

export function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Turns expected failures into readable tool errors instead of protocol errors. */
export async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AwardWalletApiError || error instanceof OperationInputError) return fail(error.message);
    const message = error instanceof Error ? error.message : String(error);
    console.error("[awardwallet-mcp] tool error:", message);
    return fail(`Unexpected error: ${message}`);
  }
}

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
