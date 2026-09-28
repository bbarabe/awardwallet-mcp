import { z } from "zod";
import type { ApiOperation } from "./types.js";

const DOCS = "https://awardwallet.com/api/loyalty";

/** Body fields shared by /account/check and /confirmation/check, in documented order. */
const requestFields = {
  provider: z
    .string()
    .regex(/^[A-Za-z0-9]+$/)
    .optional()
    .describe("Provider (loyalty program) code from web_parsing.list_providers, alphanumeric with no spaces, e.g. 'marriott'"),
  userId: z.string().describe("Id that uniquely identifies the end user in your system; required for AwardWallet billing/accounting"),
  userData: z
    .string()
    .optional()
    .describe("Any string; returned untouched with the result, e.g. to match requests to responses"),
  priority: z
    .number()
    .int()
    .min(1)
    .max(9)
    .describe("1 (lowest) to 9 (highest). Use low values for background updates and 9 when a user is waiting; low priorities may be throttled"),
  callbackUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional. URL that receives the result by POST instead of polling; its domain must be registered with AwardWallet beforehand"),
  retries: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .describe("Retries after an unknown error, 0-4 (default 4). Rejected credentials are not retried"),
  timeout: z
    .number()
    .int()
    .optional()
    .describe("Seconds the request may wait in the queue before it fails with a timeout error"),
};

/**
 * One account-check request (CheckAccountRequest) without its secrets: `password` is a secret field
 * of web_parsing.check_account, and `answers` (security-question / 2FA answers, an array) is not
 * supported because a secret inside array elements cannot be collected on the secure form.
 */
const accountCheckFields = {
  ...requestFields,
  login: z
    .string()
    .describe("Login for the provider's website, e.g. email or member number (caption: login.title in web_parsing.get_provider)"),
  login2: z
    .string()
    .optional()
    .describe("Second login value when the provider has one, e.g. a region or brand; use an option code from login2.options in web_parsing.get_provider"),
  login3: z
    .string()
    .optional()
    .describe("Third login value when the provider needs extra input (see login3 in web_parsing.get_provider)"),
  browserState: z
    .string()
    .optional()
    .describe("browserState returned by the previous check of this account; send it back so security questions are not asked again and checks run faster"),
  parseItineraries: z
    .boolean()
    .optional()
    .describe("Also retrieve reservations from the account; set false when not needed, as it takes longer"),
  parsePastItineraries: z.boolean().optional().describe("true to also retrieve past reservations"),
  history: z
    .object({
      range: z
        .enum(["complete", "incremental", "incremental2"])
        .optional()
        .describe(
          "complete: all transactions; incremental: only transactions since the state you send; incremental2: like incremental, but may resend updated past history (overwrite from its first day)",
        ),
      state: z
        .string()
        .optional()
        .describe("history.state from this account's previous result; send it with an incremental range"),
    })
    .optional()
    .describe("Request account activity (transaction history). Slows the check, so only when needed"),
};

