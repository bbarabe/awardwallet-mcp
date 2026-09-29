/** connect_awardwallet: lets the user add or replace API credentials without pasting them into the chat. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { API_NAMES } from "../awardwallet/client.js";
import type { ApiId } from "../catalog/types.js";
import type { AppConfig } from "../config.js";
import { CREDENTIAL_NAMES } from "../credentials.js";
import type { SecureInputServer } from "../secure-input.js";
import { credentialRequest, KEY_PAGE } from "../setup.js";
import { fail, guard, ok } from "./results.js";

const API_IDS = Object.keys(API_NAMES) as [ApiId, ...ApiId[]];

export function registerSetupTools(server: McpServer, ctx: { config: AppConfig; secureInput: SecureInputServer }): void {
  const { config, secureInput } = ctx;

  server.registerTool(
    "connect_awardwallet",
    {
      title: "Connect AwardWallet",
      description: `Connects this server to the user's AwardWallet account. Returns a one-time link to a page on this computer where the user pastes their AwardWallet API key (from ${KEY_PAGE}), or a paid API's username and password. The page checks it with AwardWallet and saves it on this computer; it never passes through the conversation, so never ask the user to type a key in the chat. Use it when get_status or another tool reports a missing or rejected key, or when the user wants to change it.`,
      inputSchema: {
        api: z.enum(API_IDS).default("accountAccess").describe("Which API's credentials to add; accountAccess is the main API key"),
      },
      annotations: { title: "Connect AwardWallet", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ api }) =>
      guard(async () => {
        if (config.mockMode) {
          return fail("Demo mode is on, so this server uses sample data and ignores API keys. Turn off demo mode (AW_MOCK_MODE) to use a real AwardWallet account.");
        }
        const source = config.credentialSources[api];
        if (source === "environment" || source === "file") {
          return fail(
            `The ${API_NAMES[api]} credentials come from the ${CREDENTIAL_NAMES[api]}${source === "file" ? "_FILE" : ""} environment variable in this app's MCP server settings, which takes precedence. Change or remove it there instead.`,
          );
        }
        const link = await secureInput.create(credentialRequest(api, config));
        return ok({
          status: "waiting_for_secure_input",
          api: API_NAMES[api],
          replacesSavedCredentials: Boolean(source),
          submissionId: link.submissionId,
          url: link.url,
          expiresAt: link.expiresAt,
          nextStep:
            "Give the user this link to open in their browser on this computer and paste the key there (not in the chat). When they say they're done, call get_secure_input_result with the submissionId, then answer their question.",
        });
      }),
  );
}
