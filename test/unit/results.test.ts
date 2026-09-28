import { describe, expect, it } from "vitest";
import { accountExpirations, localDate, parseDate } from "../../src/awardwallet/format.js";
import { redactValues } from "../../src/secure-input.js";
import { daysUntil } from "../../src/tools/account-tools.js";
import { fitResult } from "../../src/tools/results.js";

describe("fitResult", () => {
  it("returns small results unchanged", () => {
    expect(fitResult({ a: [1, 2] })).toBe('{"a":[1,2]}');
  });

  it("trims the largest array by whole items and keeps metadata and valid JSON", () => {
    const data = {
      notes: ["Included people 1-30 of 45; call again with peopleOffset=30"],
      morePages: [{ userId: 1, pageToken: "abc" }],
      accounts: Array.from({ length: 500 }, (_, i) => ({ accountId: i, program: "x".repeat(300) })),
    };
    const text = fitResult(data, 20_000);
    expect(text.length).toBeLessThanOrEqual(20_000);
    const parsed = JSON.parse(text);
    expect(parsed.notes).toEqual(data.notes);
    expect(parsed.morePages).toEqual(data.morePages);
    expect(parsed.accounts.length).toBeGreaterThan(0);
    expect(parsed.accounts.length).toBeLessThan(500);
    expect(parsed.truncated).toMatch(new RegExp(`accounts: showing ${parsed.accounts.length} of 500 items`));
  });

  it("finds nested arrays in raw API responses", () => {
    const data = { operation: "x.y", response: { itineraries: Array.from({ length: 200 }, () => ({ note: "y".repeat(500) })), nextPageToken: "tok" } };
    const parsed = JSON.parse(fitResult(data, 20_000));
    expect(parsed.response.nextPageToken).toBe("tok");
    expect(parsed.truncated).toMatch(/response\.itineraries: showing \d+ of 200 items/);
  });
});

describe("dates", () => {
  it("counts days from the local calendar date, not UTC", () => {
    const lateEvening = new Date(2026, 8, 28, 23, 30); // 28 Sep 2026, 23:30 local time
    expect(localDate(lateEvening)).toBe("2026-09-28");
    expect(daysUntil("2026-09-28", lateEvening)).toBe(0);
    expect(daysUntil("2026-11-12", lateEvening)).toBe(45);
    expect(daysUntil("n/a", lateEvening)).toBeUndefined();
  });
});

describe("parseDate", () => {
  it("reads the date formats providers use", () => {
    expect(parseDate("2027-01-31T00:00:00+00:00")).toBe("2027-01-31");
    expect(parseDate("31 Mar 2027")).toBe("2027-03-31");
    expect(parseDate("10-Dec-26")).toBe("2026-12-10");
    expect(parseDate("Jan 31, 2028")).toBe("2028-01-31");
    expect(parseDate("September 5, 2026")).toBe("2026-09-05");
    expect(parseDate("3/31/27")).toBe("2027-03-31");
    expect(parseDate("n/a")).toBeUndefined();
    expect(parseDate("Gold")).toBeUndefined();
    expect(parseDate(null)).toBeUndefined();
  });
});

describe("accountExpirations", () => {
  it("collects points, sub-accounts, status and named expiry properties without duplicates", () => {
    const list = accountExpirations({
      accountId: 1, code: "x", displayName: "X", kind: "Hotels", login: "a", balance: "10,000", balanceRaw: 10000, owner: "A", errorCode: 1,
      expirationDate: "2026-12-01T00:00:00+00:00",
      properties: [
        { name: "Level", value: "Gold", kind: 3 },
        { name: "Expiration", value: "12/1/2026", kind: 2 },
        { name: "Status valid until", value: "Feb 28, 2027", kind: 15 },
        { name: "Certificate expires", value: "15 Nov 2026" },
      ],
      subAccounts: [{ subAccountId: 7, displayName: "Free Night", balance: "1", balanceRaw: 1, expirationDate: "2026-10-15T00:00:00+00:00" }],
    });
    expect(list).toEqual([
      { date: "2026-10-15", what: "Free Night", amount: "1", subAccountId: 7 },
      { date: "2026-11-15", what: "Certificate expires" },
      { date: "2026-12-01", what: "points/miles", amount: "10,000" },
      { date: "2027-02-28", what: "elite status (Gold)" },
    ]);
  });
});

describe("redactValues", () => {
  it("scrubs submitted secrets anywhere in a response or message", () => {
    const response = { echo: "login failed for hunter2!", nested: [{ value: "hunter2" }], count: 3 };
    expect(redactValues(response, ["hunter2"])).toEqual({ echo: "login failed for [redacted]!", nested: [{ value: "[redacted]" }], count: 3 });
    expect(redactValues("bad password hunter2", ["hunter2"])).toBe("bad password [redacted]");
  });

  it("ignores very short values that would over-redact", () => {
    expect(redactValues("a b c", ["a"])).toBe("a b c");
  });
});
