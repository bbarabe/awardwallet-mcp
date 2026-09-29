import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearResponseCache } from "../../src/awardwallet/client.js";
import { localDate } from "../../src/awardwallet/format.js";
import { loadConfig } from "../../src/config.js";
import type { SecureInputServer } from "../../src/secure-input.js";
import { createAwardWalletServer } from "../../src/server.js";

const tempDirs: string[] = [];
afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A fresh PLUGIN_DATA folder, so tests never touch this machine's real settings file. */
function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "awmcp-data-"));
  tempDirs.push(dir);
  return dir;
}

async function connect(env: Record<string, string>) {
  clearResponseCache();
  const config = await loadConfig(env);
  const { server, secureInput } = createAwardWalletServer(config);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, secureInput };
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = (result.content[0] as { text: string }).text;
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { isError: Boolean(result.isError), data, text };
}

describe("MCP tools (demo mode)", () => {
  let client: Client;
  let secureInput: SecureInputServer | undefined;

  beforeAll(async () => {
    ({ client, secureInput } = await connect({ AW_MOCK_MODE: "true", AW_CONNECT_LINKS: "true" }));
  });
  afterAll(async () => {
    await secureInput?.close();
    await client.close();
  });

  it("lists every tool with a title and read/write annotations", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "call_api_read_operation",
        "call_api_write_operation",
        "connect_awardwallet",
        "create_connection_link",
        "get_loyalty_account",
        "get_loyalty_program",
        "get_secure_input_result",
        "get_status",
        "get_travel_timeline",
        "list_loyalty_accounts",
        "list_people",
        "search_api_operations",
        "search_loyalty_programs",
      ].sort(),
    );
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations?.title, tool.name).toBeTruthy();
      expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe("boolean");
      expect(typeof tool.annotations?.destructiveHint, tool.name).toBe("boolean");
      expect(tool.name.length).toBeLessThanOrEqual(64);
    }
    const writeTools = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name).sort();
    expect(writeTools).toEqual(["call_api_write_operation", "connect_awardwallet", "create_connection_link"]);
  });

  it("get_status reports demo mode and the business account", async () => {
    const { data, isError } = await call(client, "get_status");
    expect(isError).toBe(false);
    expect(data.mode).toMatch(/^demo/);
    expect(data.businessAccount).toMatchObject({ connectedUsers: 2, members: 1, accounts: 8 });
    expect(data.apis.every((a: any) => a.configured)).toBe(true);
  });

  it("list_people returns users and members with their ids", async () => {
    const { data } = await call(client, "list_people");
    expect(data.connectedUsers.map((u: any) => u.userId)).toEqual([1001, 1002]);
    expect(data.connectedUsers[1]).toMatchObject({ name: "Sam Rivera", awardWalletPlan: "Free", tripAccess: "no_access", accounts: 2 });
    expect(data.members).toEqual([{ memberId: 2001, name: "Jordan Rivera", email: "jordan.rivera@example.com", accounts: 1 }]);
    expect(data.notes.join(" ")).toMatch(/free \(non-Plus\)/);
  });

  it("list_loyalty_accounts summarizes everyone, with expiring and problem accounts", async () => {
    const { data } = await call(client, "list_loyalty_accounts");
    expect(data.summary.totalAccounts).toBe(8);
    expect(data.summary.people).toEqual(["Alex Rivera (userId 1001)", "Sam Rivera (userId 1002)", "Jordan Rivera (memberId 2001)"]);
    expect(data.summary.upcomingExpirations.items.map((e: any) => [e.program, e.what, e.daysLeft])).toEqual([
      ["Hilton (Honors)", "points/miles", 45],
      ["Marriott Bonvoy", "Free Night Award (up to 50,000 points)", 60],
      ["Delta Air Lines (SkyMiles)", "Companion Certificate (Main Cabin)", 75],
    ]);
    expect(data.summary.needsAttention).toEqual([
      expect.objectContaining({ accountId: 5004, updateStatus: "invalid credentials" }),
    ]);
    const chase = data.accounts.find((a: any) => a.programCode === "chase");
    expect(chase.subAccounts).toHaveLength(2);
    const delta = data.accounts.find((a: any) => a.programCode === "delta");
    expect(delta).toMatchObject({ balance: "84,230", balanceRaw: 84230, eliteStatus: "Gold Medallion", accountNumber: "9012345678" });
    // Certificates (sub-accounts) and elite status count as expirations, not just points.
    expect(delta.expirations.map((e: any) => e.what)).toEqual(["Companion Certificate (Main Cabin)", "elite status (Gold Medallion)"]);
    expect(delta.expirations[1].date).toBe("2028-01-31");
    expect(data.notes.join(" ")).toMatch(/Sam Rivera: free/);
  });

  it("list_loyalty_accounts filters and sorts", async () => {
    const hotels = await call(client, "list_loyalty_accounts", { kind: "Hotels", sort: "balance" });
    expect(hotels.data.accounts.map((a: any) => a.programCode)).toEqual(["marriott", "hhonors"]);

    const expiring = await call(client, "list_loyalty_accounts", { expiringWithinDays: 60 });
    expect(expiring.data.accounts.map((a: any) => a.accountId)).toEqual([5005, 5002]);

    const inDays = (n: number) => localDate(new Date(new Date().setDate(new Date().getDate() + n)));
    const byDate = await call(client, "list_loyalty_accounts", { expiringBy: inDays(50) });
    expect(byDate.data.accounts.map((a: any) => a.accountId)).toEqual([5005]);
    expect(byDate.data.summary.upcomingExpirations.through).toBe(inDays(50));

    const pastDate = await call(client, "list_loyalty_accounts", { expiringBy: "2020-01-01" });
    expect(pastDate.isError).toBe(true);

    const soonest = await call(client, "list_loyalty_accounts", { sort: "expiration", limit: 3 });
    expect(soonest.data.accounts.map((a: any) => a.accountId)).toEqual([5005, 5002, 5001]);

    const sams = await call(client, "list_loyalty_accounts", { userId: 1002, program: "south" });
    expect(sams.data.accounts.map((a: any) => a.accountId)).toEqual([5102]);

    const problems = await call(client, "list_loyalty_accounts", { problemsOnly: true });
    expect(problems.data.accounts.map((a: any) => a.accountId)).toEqual([5004]);

    const both = await call(client, "list_loyalty_accounts", { userId: 1001, memberId: 2001 });
    expect(both.isError).toBe(true);
  });

  it("get_loyalty_account returns properties, history and links", async () => {
    const { data } = await call(client, "get_loyalty_account", { accountId: 5001, historyLimit: 2 });
    expect(data.program).toBe("Delta Air Lines (SkyMiles)");
    expect(data.properties).toContainEqual({ name: "Medallion Status", value: "Gold Medallion", kind: "elite status", rank: 2 });
    expect(data.history).toMatchObject({ total: 3, offset: 0, returned: 2 });
    expect(data.history.entries[0]).toMatchObject({ description: "DL 1432 ATL-BOS", points: "+2,150", details: { Type: "Flight" } });
    expect(data.links.updateNow).toContain("autosubmit=1");
    expect(data.sharedBy).toEqual({ type: "connectedUser", id: 1001, name: "Alex Rivera" });
  });

  it("get_loyalty_account explains fields hidden for free users and reports unknown accounts", async () => {
    const sam = await call(client, "get_loyalty_account", { accountId: 5101 });
    expect(sam.data.notAvailable).toMatch(/history, expirationDate/);
    expect(sam.data.links).toBeUndefined();

    const missing = await call(client, "get_loyalty_account", { accountId: 999999 });
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/Not found at AwardWallet \(404\)/);
  });

  it("get_travel_timeline merges people who share trips and summarizes reservations", async () => {
    const { data } = await call(client, "get_travel_timeline");
    expect(data.reservations.map((r: any) => r.type)).toEqual(["flight", "hotelReservation", "carRental"]);
    expect(data.reservations[0]).toMatchObject({ title: "Flight ATL (Hartsfield-Jackson Atlanta International Airport) → ATL (Hartsfield-Jackson Atlanta International Airport)", confirmationNumbers: ["GXK4PQ"], trip: "Boston weekend" });
    expect(data.reservations[0].segments).toHaveLength(2);
    expect(data.reservations[1]).toMatchObject({ title: "Hotel: Boston Marriott Copley Place", pointsUsed: "105,000 points" });
    expect(data.notes.join(" ")).toMatch(/Not included \(no trip sharing\): Sam Rivera/);

    const flightsOnly = await call(client, "get_travel_timeline", { types: ["flight"], detail: "full" });
    expect(flightsOnly.data.reservations).toHaveLength(1);
    expect(flightsOnly.data.reservations[0].issuingCarrier.confirmationNumber).toBe("GXK4PQ");

    const denied = await call(client, "get_travel_timeline", { userId: 1002 });
    expect(denied.data.errors[0]).toMatch(/refused the request \(403\)/);

    const badWindow = await call(client, "get_travel_timeline", { startDate: "2030-02-01", endDate: "2030-01-01" });
    expect(badWindow.isError).toBe(true);
  });

  it("searches and describes loyalty programs", async () => {
    const found = await call(client, "search_loyalty_programs", { query: "marriott" });
    expect(found.data.matches[0]).toEqual({ code: "marriott", name: "Marriott Bonvoy", kind: "Hotel" });
    const cards = await call(client, "search_loyalty_programs", { query: "rewards", kind: "Credit card" });
    expect(cards.data.matches.every((m: any) => m.kind === "Credit card")).toBe(true);
    const info = await call(client, "get_loyalty_program", { code: "delta" });
    expect(info.data).toMatchObject({ code: "delta", kind: "Airline", capabilities: { expiration: "balance never expires" } });
    const bad = await call(client, "get_loyalty_program", { code: "../x" });
    expect(bad.isError).toBe(true);
  });

  it("create_connection_link returns an AwardWallet link", async () => {
    const { data } = await call(client, "create_connection_link", { accountAccess: "read_balances", tripAccess: "no_access" });
    expect(data.url).toMatch(/^https:\/\/awardwallet\.com\/user\/connections\/approve/);
    const nothing = await call(client, "create_connection_link", { accountAccess: "no_access", tripAccess: "no_access" });
    expect(nothing.isError).toBe(true);
  });

  it("searches the API catalog and returns input schemas", async () => {
    const { data } = await call(client, "search_api_operations", { query: "award flight search" });
    expect(data.operations[0].id).toBe("flight_award_search.submit_search");
    expect(data.operations[0].input.type).toBe("object");
    expect(data.operations[0].secretFields).toEqual([{ path: "body.loyaltyAccount.password", label: expect.any(String), required: false }]);

    const all = await call(client, "search_api_operations", {});
    expect(all.data.operations).toHaveLength(42);
  });

  it("enforces the read/write split in the catalog tools", async () => {
    const read = await call(client, "call_api_read_operation", { operationId: "account_access.get_account", input: { id: 5002 } });
    expect(read.data.response.account.code).toBe("marriott");

    const writeViaRead = await call(client, "call_api_read_operation", { operationId: "email_parsing.parse_email", input: {} });
    expect(writeViaRead.isError).toBe(true);
    expect(writeViaRead.text).toMatch(/only available through call_api_write_operation/);

    const readViaWrite = await call(client, "call_api_write_operation", { operationId: "account_access.list_members", input: {} });
    expect(readViaWrite.isError).toBe(true);

    const unknown = await call(client, "call_api_read_operation", { operationId: "nope.nothing" });
    expect(unknown.text).toMatch(/Unknown operation/);

    const invalid = await call(client, "call_api_read_operation", { operationId: "account_access.get_account", input: { id: "abc" } });
    expect(invalid.isError).toBe(true);
    expect(invalid.text).toMatch(/Invalid input for account_access.get_account/);
  });

  it("drops secrets smuggled into plain input and runs writes without required secrets directly", async () => {
    const { data } = await call(client, "call_api_write_operation", {
      operationId: "hotel_award_search.submit_search",
      input: {
        body: {
          provider: "marriott",
          destination: "Paris",
          checkInDate: "2030-05-01",
          checkOutDate: "2030-05-04",
          numberOfRooms: 1,
          numberOfAdults: 2,
          numberOfKids: 0,
          priority: 5,
          loyaltyAccount: { login: "me@example.com", password: "should-not-pass" },
        },
      },
    });
    // No required secret, so it runs immediately; the demo upstream echoes the body it received.
    expect(data.response.request.body.loyaltyAccount).toEqual({ login: "me@example.com" });
    expect(JSON.stringify(data)).not.toContain("should-not-pass");
  });

  it("collects required secrets on the local page, never through the tool call", async () => {
    const started = await call(client, "call_api_write_operation", {
      operationId: "email_parsing.connect_imap_mailbox",
      input: { body: { callbackUrl: "https://example.com/itineraries", login: "me@example.com", host: "imap.example.com", port: 993, secure: true } },
    });
    if (started.isError) throw new Error(started.text);
    expect(started.data.status).toBe("waiting_for_secure_input");
    const { url, submissionId } = started.data;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/secure\/[A-Za-z0-9_-]{32}$/);

    const pending = await call(client, "get_secure_input_result", { submissionId });
    expect(pending.data.status).toBe("waiting");

    const form = await fetch(url);
    expect(form.status).toBe(200);
    expect(form.headers.get("content-security-policy")).toContain("default-src 'none'");
    const page = await form.text();
    expect(page).toContain('type="password"');
    expect(page).not.toContain("<script");

    // Another site can't post the form.
    const foreign = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://evil.example" }, body: "field0=x&action=send" });
    expect(foreign.status).toBe(403);

    // Required field left empty: the form comes back with an error.
    const empty = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "field0=&action=send" });
    expect(empty.status).toBe(400);

    const sent = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "field0=hunter2&action=send" });
    expect(sent.status).toBe(200);
    expect(await sent.text()).toContain("Sent to AwardWallet");

    const done = await call(client, "get_secure_input_result", { submissionId });
    expect(done.data.status).toBe("completed");
    // The demo upstream redacts what it receives; the password field arrived at body.password.
    expect(done.data.response.request.body.password).toBe("[redacted]");
    expect(done.text).not.toContain("hunter2");

    // Single use.
    const again = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "field0=x&action=send" });
    expect(again.status).toBe(409);
  });

  it("refuses requests addressed to another host (DNS rebinding)", async () => {
    const started = await call(client, "call_api_write_operation", {
      operationId: "email_parsing.connect_imap_mailbox",
      input: { body: { callbackUrl: "https://example.com/itineraries", login: "a@example.com", host: "imap.example.com", port: 993, secure: true } },
    });
    const url = new URL(started.data.url);
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port: url.port, path: url.pathname, headers: { Host: `attacker.example:${url.port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(421);

    const cancelled = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "action=cancel" });
    expect(await cancelled.text()).toContain("Cancelled");
    const result = await call(client, "get_secure_input_result", { submissionId: started.data.submissionId });
    expect(result.data.status).toBe("cancelled");
  });

  const form = { "Content-Type": "application/x-www-form-urlencoded" };
  const imap = (body: Record<string, unknown>) =>
    call(client, "call_api_write_operation", {
      operationId: "email_parsing.connect_imap_mailbox",
      input: { body: { callbackUrl: "https://example.com/itineraries", login: "me@example.com", port: 993, ...body } },
    });

  it("shows where the secret goes and requires confirmation when encryption is off", async () => {
    const started = await imap({ host: "imap.attacker.example", port: 143, secure: false });
    const url = started.data.url as string;
    const page = await (await fetch(url)).text();
    expect(page).toContain("<th>host</th><td class=\"mono\">imap.attacker.example</td>");
    expect(page).toContain("Encryption is off");

    const unconfirmed = await fetch(url, { method: "POST", headers: form, body: "field0=hunter2&action=send" });
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.text()).toContain("Confirm that the password may be sent without encryption");

    const confirmed = await fetch(url, { method: "POST", headers: form, body: "field0=hunter2&confirmInsecure=yes&action=send" });
    expect(confirmed.status).toBe(200);
  });

  it("refuses null and cross-site origins but accepts its own", async () => {
    const started = await imap({ host: "imap.example.com", secure: true });
    const url = new URL(started.data.url as string);
    const nullOrigin = await fetch(url, { method: "POST", headers: { ...form, Origin: "null" }, body: "action=cancel" });
    expect(nullOrigin.status).toBe(403);
    const crossSite = await fetch(url, { method: "POST", headers: { ...form, "Sec-Fetch-Site": "cross-site" }, body: "action=cancel" });
    expect(crossSite.status).toBe(403);
    const own = await fetch(url, { method: "POST", headers: { ...form, Origin: url.origin, "Sec-Fetch-Site": "same-origin" }, body: "action=cancel" });
    expect(own.status).toBe(200);
  });

  it("sends at most once when the form is submitted twice at the same time", async () => {
    const started = await imap({ host: "imap.example.com", secure: true });
    const url = started.data.url as string;
    const statuses = await Promise.all([1, 2].map(() => fetch(url, { method: "POST", headers: form, body: "field0=hunter2&action=send" }).then((r) => r.status)));
    expect(statuses.sort()).toEqual([200, 409]);
  });

  it("rejects dot segments in path parameters", async () => {
    const result = await call(client, "call_api_read_operation", { operationId: "account_access.get_connection_info", input: { code: ".." } });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Invalid code/);
  });
});

describe("read-only mode", () => {
  it("registers no write tools and hides write operations", async () => {
    const { client } = await connect({ AW_MOCK_MODE: "true", AW_READ_ONLY: "true", AW_CONNECT_LINKS: "true" });
    const { tools } = await client.listTools();
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.map((t) => t.name)).not.toContain("call_api_write_operation");
    const { data } = await call(client, "search_api_operations", {});
    expect(data.operations.every((op: any) => op.access === "read")).toBe(true);
    await client.close();
  });
});

describe("unconfigured server", () => {
  it("explains how to add the API key", async () => {
    const { client, secureInput } = await connect({ PLUGIN_DATA: dataDir() });
    const status = await call(client, "get_status");
    // A key may exist in this machine's credential store; only assert when none was found.
    if (!status.data.apis[0].configured) {
      expect(status.data.setupHelp).toMatch(/connect_awardwallet/);
      const accounts = await call(client, "list_loyalty_accounts");
      expect(accounts.isError).toBe(true);
      expect(accounts.text).toMatch(/not configured.*connect_awardwallet/);
    }
    await secureInput?.close();
    await client.close();
  });
});

describe("connect_awardwallet", () => {
  const GOOD_KEY = "good-key-0123456789";
  const realFetch = globalThis.fetch;
  const form = { "Content-Type": "application/x-www-form-urlencoded" };

  beforeAll(() => {
    // AwardWallet accepts GOOD_KEY only; the test's own requests to the local page pass through.
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      if (new URL(request.url).hostname !== "business.awardwallet.com") return realFetch(input, init);
      if (request.headers.get("X-Authentication") !== GOOD_KEY) return Promise.resolve(new Response('{"error":"Invalid API key"}', { status: 401 }));
      return Promise.resolve(Response.json({ connectedUsers: [] }));
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("checks the key on the local page, saves it and uses it right away", async () => {
    const dir = dataDir();
    const { client, secureInput } = await connect({ PLUGIN_DATA: dir });
    const started = await call(client, "connect_awardwallet");
    if (started.isError) throw new Error(started.text);
    expect(started.data.status).toBe("waiting_for_secure_input");
    const url = started.data.url as string;

    const page = await (await realFetch(url)).text();
    expect(page).toContain("Connect AwardWallet");
    expect(page).toContain(join(dir, "credentials.json"));

    // A wrong key shows the form again on the same link, and nothing is saved.
    const wrong = await realFetch(url, { method: "POST", headers: form, body: "field0=bad-key-0000&action=send" });
    expect(wrong.status).toBe(400);
    const wrongPage = await wrong.text();
    expect(wrongPage).toContain("didn&#39;t accept this key");
    expect(wrongPage).not.toContain("bad-key-0000");
    expect(existsSync(join(dir, "credentials.json"))).toBe(false);

    const right = await realFetch(url, { method: "POST", headers: form, body: `field0=${GOOD_KEY}&action=send` });
    expect(right.status).toBe(200);
    expect(await right.text()).toContain("Connected");

    const result = await call(client, "get_secure_input_result", { submissionId: started.data.submissionId });
    expect(result.data).toMatchObject({ operation: "connect_awardwallet", status: "completed" });
    expect(result.text).not.toContain(GOOD_KEY);
    expect(JSON.parse(readFileSync(join(dir, "credentials.json"), "utf8"))).toEqual({ AW_API_KEY: GOOD_KEY });

    // No restart needed.
    const status = await call(client, "get_status");
    expect(status.data.apis[0]).toMatchObject({ configured: true, credentialSource: "settings file" });
    expect(status.data.setupHelp).toBeUndefined();
    await secureInput?.close();
    await client.close();

    // A new server (the next session) finds the saved key.
    const next = await loadConfig({ PLUGIN_DATA: dir });
    if (next.credentialSources.accountAccess !== "credential store") {
      expect(next.credentials.accountAccess).toBe(GOOD_KEY);
      expect(next.credentialSources.accountAccess).toBe("settings file");
    }
  });

  it("defers to a key set in the MCP client's settings", async () => {
    const { client, secureInput } = await connect({ PLUGIN_DATA: dataDir(), AW_API_KEY: GOOD_KEY });
    const result = await call(client, "connect_awardwallet");
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/AW_API_KEY environment variable/);
    await secureInput?.close();
    await client.close();
  });

  it("isn't needed in demo mode", async () => {
    const { client, secureInput } = await connect({ AW_MOCK_MODE: "true", PLUGIN_DATA: dataDir() });
    const result = await call(client, "connect_awardwallet");
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Demo mode is on/);
    await secureInput?.close();
    await client.close();
  });
});
