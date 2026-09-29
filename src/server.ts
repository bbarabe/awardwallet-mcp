import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AccountAccessService } from "./awardwallet/access.js";
import { AwardWalletClient } from "./awardwallet/client.js";
import type { AppConfig } from "./config.js";
import { SecureInputServer } from "./secure-input.js";
import { registerAccountTools } from "./tools/account-tools.js";
import { registerCatalogTools } from "./tools/catalog-tools.js";
import { registerSetupTools } from "./tools/setup-tools.js";

export const VERSION = "0.2.0";

const INSTRUCTIONS = `AwardWallet tracks loyalty programs (airline miles, hotel points, credit-card rewards) and travel reservations for the people connected to an AwardWallet Business account.
Balances are AwardWallet's last successful update of each account (see lastUpdated), not live checks.
list_loyalty_accounts answers most balance, elite status and expiration questions; get_loyalty_account adds one account's properties and transaction history; get_travel_timeline covers trips.
userId, memberId and accountId values come from list_people and list_loyalty_accounts.
Every raw endpoint of the AwardWallet APIs configured here is reachable through search_api_operations and the call_api_* tools.`;

const CONNECT_INSTRUCTIONS = `
If the AwardWallet API key is missing or rejected, call connect_awardwallet: it gives the user a link to a local page where they paste the key. Never ask for a key in the chat.`;

export function createAwardWalletServer(config: AppConfig): { server: McpServer; secureInput?: SecureInputServer } {
  const client = new AwardWalletClient(config);
  const service = new AccountAccessService(client);
  const secureInput = config.readOnly ? undefined : new SecureInputServer(config.secureInput);
  const instructions = secureInput ? INSTRUCTIONS + CONNECT_INSTRUCTIONS : INSTRUCTIONS;
  const server = new McpServer({ name: "awardwallet", title: "AwardWallet", version: VERSION }, { instructions });
  registerAccountTools(server, { config, client, service });
  registerCatalogTools(server, { config, client, secureInput });
  if (secureInput) registerSetupTools(server, { config, secureInput });
  return { server, secureInput };
}
