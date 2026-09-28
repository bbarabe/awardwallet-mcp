import type { ApiId } from "./catalog/types.js";
import { CREDENTIAL_NAMES, type CredentialSource, envValue, resolveCredential } from "./credentials.js";

export const ACCOUNT_ACCESS_LEVELS = ["no_access", "read_numbers", "read_balances", "read_all", "full_control"] as const;
export const TRIP_ACCESS_LEVELS = ["no_access", "read_all", "full_control"] as const;
export type AccountAccessLevel = (typeof ACCOUNT_ACCESS_LEVELS)[number];
export type TripAccessLevel = (typeof TRIP_ACCESS_LEVELS)[number];

export interface AppConfig {
  /** Serve built-in demo data; nothing is sent to AwardWallet. */
  mockMode: boolean;
  /** Register only read-only tools (for autonomous agents). */
  readOnly: boolean;
  /** Offer create_connection_link (needs AwardWallet's approval of create-auth-url). */
  connectLinks: boolean;
  /** Redirect URL to send with create-auth-url when the business has several configured. */
  connectRedirectUrl?: string;
  emailRegion: "us" | "eu";
  /** X-Authentication header value per API; absent when that API is not configured. */
  credentials: Partial<Record<ApiId, string>>;
  credentialSources: Partial<Record<ApiId, CredentialSource>>;
  secureInput: {
    /** Fixed port for the local secure-input page (0 = pick a free one). */
    port: number;
    /** Public base URL when the page is reached through a tunnel or reverse proxy. */
    publicUrl?: string;
  };
}

const flag = (value: string | undefined) => /^(1|true|yes|on)$/i.test(value?.trim() ?? "");

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  const get = (name: string) => envValue(env, name);
  const mockMode = flag(get("AW_MOCK_MODE"));
  const credentials: AppConfig["credentials"] = {};
  const credentialSources: AppConfig["credentialSources"] = {};

  for (const [api, name] of Object.entries(CREDENTIAL_NAMES) as [ApiId, string][]) {
    if (mockMode) {
      credentials[api] = "demo";
      credentialSources[api] = "demo";
      continue;
    }
    const found = await resolveCredential(name, env);
    if (found) {
      credentials[api] = found.value;
      credentialSources[api] = found.source;
    }
  }

  const port = Number(get("AW_SECURE_INPUT_PORT") ?? 0);
  const publicUrl = get("AW_SECURE_INPUT_URL");
  return {
    mockMode,
    readOnly: flag(get("AW_READ_ONLY")),
    connectLinks: flag(get("AW_CONNECT_LINKS")),
    connectRedirectUrl: get("AW_CONNECT_REDIRECT_URL"),
    emailRegion: get("AW_EMAIL_API_REGION")?.toLowerCase() === "eu" ? "eu" : "us",
    credentials,
    credentialSources,
    secureInput: {
      port: Number.isInteger(port) && port >= 0 && port < 65536 ? port : 0,
      publicUrl: publicUrl ? publicUrl.replace(/\/+$/, "") : undefined,
    },
  };
}