/** Raw Web Parsing (Loyalty) API endpoints (https://awardwallet.com/api/loyalty), relative to https://loyalty.awardwallet.com/v2. */
export const webParsingOperations: ApiOperation[] = [
  {
    id: "web_parsing.list_providers",
    api: "webParsing",
    title: "List Web Parsing providers",
    description:
      "Lists every loyalty program the Web Parsing API supports: code, displayName and kind (1 airline, 2 hotel, 3 car rental, 4 train, 5 other, 6 credit card, 7 shopping, 8 dining, 9 survey, 10 cruise). The list changes over time; pass a code to web_parsing.get_provider.",
    method: "GET",
    path: "/providers/list",
    access: "read",
    docsUrl: `${DOCS}#method-providers_1`,
    input: z.object({}),
    keywords: ["programs", "supported", "airlines", "hotels", "loyalty"],
  },
  {
    id: "web_parsing.get_provider",
    api: "webParsing",
    title: "Get provider details",
    description:
      "Returns one provider's definition: login, login2, login3 and password fields (captions, options, required), tracked properties, confirmationNumberFields for web_parsing.check_confirmation, history columns, elite level count and whether itineraries, past itineraries, expiration and history are supported.",
    method: "GET",
    path: "/providers/{code}",
    access: "read",
    docsUrl: `${DOCS}#method-providers_2`,
    input: z.object({
      code: z
        .string()
        .regex(/^[A-Za-z0-9]+$/)
        .describe("Provider code from web_parsing.list_providers, alphanumeric with no spaces, e.g. 'marriott'"),
    }),
    keywords: ["program", "login fields", "confirmation fields", "capabilities", "elite levels"],
  },
  {
    id: "web_parsing.check_account",
    api: "webParsing",
    title: "Check one loyalty account",
    description:
      "Queues one loyalty account for AwardWallet to sign in to and fetch balance, properties and optionally itineraries and history; returns a requestId to poll with web_parsing.get_account_check_result until state is not 0. Call with collectSecrets=true to have the user enter the password on the secure form. 2FA/security answers can't be sent, so state 10 can't finish here.",
    method: "POST",
    path: "/account/check",
    access: "write",
    docsUrl: `${DOCS}#method-loyalty_accounts_1`,
    input: z.object({
      body: z.object(accountCheckFields),
    }),
    secretFields: [
      {
        path: "password",
        label: "Loyalty account password",
        sensitive: true,
        required: false,
        help: "Password or PIN used to sign in to the program's website. Leave empty if the program does not use one.",
      },
    ],
    keywords: ["update", "refresh", "balance", "miles", "points", "sign in", "itineraries", "history"],
  },
  {
    id: "web_parsing.check_account_package",
    api: "webParsing",
    title: "Check several loyalty accounts",
    description:
      "Queues several loyalty accounts in one request; returns package (requestIds in the order sent) and errors. Poll each with web_parsing.get_account_check_result. Passwords and security answers would sit inside the array and cannot be collected securely, so they are not accepted: accounts that need a password must use web_parsing.check_account.",
    method: "POST",
    path: "/account/check/package",
    access: "write",
    docsUrl: `${DOCS}#method-loyalty_accounts_2`,
    input: z.object({
      body: z.object({
        package: z
          .array(z.object(accountCheckFields))
          .optional()
          .describe("Accounts to check, each defined like a web_parsing.check_account body (no password or answers)"),
      }),
    }),
    keywords: ["batch", "bulk", "multiple", "update", "refresh", "balances"],
  },
  {
    id: "web_parsing.get_account_check_result",
    api: "webParsing",
    title: "Get account check result",
    description:
      "Returns an account check's result: state (0 pending, 1 success, 2 invalid credentials, 3 locked out, 4 provider error, 5 provider disabled, 6 unknown error, 9 warning, 10 question or user action needed, 11 timeout), message, balance, expiration, properties, sub-accounts, itineraries, history and browserState. Typically cached up to two hours.",
    method: "GET",
    path: "/account/check/{id}",
    access: "read",
    docsUrl: `${DOCS}#method-loyalty_accounts_3`,
    input: z.object({
      id: z
        .string()
        .min(1)
        .describe("requestId returned by web_parsing.check_account or web_parsing.check_account_package"),
    }),
    keywords: ["result", "status", "balance", "expiration", "elite status", "history", "itineraries", "poll"],
  },
  {
    id: "web_parsing.get_account_queue",
    api: "webParsing",
    title: "Get account check queue size",
    description:
      "Returns how many of your account check requests are waiting in AwardWallet's queue, grouped by provider (provider, priority, itemsCount). Useful for troubleshooting slow web_parsing.check_account results.",
    method: "GET",
    path: "/account/queue",
    access: "read",
    docsUrl: `${DOCS}#method-loyalty_accounts_4`,
    input: z.object({}),
    keywords: ["queue", "pending", "backlog", "troubleshooting"],
  },
  {
    id: "web_parsing.check_confirmation",
    api: "webParsing",
    title: "Look up a reservation by confirmation #",
    description:
      "Queues a reservation lookup by confirmation number, without signing in to an account. Send the provider's confirmationNumberFields (from web_parsing.get_provider) as code/value pairs. Returns a requestId; fetch the itineraries with web_parsing.get_confirmation_check_result.",
    method: "POST",
    path: "/confirmation/check",
    access: "write",
    docsUrl: `${DOCS}#method-Reservations_via_conf%23_1`,
    input: z.object({
      body: z.object({
        ...requestFields,
        fields: z
          .array(
            z.object({
              code: z
                .string()
                .optional()
                .describe("Field code from confirmationNumberFields in web_parsing.get_provider, e.g. 'ConfNo' or 'LastName'"),
              value: z
                .string()
                .optional()
                .describe("Field value, e.g. the confirmation number or the traveler's last name"),
            }),
          )
          .describe("The provider's confirmationNumberFields (see web_parsing.get_provider) as code/value pairs"),
      }),
    }),
    keywords: ["confirmation number", "record locator", "PNR", "reservation", "booking", "itinerary"],
  },
  {
    id: "web_parsing.get_confirmation_check_result",
    api: "webParsing",
    title: "Get confirmation lookup result",
    description:
      "Returns a confirmation-number lookup's result: state (1 retrieved, 6 AwardWallet failed to parse the provider's site, 100 provider rejected the details), message, errorReason and the itineraries found (flights, hotels, car rentals, trains, cruises, events, ...).",
    method: "GET",
    path: "/confirmation/check/{id}",
    access: "read",
    docsUrl: `${DOCS}#method-Reservations_via_conf%23_2`,
    input: z.object({
      id: z.string().min(1).describe("requestId returned by web_parsing.check_confirmation"),
    }),
    keywords: ["reservation", "itinerary", "trip", "result", "poll"],
  },
  {
    id: "web_parsing.get_confirmation_queue",
    api: "webParsing",
    title: "Get confirmation queue size",
    description:
      "Returns how many of your confirmation-number lookups are waiting in AwardWallet's queue, grouped by provider (provider, priority, itemsCount). Useful for troubleshooting slow web_parsing.check_confirmation results.",
    method: "GET",
    path: "/confirmation/queue",
    access: "read",
    docsUrl: `${DOCS}#method-Reservations_via_conf%23_3`,
    input: z.object({}),
    keywords: ["queue", "pending", "backlog", "troubleshooting", "confirmation"],
  },
];
