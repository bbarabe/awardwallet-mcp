import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AccountAccessService } from "./awardwallet/access.js";
import { AwardWalletClient } from "./awardwallet/client.js";
import type { AppConfig } from "./config.js";
import { SecureInputServer } from "./secure-input.js";
import { registerAccountTools } from "./tools/account-tools.js";
import { registerCatalogTools } from "./tools/catalog-tools.js";

export const VERSION = "0.1.0";

const INSTRUCTIONS = `AwardWallet tracks loyalty programs (airline miles, hotel points, credit-card rewards) and travel reservations for the people connected to an AwardWallet Business account.
Balances are AwardWallet's last successful update of each account (see lastUpdated), not live checks.
list_loyalty_accounts answers most balance, elite status and expiration questions; get_loyalty_account adds one account's properties and transaction history; get_travel_timeline covers trips.
userId, memberId and accountId values come from list_people and list_loyalty_accounts.
Every raw endpoint of the AwardWallet APIs configured here is reachable through search_api_operations and the call_api_* tools.`;

export function createAwardWalletServer(config: AppConfig): { server: McpServer; secureInput?: SecureInputServer } {
  const client = new AwardWalletClient(config);
  const service = new AccountAccessService(client);
  const secureInput = config.readOnly ? undefined : new SecureInputServer(client, config.secureInput);
  const server = new McpServer({ name: "awardwallet", title: "AwardWallet", version: VERSION }, { instructions: INSTRUCTIONS });
  registerAccountTools(server, { config, client, service });
  registerCatalogTools(server, { config, client, secureInput });
  return { server, secureInput };
}
