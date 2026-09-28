import type { z } from "zod";

/** The AwardWallet API families this server can call. Each one has its own base URL and credential. */
export type ApiId =
  | "accountAccess"
  | "webParsing"
  | "emailParsing"
  | "creditCardBonus"
  | "flightAwardSearch"
  | "hotelAwardSearch";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * A request-body field that must never travel through the conversation (a loyalty or mailbox
 * password, an OAuth token). The server collects it on a passkey-protected form instead, so the
 * caller's `input.body` never contains it.
 */
export interface SecretField {
  /** Dot-separated path inside the JSON request body, e.g. "password" or "loyaltyAccount.password". No array indices. */
  path: string;
  /** Label shown on the secure form. */
  label: string;
  /** Rendered as a masked input when true. */
  sensitive: boolean;
  /** Whether the upstream API requires it. */
  required: boolean;
  /** Optional hint shown under the input. */
  help?: string;
}

/** One raw AwardWallet API endpoint, callable through the catalog tools. */
export interface ApiOperation {
  /** Stable id "<api_prefix>.<verb_noun>", e.g. "web_parsing.check_account". */
  id: string;
  api: ApiId;
  /** Short title, e.g. "Check one loyalty account". */
  title: string;
  /** One to three sentences: what it does, what it returns, and the ids of related follow-up operations. */
  description: string;
  method: HttpMethod;
  /** Path relative to the API base URL, with {name} placeholders that match top-level keys of `input`. */
  path: string;
  /**
   * "read": no side effects anywhere.
   * "write": creates, changes or deletes state at AwardWallet or a third party, signs in to a
   * third-party account, or starts billable work.
   */
  access: "read" | "write";
  /** Deep link to the official documentation for this operation. */
  docsUrl: string;
  /**
   * What the caller supplies:
   * - path parameters as top-level keys, named exactly like the {placeholders} in `path`;
   * - `query`: an optional object of query-string parameters;
   * - `body`: an object for the JSON request body, without any `secretFields`.
   */
  input: z.ZodObject<z.ZodRawShape>;
  /** Body fields collected on the secure form rather than from the caller. */
  secretFields?: SecretField[];
  /** Extra search terms ("miles", "balance", ...). */
  keywords?: string[];
}
