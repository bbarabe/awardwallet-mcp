/**
 * Credentials for the AwardWallet APIs, resolved in this order:
 *   1. environment variable            AW_API_KEY=...              (MCP client config, MCPB user_config)
 *   2. file named by <NAME>_FILE       AW_API_KEY_FILE=/run/secrets/aw   (Docker / systemd secrets)
 *   3. the OS credential store         Windows Credential Manager, macOS Keychain, Linux Secret Service
 * The credential store is written by `awardwallet-mcp login`, so no key has to sit in a config file.
 */
import { readFileSync } from "node:fs";
import type { ApiId } from "./catalog/types.js";

export const KEYCHAIN_SERVICE = "awardwallet-mcp";

/** Environment variable (and credential-store account) holding each API's credential. */
export const CREDENTIAL_NAMES: Record<ApiId, string> = {
  accountAccess: "AW_API_KEY",
  webParsing: "AW_WEB_PARSING_CREDENTIALS",
  emailParsing: "AW_EMAIL_PARSING_CREDENTIALS",
  creditCardBonus: "AW_CC_BONUS_CREDENTIALS",
  flightAwardSearch: "AW_FLIGHT_SEARCH_CREDENTIALS",
  hotelAwardSearch: "AW_HOTEL_SEARCH_CREDENTIALS",
};

export type CredentialSource = "environment" | "file" | "credential store" | "demo";

interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}
type KeyringModule = { Entry: new (service: string, account: string) => KeyringEntry };

let keyring: KeyringModule | null | undefined;

/** The optional native keyring module; null when it isn't installed (e.g. inside the MCPB bundle). */
export async function loadKeyring(): Promise<KeyringModule | null> {
  if (keyring !== undefined) return keyring;
  try {
    // A variable specifier keeps bundlers from trying to inline the native module.
    const specifier = "@napi-rs/keyring";
    keyring = (await import(specifier)) as KeyringModule;
  } catch {
    keyring = null;
  }
  return keyring;
}

export function credentialStoreName(): string {
  switch (process.platform) {
    case "win32":
      return "Windows Credential Manager";
    case "darwin":
      return "macOS Keychain";
    default:
      return "the Secret Service keyring";
  }
}

export async function readStoredCredential(name: string): Promise<string | undefined> {
  const mod = await loadKeyring();
  if (!mod) return undefined;
  try {
    return new mod.Entry(KEYCHAIN_SERVICE, name).getPassword()?.trim() || undefined;
  } catch {
    // No keyring daemon (headless Linux) or access denied: fall back to the other sources.
    return undefined;
  }
}

export async function storeCredential(name: string, value: string): Promise<void> {
  const mod = await loadKeyring();
  if (!mod) {
    throw new Error("The @napi-rs/keyring module is not installed, so the OS credential store can't be used. Run `npm install` in the project, or set the environment variable instead.");
  }
  new mod.Entry(KEYCHAIN_SERVICE, name).setPassword(value);
}

export async function deleteStoredCredential(name: string): Promise<boolean> {
  const mod = await loadKeyring();
  if (!mod) return false;
  try {
    return new mod.Entry(KEYCHAIN_SERVICE, name).deletePassword();
  } catch {
    return false;
  }
}

/** An environment value, treating blanks and unexpanded MCPB placeholders ("${user_config.x}") as unset. */
export function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value && !value.startsWith("${") ? value : undefined;
}

export async function resolveCredential(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ value: string; source: CredentialSource } | undefined> {
  const direct = envValue(env, name);
  if (direct) return { value: direct, source: "environment" };

  const file = envValue(env, `${name}_FILE`);
  if (file) {
    try {
      const value = readFileSync(file, "utf8").trim();
      if (value) return { value, source: "file" };
    } catch (error) {
      throw new Error(`${name}_FILE points to ${file}, which could not be read: ${(error as Error).message}`);
    }
  }

  const stored = await readStoredCredential(name);
  if (stored) return { value: stored, source: "credential store" };
  return undefined;
}
