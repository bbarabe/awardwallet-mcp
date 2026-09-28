/** The long tail: every raw AwardWallet API operation, behind search + separate read and write tools. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { API_NAMES, type AwardWalletClient } from "../awardwallet/client.js";
import { availableOperations, describeOperation, executeCall, findOperation, prepareCall, searchOperations, secretsToCollect } from "../catalog/index.js";
import type { ApiId, ApiOperation } from "../catalog/types.js";
import type { AppConfig } from "../config.js";
import type { SecureInputServer } from "../secure-input.js";
import { fail, guard, ok } from "./results.js";

const API_IDS = Object.keys(API_NAMES) as [ApiId, ...ApiId[]];
const DOCS = "https://awardwallet.com/api/main";

const operationId = z
  .string()
  .regex(/^[a-z_]+\.[a-z0-9_]+$/, "Operation ids look like 'web_parsing.check_account'")
  .describe("Operation id from search_api_operations");
const operationInput = z
  .record(z.string(), z.unknown())
  .default({})
  .describe("The operation's input: path parameters as top-level keys, plus `query` and `body` objects, as its schema from search_api_operations describes");

export interface CatalogContext {
  config: AppConfig;
  client: AwardWalletClient;
  secureInput?: SecureInputServer;
}

function resolve(client: AwardWalletClient, id: string): ApiOperation | string {
  const op = findOperation(id);
  if (!op) return `Unknown operation '${id}'. Use search_api_operations to find valid ids.`;
  if (!client.isConfigured(op.api)) {
    return `${op.id} belongs to the ${API_NAMES[op.api]}, which is not configured (run \`awardwallet-mcp login --api ${op.api}\` or set its environment variable).`;
  }
  return op;
}

export function registerCatalogTools(server: McpServer, ctx: CatalogContext): void {
  const { client, config } = ctx;

  server.registerTool(
    "search_api_operations",
    {
      title: "Search AwardWallet API operations",
      description: `Searches the raw AwardWallet API operations this server can call, across the Account Access, Web Parsing (Loyalty), Email Parsing, Credit Card Bonus, Flight Award Search and Hotel Award Search APIs (${DOCS}). Returns each match's id, whether it reads or writes, its documentation link and the JSON Schema of its input. An empty query lists every available operation briefly.`,
      inputSchema: {
        query: z.string().max(200).default("").describe("What you want to do, e.g. 'award flights to Tokyo', 'parse a confirmation email', 'refresh an account balance'"),
        api: z.enum(API_IDS).optional().describe("Limit to one API"),
        access: z.enum(["read", "write"]).optional().describe("Limit to read-only or to write operations"),
        limit: z.number().int().min(1).max(20).default(6).describe("Maximum matches with full schemas"),
      },
      annotations: { title: "Search AwardWallet API operations", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, api, access, limit }) =>
      guard(async () => {
        let ops = availableOperations(client);
        if (config.readOnly) ops = ops.filter((op) => op.access === "read");
        const notConfigured = API_IDS.filter((id) => !client.isConfigured(id)).map((id) => API_NAMES[id]);
        const notes: string[] = [];
        if (notConfigured.length) notes.push(`Not configured on this server: ${notConfigured.join(", ")}.`);
        if (config.readOnly) notes.push("Read-only mode: write operations are hidden.");

        if (!query.trim()) {
          const listed = ops.filter((op) => (!api || op.api === api) && (!access || op.access === access));
          return ok({
            operations: listed.map((op) => ({ id: op.id, api: API_NAMES[op.api], title: op.title, access: op.access })),
            notes: [...notes, "Search with a query to get input schemas."],
          });
        }
        const matches = searchOperations(ops, query, { api, access }, limit);
        if (!matches.length) notes.push("No match; try other words or an empty query to list everything.");
        return ok({ operations: matches.map(describeOperation), notes });
      }),
  );

  server.registerTool(
    "call_api_read_operation",
    {
      title: "Call AwardWallet API (read)",
      description: `Runs a read-only AwardWallet API operation (access=read in search_api_operations) and returns AwardWallet's JSON response. Refuses write operations. API reference: ${DOCS}.`,
      inputSchema: { operationId, input: operationInput },
      annotations: { title: "Call AwardWallet API (read)", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ operationId: id, input }, extra) =>
      guard(async () => {
        const op = resolve(client, id);
        if (typeof op === "string") return fail(op);
        if (op.access !== "read") return fail(`${op.id} changes data or starts billable work; it is only available through call_api_write_operation.`);
        const call = prepareCall(op, input);
        const response = await executeCall(client, call, {}, extra.signal);
        return ok({ operation: op.id, response });
      }),
  );

  if (config.readOnly) return;

  server.registerTool(
    "call_api_write_operation",
    {
      title: "Call AwardWallet API (write)",
      description: `Runs an AwardWallet API operation that creates, changes or deletes data, signs in to a loyalty or mailbox account, or starts billable work (access=write in search_api_operations). When it needs a password or token, it returns a one-time link to a local page where the user types it, so the secret never passes through the conversation. API reference: ${DOCS}.`,
      inputSchema: {
        operationId,
        input: operationInput,
        collectSecrets: z
          .boolean()
          .default(false)
          .describe("Also ask for the operation's optional secret fields (e.g. a loyalty password for member pricing) on the secure page. Required secrets are always asked for."),
      },
      annotations: { title: "Call AwardWallet API (write)", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ operationId: id, input, collectSecrets }, extra) =>
      guard(async () => {
        const op = resolve(client, id);
        if (typeof op === "string") return fail(op);
        if (op.access !== "write") return fail(`${op.id} is read-only; use call_api_read_operation.`);
        const call = prepareCall(op, input);
        const fields = secretsToCollect(op, collectSecrets);
        if (fields.length) {
          if (!ctx.secureInput) return fail("Secure input is unavailable on this server.");
          const link = await ctx.secureInput.create(call, fields);
          return ok({
            status: "waiting_for_secure_input",
            operation: op.id,
            submissionId: link.submissionId,
            url: link.url,
            expiresAt: link.expiresAt,
            fields: fields.map((f) => `${f.label}${f.required ? "" : " (optional)"}`),
            nextStep: "The user opens the link on this computer and enters the values there; then get_secure_input_result returns AwardWallet's response.",
          });
        }
        const response = await executeCall(client, call, {}, extra.signal);
        return ok({ operation: op.id, response });
      }),
  );

  server.registerTool(
    "get_secure_input_result",
    {
      title: "Get secure input result",
      description:
        "Returns the status of a request waiting on the secure input page (waiting, completed, failed, cancelled or expired) and, once completed, AwardWallet's response.",
      inputSchema: {
        submissionId: z.string().regex(/^[A-Za-z0-9_-]{32}$/).describe("submissionId returned by call_api_write_operation"),
      },
      annotations: { title: "Get secure input result", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ submissionId }) =>
      guard(async () => {
        const sub = ctx.secureInput?.get(submissionId);
        if (!sub) return fail("Unknown or expired submission. Results are kept for an hour; start the request again if needed.");
        return ok({
          operation: sub.call.op.id,
          status: sub.status,
          response: sub.status === "completed" ? sub.response : undefined,
          error: sub.error,
          url: sub.status === "waiting" ? `${ctx.secureInput!.baseUrl()}/secure/${sub.id}` : undefined,
          expiresAt: sub.status === "waiting" ? new Date(sub.expiresAt).toISOString() : undefined,
        });
      }),
  );
}
