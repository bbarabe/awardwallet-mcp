import { z } from "zod";
import type { ApiOperation } from "./types.js";

const DOCS = "https://awardwallet.com/api/account";

const accessLevel = z
  .enum(["no_access", "read_numbers", "read_balances", "read_all", "full_control"])
  .describe(
    "Account access to request: no_access, read_numbers (numbers + elite status), read_balances (balances + elite status), read_all (everything but passwords), full_control (edit, auto-login, view passwords).",
  );

/** Raw Account Access API endpoints (https://awardwallet.com/api/account). */
export const accountAccessOperations: ApiOperation[] = [
  {
    id: "account_access.list_connected_users",
    api: "accountAccess",
    title: "List connected users",
    description:
      "Lists every AwardWallet user connected to the business account, with access levels and an index of their account ids. Raw form of list_people.",
    method: "GET",
    path: "/connectedUser",
    access: "read",
    docsUrl: `${DOCS}#method-Connected_Users_1`,
    input: z.object({}),
    keywords: ["users", "people", "family", "shared"],
  },
  {
    id: "account_access.get_connected_user",
    api: "accountAccess",
    title: "Get connected user details",
    description:
      "Returns one connected user with every loyalty account they share (history limited to 10 rows per account). Raw form of list_loyalty_accounts for one user.",
    method: "GET",
    path: "/connectedUser/{id}",
    access: "read",
    docsUrl: `${DOCS}#method-Connected_Users_2`,
    input: z.object({ id: z.number().int().positive().describe("AwardWallet userId of the connected user") }),
    keywords: ["user", "accounts", "balances"],
  },
  {
    id: "account_access.list_members",
    api: "accountAccess",
    title: "List business members",
    description:
      "Lists members (names added in the business interface, without their own AwardWallet login) with an index of their account ids.",
    method: "GET",
    path: "/member",
    access: "read",
    docsUrl: `${DOCS}#method-Members_1`,
    input: z.object({}),
    keywords: ["members", "people", "family"],
  },
  {
    id: "account_access.get_member",
    api: "accountAccess",
    title: "Get member details",
    description: "Returns one member with all of their loyalty accounts (history limited to 10 rows per account).",
    method: "GET",
    path: "/member/{id}",
    access: "read",
    docsUrl: `${DOCS}#method-Members_2`,
    input: z.object({ id: z.number().int().positive().describe("memberId") }),
    keywords: ["member", "accounts", "balances"],
  },
  {
    id: "account_access.get_account",
    api: "accountAccess",
    title: "Get account details",
    description:
      "Returns one loyalty account with its properties, sub-accounts and full transaction history, plus the member or connected user it belongs to.",
    method: "GET",
    path: "/account/{id}",
    access: "read",
    docsUrl: `${DOCS}#method-Accounts_1`,
    input: z.object({ id: z.number().int().positive().describe("accountId") }),
    keywords: ["account", "history", "transactions", "balance", "expiration"],
  },
  {
    id: "account_access.get_travel_timeline",
    api: "accountAccess",
    title: "Get travel timeline",
    description:
      "Returns a connected user's itineraries (flights, hotels, cars, trains, cruises, events, ...) between two dates, paginated with nextPageToken. Needs a paid Business subscription and timeline export approval.",
    method: "POST",
    path: "/travel-timeline/{id}",
    access: "read",
    docsUrl: `${DOCS}#method-Timeline_1`,
    input: z.object({
      id: z.number().int().positive().describe("userId of the connected user"),
      body: z.object({
        start: z.string().describe("Lower bound for the itinerary date, YYYY-MM-DD"),
        end: z.string().describe("Upper bound for the itinerary date, YYYY-MM-DD"),
        pageToken: z.string().optional().describe("nextPageToken from the previous page"),
      }),
    }),
    keywords: ["trips", "itineraries", "reservations", "flights", "hotels"],
  },
  {
    id: "account_access.list_providers",
    api: "accountAccess",
    title: "List supported providers",
    description: "Lists every loyalty program AwardWallet supports (code, display name, kind).",
    method: "GET",
    path: "/providers/list",
    access: "read",
    docsUrl: `${DOCS}#method-providers_1`,
    input: z.object({}),
    keywords: ["programs", "airlines", "hotels", "supported"],
  },
  {
    id: "account_access.get_provider",
    api: "accountAccess",
    title: "Get provider details",
    description:
      "Returns a loyalty program's login fields, tracked properties, elite level count and capabilities (history, itineraries, expiration, auto-login).",
    method: "GET",
    path: "/providers/{code}",
    access: "read",
    docsUrl: `${DOCS}#method-providers_2`,
    input: z.object({ code: z.string().regex(/^[A-Za-z0-9]+$/).describe("Provider code from list_providers, e.g. 'british'") }),
    keywords: ["program", "provider", "fields", "elite levels"],
  },
  {
    id: "account_access.create_auth_url",
    api: "accountAccess",
    title: "Create a connection link",
    description:
      "Creates a 10-minute AwardWallet OAuth link that asks a user to share accounts and/or trips with the business. Requires AwardWallet's approval of this endpoint. The create_connection_link tool wraps this with a callback page.",
    method: "POST",
    path: "/create-auth-url",
    access: "write",
    docsUrl: `${DOCS}#method-Connect_1`,
    input: z.object({
      body: z.object({
        accountAccess: accessLevel,
        tripAccess: z
          .enum(["no_access", "read_all", "full_control"])
          .describe("Trip/timeline access to request: no_access, read_all (see trips), full_control (edit trips)."),
        awardSearchAccess: z
          .enum(["no_access", "search"])
          .optional()
          .describe("'search' only if the business is provisioned for award search. Defaults to no_access."),
        sharingDefaults: z
          .object({
            futureAccounts: z.boolean().optional(),
            familyMemberAccounts: z.boolean().optional(),
            familyMemberTimelines: z.boolean().optional(),
            futureFamilyMemberTimelines: z.boolean().optional(),
          })
          .optional()
          .describe("Suggested defaults for a new connection; the user can change them."),
        state: z.string().max(200).optional().describe("Opaque value echoed back to the redirect URL"),
        redirectUrl: z
          .string()
          .url()
          .optional()
          .describe("One of the business's configured redirect URLs; required when several are configured"),
      }),
    }),
    keywords: ["invite", "connect", "share", "oauth"],
  },
  {
    id: "account_access.get_connection_info",
    api: "accountAccess",
    title: "Resolve a connection code",
    description:
      "Exchanges the ?code= received on the redirect URL (valid 3 minutes) for the newly connected userId.",
    method: "GET",
    path: "/get-connection-info/{code}",
    access: "read",
    docsUrl: `${DOCS}#method-Connect_2`,
    input: z.object({ code: z.string().min(1).describe("The code query parameter from the redirect") }),
    keywords: ["connect", "code", "userId"],
  },
];
