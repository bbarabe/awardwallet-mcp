/** Checking AwardWallet API credentials, and saving them from the secure input page (connect_awardwallet). */
import { API_NAMES, apiBaseUrl, AwardWalletApiError, AwardWalletClient, clearResponseCache } from "./awardwallet/client.js";
import type { ApiId, SecretField } from "./catalog/types.js";
import type { AppConfig } from "./config.js";
import { CREDENTIAL_NAMES, saveToSettingsFile } from "./credentials.js";
import { InputRejectedError, type SecureRequest } from "./secure-input.js";

export const KEY_PAGE = "https://business.awardwallet.com/profile/api";
/** Wrong credentials accepted on one setup link before it closes. */
const MAX_REJECTIONS = 3;

/** A cheap authenticated read per API, used to check credentials before saving them. */
const PROBES: Record<ApiId, string> = {
  accountAccess: "/connectedUser",
  webParsing: "/providers/list",
  emailParsing: "/providers/list",
  creditCardBonus: "/cards",
  flightAwardSearch: "/providers/list",
  hotelAwardSearch: "/providers/list",
};

/** Calls AwardWallet with `credential` and describes what it can see. Throws AwardWalletApiError when refused. */
export async function verifyCredential(api: ApiId, credential: string, base: AppConfig): Promise<string> {
  const client = new AwardWalletClient({ ...base, mockMode: false, credentials: { [api]: credential } });
  const data = await client.request<unknown>(api, "GET", PROBES[api]);
  if (api === "accountAccess" && data && typeof data === "object") {
    const users = (data as { connectedUsers?: unknown[] }).connectedUsers ?? [];
    return `${users.length} connected user${users.length === 1 ? "" : "s"} visible`;
  }
  return "credentials accepted";
}

function credentialFields(api: ApiId): SecretField[] {
  if (api === "accountAccess") {
    return [{ path: "key", label: "AwardWallet API key", sensitive: true, required: true, help: `Copy it from ${KEY_PAGE} (sign in with your AwardWallet login).` }];
  }
  return [
    { path: "username", label: "API username", sensitive: false, required: true, help: `Issued by AwardWallet for the ${API_NAMES[api]}.` },
    { path: "password", label: "API password", sensitive: true, required: true },
  ];
}

/**
 * The secure-input page for an API's credentials: checks them with AwardWallet, saves them to the
 * settings file and applies them to the running server, so no restart is needed.
 */
export function credentialRequest(api: ApiId, config: AppConfig): SecureRequest {
  const name = API_NAMES[api];
  let rejections = 0;
  return {
    operation: "connect_awardwallet",
    title: api === "accountAccess" ? "Connect AwardWallet" : `Connect the ${name}`,
    subtitle: name,
    intro:
      "What you enter here is checked with AwardWallet, then saved on this computer so you only do this once. It is not shown to your AI assistant.",
    facts: [
      ["Checked with", apiBaseUrl(api, config)],
      ["Saved in", config.settingsFile],
    ],
    fields: credentialFields(api),
    submitLabel: "Check and save",
    done: {
      title: "Connected",
      message: `AwardWallet accepted it, and it's saved on this computer. Go back to your AI assistant and ask about your ${api === "accountAccess" ? "points" : "request"}.`,
    },
    async run(secrets) {
      const credential = api === "accountAccess" ? (secrets["key"] ?? "").trim() : `${(secrets["username"] ?? "").trim()}:${secrets["password"] ?? ""}`;
      let check: string;
      try {
        check = await verifyCredential(api, credential, config);
      } catch (error) {
        if (!(error instanceof AwardWalletApiError)) throw error;
        // A lockout (reported without sending anything once known) leaves the form up for later.
        if (error.lockedUntil) throw new InputRejectedError(error.message);
        if (error.status !== 401) throw error;
        // Each wrong key counts toward AwardWallet's lockout, so this link stops after a few.
        if (++rejections >= MAX_REJECTIONS) {
          throw new Error(`AwardWallet didn't accept ${MAX_REJECTIONS} keys in a row, so this link is closed to avoid getting locked out. Check the key at ${KEY_PAGE}, then ask your AI assistant for a new link.`);
        }
        throw new InputRejectedError(
          api === "accountAccess"
            ? `AwardWallet didn't accept this key. Copy it again from ${KEY_PAGE}, making sure you have all of it.`
            : "AwardWallet didn't accept this username and password. Check them and try again.",
        );
      }
      saveToSettingsFile(config.settingsFile, CREDENTIAL_NAMES[api], credential);
      config.credentials[api] = credential;
      config.credentialSources[api] = "settings file";
      clearResponseCache();
      return { api: name, check, savedTo: config.settingsFile };
    },
  };
}
