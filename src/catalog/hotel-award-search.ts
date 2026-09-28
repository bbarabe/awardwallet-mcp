import { z } from "zod";
import type { ApiOperation } from "./types.js";

const DOCS = "https://awardwallet.com/api/hotel-award-search";

/** Raw Hotel Award Search (Hotel Reward Availability) API endpoints (https://awardwallet.com/api/hotel-award-search), base URL https://ra-hotels.awardwallet.com/v1. */
export const hotelAwardSearchOperations: ApiOperation[] = [
  {
    id: "hotel_award_search.list_providers",
    api: "hotelAwardSearch",
    title: "List supported hotel programs",
    description:
      "Lists the hotel programs Hotel Award Search supports: code, names, authMode (none/optional/pooled/consumer), account benefits, known challenge types and login fields. Use code as provider in hotel_award_search.submit_search.",
    method: "GET",
    path: "/providers/list",
    access: "read",
    docsUrl: `${DOCS}#method-providers_1`,
    input: z.object({}),
    keywords: ["hotels", "programs", "supported", "loyalty"],
  },
  {
    id: "hotel_award_search.submit_search",
    api: "hotelAwardSearch",
    title: "Submit a hotel award search",
    description:
      "Queues an async award-night search on one hotel program for a destination and dates; returns a requestId to poll with hotel_award_search.get_search_results. For member pricing set loyaltyAccount.login and call with collectSecrets=true (password on the secure form). One-time-code/security answers aren't supported, so a security_question challenge can't finish here.",
    method: "POST",
    path: "/search",
    access: "write",
    docsUrl: `${DOCS}#method-search_1`,
    input: z.object({
      body: z.object({
        provider: z
          .string()
          .min(1)
          .describe("Hotel program code from hotel_award_search.list_providers, e.g. 'marriott'"),
        destination: z
          .string()
          .min(1)
          .describe("Where to look for hotels, e.g. 'Atlanta, Georgia, United States'"),
        checkInDate: z.iso.date().describe("Check-in date, YYYY-MM-DD"),
        checkOutDate: z.iso.date().optional().describe("Check-out date, YYYY-MM-DD"),
        numberOfRooms: z.number().int().min(1).max(2).describe("Number of rooms (max 2)"),
        numberOfAdults: z.number().int().min(1).max(4).describe("Adults per room (max 4)"),
        numberOfKids: z.number().int().min(0).max(4).describe("Kids per room (max 4)"),
        downloadPreview: z
          .boolean()
          .optional()
          .describe("If true, results carry each hotel's preview image as a base64 string (much larger responses)"),
        priority: z
          .number()
          .int()
          .min(1)
          .max(9)
          .describe("1 (lowest, background searches) to 9 (highest, a user is waiting); lower priorities may be throttled"),
        callbackUrl: z
          .url()
          .optional()
          .describe(
            "URL AwardWallet POSTs the results to (HTTP Basic auth); its domain must be registered with AwardWallet first. Omit to poll get_search_results.",
          ),
        userData: z.string().optional().describe("Any string; returned untouched with the results"),
        loyaltyAccount: z
          .object({
            accountId: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Id of a loyalty account already registered with AwardWallet (stored credentials); use instead of login/password"),
            login: z.string().optional().describe("Login for the hotel program website; required unless accountId is given"),
            login2: z
              .string()
              .optional()
              .describe("Second login value when the provider has one (see login2 in list_providers), e.g. last name"),
            browserState: z
              .string()
              .optional()
              .describe("browserState returned by an earlier search with this account; avoids repeat security questions"),
          })
          .optional()
          .describe(
            "Member account to search with: required for authMode consumer, optional otherwise. Give accountId, or login (+ login2) with the password entered on the secure form.",
          ),
      }),
    }),
    secretFields: [
      {
        path: "loyaltyAccount.password",
        label: "Hotel account password",
        sensitive: true,
        required: false,
        help: "Password for loyaltyAccount.login. Leave empty for anonymous or AwardWallet-pooled searches, or when using accountId.",
      },
    ],
    keywords: ["award nights", "hotel availability", "free night", "reward stay", "points", "hotels"],
  },
  {
    id: "hotel_award_search.get_search_results",
    api: "hotelAwardSearch",
    title: "Get hotel award search results",
    description:
      "Returns a hotel award search's status and results: state (queued_up = poll again; success; warning; invalid_credentials; security_question; provider_error; unknown_error; timeout) and hotels with rooms, points-per-night rates, cash co-pays, ratings and address. Reuse any browserState in the next submit_search.",
    method: "GET",
    path: "/getResults/{requestId}",
    access: "read",
    docsUrl: `${DOCS}#method-search_2`,
    input: z.object({
      requestId: z
        .string()
        .regex(/^[A-Za-z0-9_-]+$/)
        .describe("requestId returned by hotel_award_search.submit_search"),
    }),
    keywords: ["award nights", "results", "status", "points per night", "hotels", "poll"],
  },
];
