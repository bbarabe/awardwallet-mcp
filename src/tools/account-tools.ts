/** Purpose-built tools over the AwardWallet Account Access API. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AccountAccessService } from "../awardwallet/access.js";
import { API_DOCS, API_NAMES, type AwardWalletClient } from "../awardwallet/client.js";
import { accountDetails, type AccountRow, localDate, PROVIDER_KINDS, summarizeAccount, summarizeItinerary, summarizeProvider } from "../awardwallet/format.js";
import type { Itinerary } from "../awardwallet/types.js";
import type { ApiId } from "../catalog/types.js";
import { ACCOUNT_ACCESS_LEVELS, type AppConfig, TRIP_ACCESS_LEVELS } from "../config.js";
import { credentialStoreName, loadKeyring } from "../credentials.js";
import { fail, guard, ok, READ_ONLY } from "./results.js";

export interface ToolContext {
  config: AppConfig;
  client: AwardWalletClient;
  service: AccountAccessService;
}

const ACCOUNT_KINDS = ["Airlines", "Hotels", "Credit Cards", "Shopping", "Rentals", "Dining", "Trains", "Cruises", "Surveys", "Other"] as const;
const ITINERARY_TYPES = ["flight", "hotelReservation", "carRental", "train", "bus", "cruise", "ferry", "transfer", "event", "parking"] as const;
const OK_STATUSES = new Set(["ok", "ok, with a warning", "never updated"]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from the local "today" to a YYYY-MM-DD date. */
export function daysUntil(date: string | undefined, now = new Date()): number | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localDate(now)}T00:00:00Z`)) / DAY_MS);
}

const holderLabel = (h: { type: string; id: number; name: string }) => `${h.name} (${h.type === "connectedUser" ? "userId" : "memberId"} ${h.id})`;

export function registerAccountTools(server: McpServer, ctx: ToolContext): void {
  const { service, config } = ctx;

  server.registerTool(
    "get_status",
    {
      title: "AwardWallet connection status",
      description:
        "Shows which AwardWallet APIs this server can use and where each credential comes from, whether demo or read-only mode is on, and how many people and accounts the AwardWallet Business account can see. Useful to explain missing data or configuration errors.",
      inputSchema: {},
      annotations: { title: "AwardWallet connection status", ...READ_ONLY },
    },
    async (_args, extra) =>
      guard(async () => {
        const apis = (Object.keys(API_NAMES) as ApiId[]).map((api) => ({
          api: API_NAMES[api],
          configured: ctx.client.isConfigured(api),
          credentialSource: config.credentialSources[api],
          docs: API_DOCS[api],
        }));
        let businessAccount: unknown;
        if (ctx.client.isConfigured("accountAccess")) {
          try {
            const people = await service.listPeople(extra.signal);
            businessAccount = {
              connectedUsers: people.connectedUsers.length,
              pendingInvitations: people.connectedUsers.filter((u) => u.connectionType === "Pending").length,
              members: people.members.length,
              accounts:
                people.connectedUsers.reduce((n, u) => n + (u.accountsIndex?.length ?? 0), 0) +
                people.members.reduce((n, m) => n + (m.accountsIndex?.length ?? 0), 0),
            };
          } catch (error) {
            businessAccount = { error: error instanceof Error ? error.message : String(error) };
          }
        }
        // The Claude Desktop extension ships without the native keyring module, so it can't see keys saved by `login`.
        const keyring = await loadKeyring();
        const noKey = "No Account Access API key found. Get it from your AwardWallet Business account's API settings, then";
        return ok({
          mode: config.mockMode ? "demo (built-in sample data; nothing is sent to AwardWallet)" : "live",
          readOnly: config.readOnly,
          connectionLinks: config.connectLinks && !config.readOnly,
          apis,
          businessAccount,
          credentialStore: keyring ? credentialStoreName() : "unavailable (optional module not installed)",
          setupHelp: ctx.client.isConfigured("accountAccess")
            ? undefined
            : keyring
              ? `${noKey} run \`awardwallet-mcp login\` or set AW_API_KEY.`
              : `${noKey} enter it in Claude Desktop under Settings → Extensions → AwardWallet → Configure, or set AW_API_KEY in your MCP client's config. This copy of the server can't read the OS credential store, so a key saved with \`awardwallet-mcp login\` isn't visible to it.`,
        });
      }),
  );

  server.registerTool(
    "list_people",
    {
      title: "List people",
      description:
        "Lists the people whose loyalty accounts your AwardWallet Business account can see: connected AwardWallet users (with the account and trip access each one granted) and members you added in the business interface, with how many accounts each has. Returns the userId and memberId values other tools accept.",
      inputSchema: {},
      annotations: { title: "List people", ...READ_ONLY },
    },
    async (_args, extra) =>
      guard(async () => {
        const people = await service.listPeople(extra.signal);
        const connectedUsers = people.connectedUsers.map((u) => ({
          userId: Number(u.userId),
          name: u.fullName,
          email: u.email,
          awardWalletPlan: u.status,
          connection: u.connectionType,
          accountAccess: u.accountsAccessLevel,
          tripAccess: u.tripAccessLevel,
          sharesNewAccountsAutomatically: u.accountsSharedByDefault,
          accounts: u.accountsIndex?.length ?? 0,
        }));
        const members = people.members.map((m) => ({
          memberId: Number(m.memberId),
          name: m.fullName,
          email: m.email,
          accounts: m.accountsIndex?.length ?? 0,
        }));
        const notes: string[] = [];
        if (connectedUsers.some((u) => u.awardWalletPlan === "Free")) {
          notes.push("Accounts of free (non-Plus) AwardWallet users hide history, expiration dates and most properties unless your Business account has a paid subscription.");
        }
        if (connectedUsers.some((u) => u.connection === "Pending")) notes.push("Pending users haven't accepted their invitation yet.");
        return ok({ connectedUsers, members, notes });
      }),
  );

  server.registerTool(
    "list_loyalty_accounts",
    {
      title: "List loyalty accounts",
      description:
        "Lists loyalty accounts (airline miles, hotel points, credit-card rewards, rentals, shopping, ...) with balance, elite status, last change, update status and everything that expires on them (points, certificates and other sub-accounts such as free nights or companion passes, elite status), one compact row per account, plus a summary of upcoming expirations and accounts with update problems. Filter by person, program, type, balance or an expiration date. For one account's full properties and transaction history use get_loyalty_account.",
      inputSchema: {
        userId: z.number().int().positive().optional().describe("Only accounts shared by this connected user (userId from list_people)"),
        memberId: z.number().int().positive().optional().describe("Only accounts of this business member (memberId from list_people)"),
        owner: z.string().min(1).max(100).optional().describe("Case-insensitive match on the account owner's name (users can share family members' accounts)"),
        program: z.string().min(1).max(100).optional().describe("Case-insensitive match on the program name or code, e.g. 'marriott', 'skymiles', 'amex'"),
        kind: z.enum(ACCOUNT_KINDS).optional().describe("Program type"),
        expiringBy: z.iso.date().optional().describe("Only accounts where something (points, a certificate or other sub-account, elite status) expires from today through this date, inclusive, YYYY-MM-DD"),
        expiringWithinDays: z.number().int().min(0).max(3650).optional().describe("Same as expiringBy, counted in days from today"),
        minBalance: z.number().min(0).optional().describe("Only accounts with at least this balance"),
        problemsOnly: z.boolean().default(false).describe("Only accounts whose last update failed (bad credentials, lockout, provider error, ...)"),
        sort: z
          .enum(["program", "balance", "expiration", "lastChange"])
          .default("program")
          .describe("program: A-Z; balance: largest first; expiration: soonest first; lastChange: most recent first"),
        limit: z.number().int().min(1).max(300).default(100).describe("Maximum accounts to return"),
        peopleOffset: z.number().int().min(0).default(0).describe("With more than 30 people, how many to skip (see the pagination note in the result)"),
      },
      annotations: { title: "List loyalty accounts", ...READ_ONLY },
    },
    async (args, extra) =>
      guard(async () => {
        if (args.userId !== undefined && args.memberId !== undefined) return fail("Pass userId or memberId, not both.");
        const { groups, totalPeople, peopleOffset, errors } = await service.accountsByHolder(
          { userId: args.userId, memberId: args.memberId, peopleOffset: args.peopleOffset },
          extra.signal,
        );
        const all: AccountRow[] = groups.flatMap((g) => g.accounts.map((a) => summarizeAccount(a, g.holder)));
        const needle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
        let rows = all;
        if (args.owner) rows = rows.filter((r) => r.owner?.toLowerCase().includes(args.owner!.toLowerCase()));
        if (args.program) {
          const p = needle(args.program);
          rows = rows.filter((r) => needle(r.program).includes(p) || needle(r.programCode).includes(p));
        }
        if (args.kind) rows = rows.filter((r) => r.kind === args.kind);
        if (args.minBalance !== undefined) rows = rows.filter((r) => (r.balanceRaw ?? -1) >= args.minBalance!);
        // The expiration window: from today through the earlier of expiringBy and expiringWithinDays.
        let windowDays: number | undefined;
        if (args.expiringBy !== undefined) {
          windowDays = daysUntil(args.expiringBy);
          if (windowDays === undefined || windowDays < 0) return fail("expiringBy must be today or a later date (YYYY-MM-DD).");
        }
        if (args.expiringWithinDays !== undefined) windowDays = Math.min(windowDays ?? Infinity, args.expiringWithinDays);
        const upcoming = (r: AccountRow, maxDays: number) =>
          (r.expirations ?? []).filter((e) => {
            const d = daysUntil(e.date);
            return d !== undefined && d >= 0 && d <= maxDays;
          });
        if (windowDays !== undefined) rows = rows.filter((r) => upcoming(r, windowDays!).length > 0);
        if (args.problemsOnly) rows = rows.filter((r) => !OK_STATUSES.has(r.updateStatus));

        const byExpiration = (r: AccountRow) => daysUntil(upcoming(r, 36500)[0]?.date) ?? Number.POSITIVE_INFINITY;
        const sorters: Record<typeof args.sort, (a: AccountRow, b: AccountRow) => number> = {
          program: (a, b) => a.program.localeCompare(b.program) || a.owner.localeCompare(b.owner),
          balance: (a, b) => (b.balanceRaw ?? -1) - (a.balanceRaw ?? -1),
          expiration: (a, b) => byExpiration(a) - byExpiration(b),
          lastChange: (a, b) => (b.lastChangeDate ?? "").localeCompare(a.lastChangeDate ?? ""),
        };
        rows = [...rows].sort(sorters[args.sort]);

        const byKind: Record<string, number> = {};
        for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
        // Every expiring item in the window (90 days when no window was asked for), soonest first.
        const horizon = windowDays ?? 90;
        const upcomingExpirations = rows
          .flatMap((r) => upcoming(r, horizon).map((e) => ({ ...e, daysLeft: daysUntil(e.date), program: r.program, owner: r.owner, accountId: r.accountId })))
          .sort((a, b) => a.date.localeCompare(b.date));
        const needsAttention = rows
          .filter((r) => !OK_STATUSES.has(r.updateStatus))
          .slice(0, 10)
          .map((r) => ({ accountId: r.accountId, program: r.program, owner: r.owner, updateStatus: r.updateStatus, lastUpdated: r.lastUpdated }));

        const notes: string[] = [];
        if (errors.length) notes.push(`Could not load: ${errors.join("; ")}`);
        const shownTo = peopleOffset + groups.length + errors.length;
        if (totalPeople > shownTo) notes.push(`Included people ${peopleOffset + 1}-${shownTo} of ${totalPeople}; call again with peopleOffset=${shownTo} for the rest.`);
        if (rows.some((r) => r.balance === null)) notes.push("A null balance means AwardWallet withheld it (a lower sharing level such as 'Read numbers') or hasn't retrieved it yet.");
        const free = groups.filter((g) => g.sharing?.status === "Free").map((g) => g.holder.name);
        if (free.length) notes.push(`${free.join(", ")}: free (non-Plus) AwardWallet users, so history, expiration dates and most properties are hidden unless your Business account has a paid subscription.`);
        if (rows.length > args.limit) notes.push(`Showing ${args.limit} of ${rows.length} matching accounts; narrow the filters or raise limit.`);

        return ok({
          notes,
          summary: {
            people: groups.map((g) => holderLabel(g.holder)),
            matchingAccounts: rows.length,
            totalAccounts: all.length,
            byKind,
            upcomingExpirations: { from: localDate(), through: localDate(new Date(new Date().setDate(new Date().getDate() + horizon))), items: upcomingExpirations },
            needsAttention,
          },
          accounts: rows.slice(0, args.limit),
        });
      }),
  );

  server.registerTool(
    "get_loyalty_account",
    {
      title: "Get loyalty account",
      description:
        "Returns one loyalty account in full: balance, every tracked property (elite status, account number, points to next level, ...), sub-accounts such as individual cards, links to update it on AwardWallet, and its transaction history, paginated.",
      inputSchema: {
        accountId: z.number().int().positive().describe("accountId from list_loyalty_accounts"),
        historyLimit: z.number().int().min(0).max(500).default(50).describe("Maximum history rows to return (0 for none)"),
        historyOffset: z.number().int().min(0).default(0).describe("History rows to skip, for paging through long histories"),
      },
      annotations: { title: "Get loyalty account", ...READ_ONLY },
    },
    async ({ accountId, historyLimit, historyOffset }, extra) =>
      guard(async () => {
        const { account, holder } = await service.account(accountId, extra.signal);
        return ok(accountDetails(account, holder, historyOffset, historyLimit));
      }),
  );

  server.registerTool(
    "get_travel_timeline",
    {
      title: "Get travel timeline",
      description:
        "Lists trips from AwardWallet's travel timeline (flights, hotels, car rentals, trains, buses, cruises, ferries, transfers, parking and events) with dates, confirmation numbers, travelers and locations, sorted by start date, for a date window (default: today through 12 months ahead). Only connected users who share trips are covered, and AwardWallet requires a paid Business subscription with timeline export approval.",
      inputSchema: {
        userId: z.number().int().positive().optional().describe("Connected user whose trips to list (from list_people). Omit to combine everyone who shares trips."),
        startDate: z.iso.date().optional().describe("First date to include, YYYY-MM-DD (default: today)"),
        endDate: z.iso.date().optional().describe("Last date to include, YYYY-MM-DD (default: 12 months after startDate)"),
        types: z.array(z.enum(ITINERARY_TYPES)).min(1).optional().describe("Only these reservation types"),
        detail: z
          .enum(["summary", "full"])
          .default("summary")
          .describe("summary: one compact entry per reservation; full: AwardWallet's complete itinerary objects (much larger)"),
        pageToken: z.string().min(1).max(500).optional().describe("nextPageToken from a previous result for the same userId"),
        limit: z.number().int().min(1).max(200).default(100).describe("Maximum reservations to return"),
      },
      annotations: { title: "Get travel timeline", ...READ_ONLY },
    },
    async (args, extra) =>
      guard(async () => {
        const start = args.startDate ?? localDate();
        const end = args.endDate ?? new Date(Date.parse(`${start}T00:00:00Z`) + 365 * DAY_MS).toISOString().slice(0, 10);
        if (end < start) return fail("endDate must be on or after startDate.");
        if (args.pageToken && args.userId === undefined) return fail("pageToken requires the userId it came from.");

        let targets: { userId: number; name: string }[];
        const skipped: string[] = [];
        if (args.userId !== undefined) {
          targets = [{ userId: args.userId, name: `userId ${args.userId}` }];
        } else {
          const people = await service.listPeople(extra.signal);
          targets = [];
          for (const u of people.connectedUsers) {
            if (u.connectionType === "Pending") continue;
            if (u.tripAccessLevel === "no_access") skipped.push(u.fullName);
            else targets.push({ userId: Number(u.userId), name: u.fullName });
          }
          if (targets.length > 10) {
            skipped.push(...targets.slice(10).map((t) => `${t.name} (over the 10-person limit; pass userId)`));
            targets = targets.slice(0, 10);
          }
        }

        const collected: { itinerary: Itinerary; traveler: string; userId: number }[] = [];
        const morePages: { userId: number; name: string; pageToken: string }[] = [];
        const errors: string[] = [];
        for (const target of targets) {
          try {
            const page = await service.travelTimeline(target.userId, { start, end, pageToken: args.pageToken }, extra.signal);
            for (const itinerary of page.itineraries ?? []) collected.push({ itinerary, traveler: target.name, userId: target.userId });
            if (page.nextPageToken) morePages.push({ userId: target.userId, name: target.name, pageToken: page.nextPageToken });
          } catch (error) {
            errors.push(`${target.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const wanted = args.types ? new Set<string>(args.types) : undefined;
        const entries = collected
          .filter((x) => !wanted || wanted.has(String(x.itinerary.type)))
          .map((x) => ({ ...x, summary: summarizeItinerary(x.itinerary) }))
          .sort((a, b) => (a.summary.start ?? "").localeCompare(b.summary.start ?? ""));
        const shown = entries.slice(0, args.limit);
        const reservations =
          args.detail === "full"
            ? shown.map((x) => ({ sharedBy: { userId: x.userId, name: x.traveler }, ...x.itinerary }))
            : shown.map((x) => ({ ...x.summary, sharedBy: targets.length > 1 ? x.traveler : undefined }));

        const notes: string[] = [];
        if (skipped.length) notes.push(`Not included (no trip sharing): ${skipped.join(", ")}.`);
        if (entries.length > args.limit) notes.push(`Showing ${args.limit} of ${entries.length} reservations; narrow the dates or types, or raise limit.`);
        if (targets.length === 0) notes.push("Nobody shares trips with this business account.");
        return ok({ window: { start, end }, notes, errors, morePages, reservations });
      }),
  );

  server.registerTool(
    "search_loyalty_programs",
    {
      title: "Search loyalty programs",
      description:
        "Searches the loyalty programs AwardWallet supports by name or code (e.g. 'hyatt', 'avios', 'membership rewards'), optionally by type. Returns program codes for get_loyalty_program.",
      inputSchema: {
        query: z.string().min(1).max(100).describe("Program or company name or code"),
        kind: z.enum(Object.values(PROVIDER_KINDS) as [string, ...string[]]).optional().describe("Program type"),
        limit: z.number().int().min(1).max(50).default(20).describe("Maximum matches"),
      },
      annotations: { title: "Search loyalty programs", ...READ_ONLY },
    },
    async ({ query, kind, limit }, extra) =>
      guard(async () => {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const q = norm(query);
        const terms = q.split(" ").filter(Boolean);
        const providers = await service.providers(extra.signal);
        const scored = providers
          .filter((p) => !kind || (p.kind !== undefined && PROVIDER_KINDS[p.kind] === kind))
          .map((p) => {
            const name = norm(p.displayName);
            const code = p.code.toLowerCase();
            let score = 0;
            if (code === q.replace(/ /g, "")) score += 100;
            if (name === q) score += 80;
            if (name.startsWith(q)) score += 40;
            if (terms.every((t) => name.includes(t) || code.includes(t))) score += 20;
            else score += terms.filter((t) => name.includes(t) || code.includes(t)).length * 5;
            return { p, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.p.displayName.localeCompare(b.p.displayName));
        return ok({
          matches: scored.slice(0, limit).map(({ p }) => ({ code: p.code, name: p.displayName, kind: p.kind !== undefined ? PROVIDER_KINDS[p.kind] : undefined })),
          totalMatches: scored.length,
          programsSupported: providers.length,
        });
      }),
  );

  server.registerTool(
    "get_loyalty_program",
    {
      title: "Get loyalty program",
      description:
        "Returns what AwardWallet knows about one loyalty program: its login fields, the properties it tracks (elite status, expiration, ...), how many elite levels it has, and what AwardWallet can do with it (transaction history, itineraries, reservation lookup, expiration tracking).",
      inputSchema: {
        code: z.string().regex(/^[A-Za-z0-9]+$/, "Program codes are letters and digits only").max(60).describe("Program code from search_loyalty_programs or an account's programCode, e.g. 'marriott'"),
      },
      annotations: { title: "Get loyalty program", ...READ_ONLY },
    },
    async ({ code }, extra) => guard(async () => ok(summarizeProvider(await service.provider(code, extra.signal)))),
  );

  if (config.connectLinks && !config.readOnly) {
    server.registerTool(
      "create_connection_link",
      {
        title: "Create connection link",
        description:
          "Creates a secure AwardWallet link, valid 10 minutes, that invites someone to share their AwardWallet loyalty accounts and/or trips with your Business account. After they sign in to AwardWallet and approve, they appear in list_people. Requires AwardWallet's approval of connection links for your business.",
        inputSchema: {
          accountAccess: z
            .enum(ACCOUNT_ACCESS_LEVELS)
            .default("read_all")
            .describe("Account access to request: no_access, read_numbers, read_balances, read_all (everything but passwords) or full_control"),
          tripAccess: z.enum(TRIP_ACCESS_LEVELS).default("read_all").describe("Trip access to request: no_access, read_all or full_control"),
          shareFutureAccounts: z.boolean().optional().describe("Suggest sharing accounts they add later (they can change it)"),
          includeFamilyMembers: z.boolean().optional().describe("Suggest including their family members' accounts and trips"),
        },
        annotations: { title: "Create connection link", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async (args, extra) =>
        guard(async () => {
          if (args.accountAccess === "no_access" && args.tripAccess === "no_access") return fail("Request account access, trip access, or both.");
          const sharingDefaults: Record<string, boolean> = {};
          if (args.shareFutureAccounts !== undefined) sharingDefaults["futureAccounts"] = args.shareFutureAccounts;
          if (args.includeFamilyMembers !== undefined) {
            sharingDefaults["familyMemberAccounts"] = args.includeFamilyMembers;
            sharingDefaults["familyMemberTimelines"] = args.includeFamilyMembers;
          }
          const result = await ctx.client.request<{ url?: string }>("accountAccess", "POST", "/create-auth-url", {
            body: {
              accountAccess: args.accountAccess,
              tripAccess: args.tripAccess,
              ...(Object.keys(sharingDefaults).length ? { sharingDefaults } : {}),
              ...(config.connectRedirectUrl ? { redirectUrl: config.connectRedirectUrl } : {}),
            },
            signal: extra.signal,
          });
          if (!result?.url) return fail("AwardWallet did not return a link.");
          return ok({
            url: result.url,
            expiresInMinutes: 10,
            nextStep: "Send the link to the person. Once they approve in AwardWallet they appear in list_people.",
          });
        }),
    );
  }
}

