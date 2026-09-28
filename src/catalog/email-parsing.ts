import { z } from "zod";
import type { ApiOperation } from "./types.js";

const DOCS = "https://awardwallet.com/api/email";

type SecretFields = NonNullable<ApiOperation["secretFields"]>;

// ---------------------------------------------------------------------------------------------
// Shared Email Scanner building blocks (swagger: BaseUpdateableMailboxProperties,
// BaseConnectMailboxRequest, MailboxProgressOptions, ImapMailboxRequestParams).
// Descriptions are applied last on every field so `.description` is visible on the shape.
// ---------------------------------------------------------------------------------------------

const RETURN_EMAIL = ["headers", "all", "none"] as const;

const mailboxCallbackUrl = z.string().url().max(250);
const MAILBOX_CALLBACK_DESC =
  "URL that receives each itinerary parsed from this mailbox (JSON POST with HTTP basic auth). Its domain must be registered with AwardWallet first. Max 250 chars.";

/** BaseUpdateableMailboxProperties without callbackUrl, whose required flag differs per operation. */
const mailboxSettings = {
  returnEmail: z
    .enum(RETURN_EMAIL)
    .optional()
    .describe("Whether parsed results include the original email: headers (headers only), all (entire email) or none"),
  onProgress: z
    .object({
      callbackUrl: z
        .string()
        .url()
        .max(250)
        .describe(
          "Registered URL that receives an array of MailboxProgressEvent objects on every mailbox state change. Max 250 chars.",
        ),
    })
    .optional()
    .describe("Notifications of mailbox state changes (connecting, scanning, listening, error, finished)"),
  userData: z
    .string()
    .optional()
    .describe("Any text, sent back with every email parsed from this mailbox (e.g. your internal user id)"),
  tags: z
    .array(z.string().max(80).regex(/^\w+$/))
    .max(30)
    .optional()
    .describe(
      "Up to 30 tags (word characters [a-zA-Z0-9_] only, max 80 chars each, e.g. user_123) to find the mailbox with email_parsing.list_mailboxes",
    ),
};

const startFrom = z
  .iso.date()
  .optional()
  .describe(
    "Also scan existing emails back to this date (YYYY-MM-DD). If omitted only new emails are scanned, and listen must be true.",
  );

/** Extra fields of BaseConnectMailboxRequest. */
const scanWindow = {
  startFrom,
  listen: z.boolean().optional().describe("true to keep listening for new incoming emails going forward"),
};

/** Fields shared by Begin Authentication and Update Authentication. */
const oauthRedirect = {
  redirectUrl: z
    .string()
    .min(1)
    .max(1024)
    .describe(
      "Where the user returns after authentication, with ?state=success&mailboxId=123 or ?state=error&errorCode=...&errorMessage=... (do not show the error values to end users). Max 1024 chars.",
    ),
  intermediateRedirectUrl: z
    .string()
    .max(1024)
    .optional()
    .describe(
      "Optional URL on your domain, added as an Authorized Redirect URI of your OAuth client; it must forward the user with the query string intact to https://service.awardwallet.com/email/v2/mailboxes/auth/callback",
    ),
  host: z
    .string()
    .max(80)
    .optional()
    .describe(
      "Optional host name of yours with a CNAME to service.awardwallet.com, to hide that redirect from users; add it as an Authorized Redirect URI of your OAuth client",
    ),
};

const mailboxId = z
  .number()
  .int()
  .positive()
  .describe("Mailbox id from a connect operation, email_parsing.list_mailboxes or the mailboxId of the OAuth redirect");

/** Query filters shared by List Mailboxes and List Mailboxes with Pagination (arrays are sent comma-separated). */
const mailboxFilters = {
  tags: z
    .array(z.string())
    .max(30)
    .optional()
    .describe("Only mailboxes that have all of these tags (sent comma-separated)"),
  states: z
    .array(z.enum(["connecting", "error", "scanning", "listening", "finished"]))
    .max(30)
    .optional()
    .describe("Only mailboxes in these states (sent comma-separated)"),
  types: z
    .array(z.enum(["imap", "google", "microsoft", "yahoo", "aol"]))
    .max(30)
    .optional()
    .describe("Only mailboxes of these connection types (sent comma-separated)"),
  errorCodes: z
    .array(z.enum(["authentication", "connection", "unknown"]))
    .max(30)
    .optional()
    .describe("Only mailboxes with these error codes (sent comma-separated)"),
  emails: z
    .array(z.string())
    .max(30)
    .optional()
    .describe(
      "Only mailboxes with these login values, usually the email address; an IMAP login can differ (sent comma-separated)",
    ),
};

