import { z } from "zod";
import type { ApiOperation } from "./types.js";

const DOCS = "https://awardwallet.com/api/flight-award-search";

const cabin = z.enum(["firstClass", "business", "premiumEconomy", "economy"]);

const priority = z
  .number()
  .int()
  .min(1)
  .max(9)
  .describe("1 (lowest, background searches) to 9 (highest, a user is waiting); lower priorities may be throttled");

const callbackUrl = z
  .url()
  .optional()
  .describe(
    "URL AwardWallet POSTs the results to (HTTP Basic auth); its domain must be registered with AwardWallet first. Omit to poll get_search_results.",
  );

/** Raw Flight Award Search API endpoints (https://awardwallet.com/api/flight-award-search), base URL https://ra.awardwallet.com/v1. */
export const flightAwardSearchOperations: ApiOperation[] = [
  {
    id: "flight_award_search.list_providers",
    api: "flightAwardSearch",
    title: "List supported airlines",
    description:
      "Lists the airline programs Flight Award Search supports: code, names, supported currencies, price-calendar cabins, authMode (none/optional/pooled/consumer), account benefits, known challenge types and login fields. Use code as provider in flight_award_search.submit_search.",
    method: "GET",
    path: "/providers/list",
    access: "read",
    docsUrl: `${DOCS}#method-providers_1`,
    input: z.object({}),
    keywords: ["airlines", "programs", "supported", "currencies", "price calendar"],
  },
  {
    id: "flight_award_search.submit_search",
    api: "flightAwardSearch",
    title: "Submit a flight award search",
    description:
      "Queues an async award search on one airline program for one route and date; returns a requestId to poll with flight_award_search.get_search_results. For member pricing set loyaltyAccount.login and call with collectSecrets=true (password on the secure form). One-time-code/security answers aren't supported, so a search that hits a challenge (state 10) can't finish here.",
    method: "POST",
    path: "/search",
    access: "write",
    docsUrl: `${DOCS}#method-search_1`,
    input: z.object({
      body: z.object({
        provider: z
          .string()
          .min(1)
          .describe("Airline program code from flight_award_search.list_providers, e.g. 'turkish'"),
        departure: z
          .object({
            airportCode: z.string().length(3).describe("Departure airport, 3-letter IATA code, e.g. JFK"),
            date: z.iso.date().describe("Departure date, YYYY-MM-DD"),
          })
          .describe("Departure airport and date"),
        arrival: z.string().length(3).describe("Arrival airport, 3-letter IATA code, e.g. CDG"),
        standardItineraryCOS: z
          .union([cabin, z.array(cabin).min(1)])
          .describe(
            "Cabin: firstClass, business, premiumEconomy or economy (the docs' example sends one string; their table types it as an array). Other cabins found without extra searches are returned too.",
          ),
        passengers: z
          .object({
            adults: z.number().int().min(1).optional().describe("Number of adult passengers"),
          })
          .describe("Passengers to search tickets for; only adults are supported"),
        currency: z
          .string()
          .length(3)
          .describe(
            "3-letter currency code for taxes and fees, e.g. USD; unsupported currencies are converted (see supportedCurrencies in list_providers)",
          ),
        responseTypes: z
          .array(z.enum(["singleDate", "calendar"]))
          .optional()
          .describe(
            "What to gather: singleDate (flights on the date) and/or calendar (wider date range, fewer details; only for providers with a priceCalendar)",
          ),
        priority,
        callbackUrl,
        priceCalendar: z
          .object({
            callbackUrl: z
              .url()
              .optional()
              .describe("Separate callback URL for price-calendar results; works like the main callbackUrl"),
          })
          .optional()
          .describe("Price-calendar options"),
        timeout: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max seconds the request may wait in the queue before failing with a timeout; keep it short for priority 9"),
        userData: z.string().optional().describe("Any string; returned untouched with the results"),
        loyaltyAccount: z
          .object({
            accountId: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Id of a loyalty account already registered with AwardWallet (stored credentials); use instead of login/password"),
            login: z.string().optional().describe("Login for the airline website; required unless accountId is given"),
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
        label: "Airline account password",
        sensitive: true,
        required: false,
        help: "Password or PIN for loyaltyAccount.login. Leave empty for anonymous or AwardWallet-pooled searches, or when using accountId.",
      },
    ],
    keywords: ["award availability", "award flights", "reward seats", "miles", "points", "business class", "first class", "award calendar"],
  },
  {
    id: "flight_award_search.get_search_results",
    api: "flightAwardSearch",
    title: "Get flight award search results",
    description:
      "Returns a flight award search's status and results: state (0 queued, poll again; 1 success; 9 success with warning; 2 bad credentials; 4 provider error; 6 unknown error; 10 security question; 11 timeout), routes with miles, taxes/fees and segments, calendar entries and progress. Reuse any browserState in the next submit_search.",
    method: "GET",
    path: "/getResults/{requestId}",
    access: "read",
    docsUrl: `${DOCS}#method-search_2`,
    input: z.object({
      requestId: z
        .string()
        .regex(/^[A-Za-z0-9_-]+$/)
        .describe("requestId returned by flight_award_search.submit_search"),
    }),
    keywords: ["award availability", "results", "status", "miles", "taxes", "routes", "poll"],
  },
];
