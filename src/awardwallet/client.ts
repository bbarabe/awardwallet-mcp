import type { ApiId, HttpMethod } from "../catalog/types.js";
import type { AppConfig } from "../config.js";
import { CREDENTIAL_NAMES } from "../credentials.js";
import { mockFetch } from "./mock.js";

export const API_NAMES: Record<ApiId, string> = {
  accountAccess: "Account Access API",
  webParsing: "Web Parsing (Loyalty) API",
  emailParsing: "Email Parsing API",
  creditCardBonus: "Credit Card Bonus API",
  flightAwardSearch: "Flight Award Search API",
  hotelAwardSearch: "Hotel Award Search API",
};

export const API_DOCS: Record<ApiId, string> = {
  accountAccess: "https://awardwallet.com/api/account",
  webParsing: "https://awardwallet.com/api/loyalty",
  emailParsing: "https://awardwallet.com/api/email",
  creditCardBonus: "https://awardwallet.com/api/cc",
  flightAwardSearch: "https://awardwallet.com/api/flight-award-search",
  hotelAwardSearch: "https://awardwallet.com/api/hotel-award-search",
};

/** Environment variable / credential-store entry holding each API's credential. */
export const API_SECRET_NAMES = CREDENTIAL_NAMES;

export function apiBaseUrl(api: ApiId, config: Pick<AppConfig, "emailRegion">): string {
  switch (api) {
    case "accountAccess":
      return "https://business.awardwallet.com/api/export/v2";
    case "webParsing":
      return "https://loyalty.awardwallet.com/v2";
    case "emailParsing":
      return config.emailRegion === "eu"
        ? "https://email-eu.awardwallet.com/email/json/v2"
        : "https://service.awardwallet.com/email/json/v2";
    case "creditCardBonus":
      return "https://us-cc-api.awardwallet.com/v1";
    case "flightAwardSearch":
      return "https://ra.awardwallet.com/v1";
    case "hotelAwardSearch":
      return "https://ra-hotels.awardwallet.com/v1";
  }
}

/** An AwardWallet API call that failed. `message` is written for the person reading the tool result. */
export class AwardWalletApiError extends Error {
  constructor(
    readonly api: ApiId,
    readonly status: number,
    message: string,
    readonly upstreamMessage?: string,
  ) {
    super(message);
    this.name = "AwardWalletApiError";
  }
}

export type QueryValue = string | number | boolean | undefined | null | readonly (string | number | boolean)[];

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  /** Serve identical reads from a short-lived in-isolate cache (AwardWallet rate-limits per id). */
  cacheTtlMs?: number;
}

const TIMEOUT_MS = 25_000;
const RETRYABLE = new Set([502, 503, 504]);
const CACHE_LIMIT = 300;
const cache = new Map<string, { expires: number; value: unknown }>();

export function clearResponseCache(): void {
  cache.clear();
}

function upstreamMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body.trim().slice(0, 300) || undefined;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const key of ["message", "error_description", "errorMessage", "error", "detail", "title"]) {
      const v = b[key];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 300);
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>)["message"] === "string") {
        return String((v as Record<string, unknown>)["message"]).slice(0, 300);
      }
    }
  }
  return undefined;
}

function describeFailure(api: ApiId, status: number, detail: string | undefined): string {
  const name = API_NAMES[api];
  const suffix = detail ? `: ${detail}` : ".";
  switch (status) {
    case 400:
      return `AwardWallet rejected the request as invalid (400)${suffix}`;
    case 401:
      return `AwardWallet rejected the credentials for the ${name} (401). Update ${API_SECRET_NAMES[api]} (run \`awardwallet-mcp login\` or fix the environment variable).`;
    case 403:
      return `AwardWallet refused the request (403)${suffix} This usually means the business account isn't approved or subscribed for this feature.`;
    case 404:
      return `Not found at AwardWallet (404)${suffix}`;
    case 405:
      return `AwardWallet does not allow this method on that endpoint (405)${suffix}`;
    case 410:
      return `The code or request has expired at AwardWallet (410)${suffix}`;
    case 429:
      return `AwardWallet rate limit reached (429). The Account Access API allows 20 requests per rolling 10 minutes for each user, member or account; wait a few minutes before retrying.`;
    default:
      if (status >= 500) return `AwardWallet's ${name} is having trouble (${status})${suffix} Try again later.`;
      return `AwardWallet returned HTTP ${status}${suffix}`;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json") || /^[\s]*[[{"]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function buildUrl(base: string, path: string, query: RequestOptions["query"]): URL {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
    else url.searchParams.set(key, String(value));
  }
  return url;
}

export class AwardWalletClient {
  constructor(private readonly config: AppConfig) {}

  isConfigured(api: ApiId): boolean {
    return Boolean(this.config.credentials[api]);
  }

  get mockMode(): boolean {
    return this.config.mockMode;
  }

  async request<T = unknown>(api: ApiId, method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const credential = this.config.credentials[api];
    if (!credential) {
      throw new AwardWalletApiError(
        api,
        0,
        `The ${API_NAMES[api]} is not configured. Add its credentials with \`awardwallet-mcp login --api ${api}\` or the ${API_SECRET_NAMES[api]} environment variable.`,
      );
    }

    const url = buildUrl(apiBaseUrl(api, this.config), path, options.query);
    const bodyText = options.body === undefined ? undefined : JSON.stringify(options.body);
    const cacheKey = options.cacheTtlMs ? `${api} ${method} ${url.href} ${bodyText ?? ""}` : undefined;
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit && hit.expires > Date.now()) return structuredClone(hit.value) as T;
      if (hit) cache.delete(cacheKey);
    }

    const headers: Record<string, string> = { "X-Authentication": credential, Accept: "application/json" };
    if (bodyText !== undefined) headers["Content-Type"] = "application/json";
    const doFetch = this.config.mockMode ? mockFetch : (input: Request) => fetch(input);

    let response: Response | undefined;
    const attempts = method === "GET" ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const signals = [AbortSignal.timeout(TIMEOUT_MS)];
      if (options.signal) signals.push(options.signal);
      try {
        response = await doFetch(new Request(url, { method, headers, body: bodyText, signal: AbortSignal.any(signals) }));
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (attempt < attempts) continue;
        const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "could not be reached";
        throw new AwardWalletApiError(api, 0, `AwardWallet's ${API_NAMES[api]} ${reason}. Try again shortly.`);
      }
      if (!RETRYABLE.has(response.status) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const data = await parseBody(response!);
    if (!response!.ok) {
      const detail = upstreamMessage(data);
      throw new AwardWalletApiError(api, response!.status, describeFailure(api, response!.status, detail), detail);
    }

    if (cacheKey) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { expires: Date.now() + options.cacheTtlMs!, value: structuredClone(data) });
    }
    return data as T;
  }
}