/** OAuth connect body (swagger ConnectOAuthMailboxRequest) without accessToken/refreshToken, which are secret. */
function oauthConnectInput() {
  return z.object({
    body: z.object({
      callbackUrl: mailboxCallbackUrl.describe(MAILBOX_CALLBACK_DESC),
      ...mailboxSettings,
      ...scanWindow,
      email: z.string().min(1).max(120).describe("Email address of the mailbox. Max 120 chars."),
    }),
  });
}

const oauthTokenSecrets: SecretFields = [
  {
    path: "accessToken",
    label: "OAuth access token",
    sensitive: true,
    required: true,
    help: "The mail provider's OAuth2 access_token for this mailbox (max 6000 characters).",
  },
  {
    path: "refreshToken",
    label: "OAuth refresh token",
    sensitive: true,
    required: true,
    help: "The mail provider's OAuth2 refresh_token for this mailbox (max 2000 characters).",
  },
];

// Omitted: "User OAuth Redirect" (#method-email_scanner_9, GET /email/v2/mailboxes/auth/{code}) is a URL the
// end user's browser is sent to, not a JSON API call. email_parsing.start_mailbox_auth describes it.

/** Raw Email Parsing API endpoints, including the Email Scanner mailboxes (https://awardwallet.com/api/email). */
export const emailParsingOperations: ApiOperation[] = [
  {
    id: "email_parsing.parse_email",
    api: "emailParsing",
    title: "Submit an email for parsing",
    description:
      "Submits one email (full raw MIME source) for travel itinerary and loyalty statement parsing. Asynchronous: returns status queued or error and requestIds (several if the email contains attached emails). Results are POSTed to callbackUrl when given; otherwise poll email_parsing.get_parse_results with each requestId.",
    method: "POST",
    path: "/parseEmail",
    access: "write",
    docsUrl: `${DOCS}#method-email_Parsing_1`,
    input: z.object({
      body: z.object({
        email: z
          .string()
          .min(1)
          .describe("Full email source, including MIME headers and MIME body: the raw message text, as in an .eml file"),
        callbackUrl: z
          .string()
          .optional()
          .describe(
            "URL that receives the results (JSON POST with HTTP basic auth, retried for about 22 h). Its domain must be registered with AwardWallet first. Omit to poll email_parsing.get_parse_results.",
          ),
        returnEmail: z
          .enum(RETURN_EMAIL)
          .describe(
            "Whether the results include the original email (base64-encoded): headers (headers only), all (entire email) or none",
          ),
        userData: z
          .string()
          .optional()
          .describe("Any text, returned untouched in the results (e.g. your internal message id)"),
      }),
    }),
    keywords: ["email", "parse", "itinerary", "reservation", "confirmation", "mime", "eml"],
  },
  {
    id: "email_parsing.get_parse_results",
    api: "emailParsing",
    title: "Get email parsing results",
    description:
      "Returns the parsing result of an email submitted in the last two weeks: status (success, queued, invalid, review, restricted, skipped, timeout), providerCode, itineraries, loyaltyAccount, pricingInfo and metadata. If status is queued, call again in a few seconds.",
    method: "GET",
    path: "/getResults/{requestId}",
    access: "read",
    docsUrl: `${DOCS}#method-email_Parsing_2`,
    input: z.object({
      requestId: z.string().min(1).describe("A requestId returned by email_parsing.parse_email"),
    }),
    keywords: ["results", "itineraries", "status", "requestId", "poll"],
  },
  {
    id: "email_parsing.list_providers",
    api: "emailParsing",
    title: "List email parsing providers",
    description:
      "Lists the providers supported by the Email Parsing API: code, display name, supported languages, estimated number of email formats, and the loyalty properties and history columns read from account statements. Differs from the Web Parsing provider list.",
    method: "GET",
    path: "/providers/list",
    access: "read",
    docsUrl: `${DOCS}#method-email_Parsing_3`,
    input: z.object({}),
    keywords: ["providers", "programs", "airlines", "hotels", "supported", "statements"],
  },
  {
    id: "email_parsing.detect_mailbox_type",
    api: "emailParsing",
    title: "Detect mailbox type",
    description:
      "Tells how a mailbox should be connected (imap, google, microsoft, yahoo or aol), detecting custom domains hosted by Google Apps or Microsoft Office 365. Use it to choose between email_parsing.connect_imap_mailbox and the OAuth options (email_parsing.start_mailbox_auth or a connect_*_mailbox operation).",
    method: "GET",
    path: "/mailboxes/detect-type/{email}",
    access: "read",
    docsUrl: `${DOCS}#method-email_scanner_1`,
    input: z.object({
      email: z.string().min(1).describe("Any email address to test; it does not need to be connected to AwardWallet"),
    }),
    keywords: ["mailbox", "detect", "gmail", "outlook", "office 365", "imap"],
  },
  {
    id: "email_parsing.connect_imap_mailbox",
    api: "emailParsing",
    title: "Connect a mailbox via IMAP",
    description:
      "Connects a mailbox over IMAP for itinerary scanning; use only if it is neither a Google nor a Microsoft mailbox (see email_parsing.detect_mailbox_type). The IMAP password is collected on the secure form. Returns the Mailbox (id, state connecting). Itineraries are POSTed to callbackUrl; track progress with email_parsing.get_mailbox.",
    method: "POST",
    path: "/mailboxes/connect/imap",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_2`,
    input: z.object({
      body: z.object({
        callbackUrl: mailboxCallbackUrl.describe(MAILBOX_CALLBACK_DESC),
        ...mailboxSettings,
        ...scanWindow,
        host: z
          .string()
          .max(120)
          .optional()
          .describe("IMAP server address; detected automatically when omitted. Max 120 chars."),
        port: z.number().int().optional().describe("IMAP server port; detected automatically when omitted"),
        login: z
          .string()
          .min(1)
          .max(120)
          .describe("IMAP server login, in most cases the email address. Max 120 chars."),
        secure: z
          .boolean()
          .optional()
          .describe("true to use SSL/TLS, false not to; detected automatically when omitted"),
      }),
    }),
    secretFields: [
      {
        path: "password",
        label: "IMAP password",
        sensitive: true,
        required: true,
        help: "Password of the IMAP account (max 250 characters).",
      },
    ],
    keywords: ["mailbox", "imap", "email scanner", "connect", "scan"],
  },
  {
    id: "email_parsing.connect_google_mailbox",
    api: "emailParsing",
    title: "Connect a Google mailbox",
    description:
      "Connects a Gmail or Google Apps mailbox for itinerary scanning with OAuth tokens you already hold (collected on the secure form). Returns the Mailbox (id, state connecting); itineraries are POSTed to callbackUrl. Without tokens, use email_parsing.start_mailbox_auth instead.",
    method: "POST",
    path: "/mailboxes/connect/google",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_3`,
    input: oauthConnectInput(),
    secretFields: oauthTokenSecrets,
    keywords: ["mailbox", "gmail", "google", "oauth", "email scanner"],
  },
  {
    id: "email_parsing.connect_microsoft_mailbox",
    api: "emailParsing",
    title: "Connect a Microsoft mailbox",
    description:
      "Connects a Microsoft mailbox (live.com, hotmail.com, outlook.com or Office 365) for itinerary scanning with OAuth tokens you already hold (collected on the secure form). Returns the Mailbox (id, state connecting); itineraries are POSTed to callbackUrl. Without tokens, use email_parsing.start_mailbox_auth instead.",
    method: "POST",
    path: "/mailboxes/connect/microsoft",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_4`,
    input: oauthConnectInput(),
    secretFields: oauthTokenSecrets,
    keywords: ["mailbox", "outlook", "hotmail", "office 365", "oauth", "email scanner"],
  },
  {
    id: "email_parsing.connect_yahoo_mailbox",
    api: "emailParsing",
    title: "Connect a Yahoo mailbox",
    description:
      "Connects a Yahoo mailbox for itinerary scanning with OAuth tokens you already hold (collected on the secure form); requires Verizon Media Mail API approval. Returns the Mailbox (id, state connecting); itineraries are POSTed to callbackUrl. Without tokens, use email_parsing.start_mailbox_auth instead.",
    method: "POST",
    path: "/mailboxes/connect/yahoo",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_5`,
    input: oauthConnectInput(),
    secretFields: oauthTokenSecrets,
    keywords: ["mailbox", "yahoo", "oauth", "email scanner"],
  },
  {
    id: "email_parsing.connect_aol_mailbox",
    api: "emailParsing",
    title: "Connect an AOL mailbox",
    description:
      "Connects an AOL mailbox for itinerary scanning with OAuth tokens you already hold (collected on the secure form); requires Verizon Media Mail API approval. Returns the Mailbox (id, state connecting); itineraries are POSTed to callbackUrl. Without tokens, use email_parsing.start_mailbox_auth instead.",
    method: "POST",
    path: "/mailboxes/connect/aol",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_6`,
    input: oauthConnectInput(),
    secretFields: oauthTokenSecrets,
    keywords: ["mailbox", "aol", "oauth", "email scanner"],
  },
  {
    id: "email_parsing.start_mailbox_auth",
    api: "emailParsing",
    title: "Begin mailbox OAuth",
    description:
      "Starts an OAuth mailbox connection (google, microsoft, yahoo or aol) and returns a code valid for 1 hour. Send the user's browser to https://service.awardwallet.com/email/v2/mailboxes/auth/{code} (email-eu host for the EU); after consent they return to redirectUrl with state and mailboxId. Then call email_parsing.get_mailbox.",
    method: "POST",
    path: "/mailboxes/start-auth",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_7`,
    input: z.object({
      body: z.object({
        callbackUrl: mailboxCallbackUrl.describe(MAILBOX_CALLBACK_DESC),
        ...mailboxSettings,
        ...scanWindow,
        provider: z
          .enum(["google", "microsoft", "yahoo", "aol"])
          .describe("Mailbox provider to authenticate against"),
        ...oauthRedirect,
      }),
    }),
    keywords: ["mailbox", "oauth", "authorize", "redirect", "gmail", "outlook", "email scanner"],
  },
  {
    id: "email_parsing.update_mailbox_auth",
    api: "emailParsing",
    title: "Update mailbox authentication",
    description:
      "Starts re-authentication of a connected mailbox: returns a code for the same browser redirect as email_parsing.start_mailbox_auth (/email/v2/mailboxes/auth/{code}). If the user signs in to a different mailbox, a new mailbox is created instead of updating this one.",
    method: "POST",
    path: "/mailboxes/{mailboxId}/update-auth",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_8`,
    input: z.object({
      mailboxId,
      body: z.object({
        startFrom,
        ...oauthRedirect,
      }),
    }),
    keywords: ["mailbox", "oauth", "reauthenticate", "reconnect", "email scanner"],
  },
  {
    id: "email_parsing.get_mailbox",
    api: "emailParsing",
    title: "Get mailbox info",
    description:
      "Returns one scanner mailbox: id, type, state (connecting, error, scanning, listening, finished), errorCode and errorMessage, email (or IMAP host and login), tags, userData, callback settings, startFrom and listen.",
    method: "GET",
    path: "/mailboxes/{mailboxId}",
    access: "read",
    docsUrl: `${DOCS}#method-email_scanner_10`,
    input: z.object({ mailboxId }),
    keywords: ["mailbox", "state", "status", "email scanner"],
  },
  {
    id: "email_parsing.update_mailbox",
    api: "emailParsing",
    title: "Update mailbox info",
    description:
      "Updates a mailbox's tags, userData, callbackUrl, onProgress or returnEmail; to re-authenticate, supply new OAuth tokens (Google, Microsoft, Yahoo, AOL mailboxes) or IMAP settings and password. Tokens and password are optional; to supply them call with collectSecrets=true (secure form). Returns the updated Mailbox.",
    method: "PUT",
    path: "/mailboxes/{mailboxId}",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_11`,
    input: z.object({
      mailboxId,
      // Upstream body is oneOf UpdateOAuthMailboxRequest | UpdateImapMailboxRequest, merged here.
      body: z.object({
        callbackUrl: mailboxCallbackUrl.optional().describe(MAILBOX_CALLBACK_DESC),
        ...mailboxSettings,
        host: z.string().max(120).optional().describe("IMAP mailboxes only: IMAP server address. Max 120 chars."),
        port: z.number().int().optional().describe("IMAP mailboxes only: IMAP server port"),
        login: z
          .string()
          .max(120)
          .optional()
          .describe("IMAP mailboxes only: IMAP server login, in most cases the email address. Max 120 chars."),
        secure: z.boolean().optional().describe("IMAP mailboxes only: true to use SSL/TLS, false not to"),
      }),
    }),
    secretFields: [
      {
        path: "accessToken",
        label: "New OAuth access token",
        sensitive: true,
        required: false,
        help: "Google, Microsoft, Yahoo or AOL mailboxes only, to re-authenticate (max 6000 characters).",
      },
      {
        path: "refreshToken",
        label: "New OAuth refresh token",
        sensitive: true,
        required: false,
        help: "Google, Microsoft, Yahoo or AOL mailboxes only, to re-authenticate (max 2000 characters).",
      },
      {
        path: "password",
        label: "New IMAP password",
        sensitive: true,
        required: false,
        help: "IMAP mailboxes only (max 250 characters).",
      },
    ],
    keywords: ["mailbox", "tags", "tokens", "settings", "email scanner"],
  },
  {
    id: "email_parsing.list_mailboxes",
    api: "emailParsing",
    title: "List mailboxes",
    description:
      "Lists scanner mailboxes, optionally filtered by tags (a mailbox must have all of them), states, types, error codes or emails. Returns at most 500 Mailbox objects; use email_parsing.scroll_mailboxes for larger sets.",
    method: "GET",
    path: "/mailboxes/",
    access: "read",
    docsUrl: `${DOCS}#method-email_scanner_12`,
    input: z.object({
      query: z.object({ ...mailboxFilters }).optional(),
    }),
    keywords: ["mailboxes", "email scanner", "tags", "filter"],
  },
  {
    id: "email_parsing.scroll_mailboxes",
    api: "emailParsing",
    title: "List mailboxes with pagination",
    description:
      "Lists scanner mailboxes one page at a time, with the same filters as email_parsing.list_mailboxes. Returns items and nextPageToken; pass it as pageToken for the next page. No nextPageToken means there are no more records.",
    method: "GET",
    path: "/mailboxes/scroll",
    access: "read",
    docsUrl: `${DOCS}#method-email_scanner_13`,
    input: z.object({
      query: z
        .object({
          ...mailboxFilters,
          pageToken: z
            .string()
            .optional()
            .describe("nextPageToken from the previous response; omit on the first call"),
        })
        .optional(),
    }),
    keywords: ["mailboxes", "pagination", "scroll", "email scanner"],
  },
  {
    id: "email_parsing.disconnect_mailbox",
    api: "emailParsing",
    title: "Disconnect a mailbox",
    description:
      'Removes a mailbox from scanning. Set revoke to true to also revoke its OAuth tokens (default false). Returns "successfully deleted", or 404 if the mailbox is not found.',
    method: "POST",
    path: "/mailboxes/disconnect/{mailboxId}",
    access: "write",
    docsUrl: `${DOCS}#method-email_scanner_14`,
    input: z.object({
      mailboxId,
      query: z
        .object({
          revoke: z.boolean().optional().describe("true to revoke the tokens of an OAuth mailbox. Default false."),
        })
        .optional(),
    }),
    keywords: ["mailbox", "disconnect", "remove", "delete", "revoke"],
  },
];
