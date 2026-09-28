/** Compact, model-friendly views of AwardWallet responses. */
import type { Account, AccountProperty, HistoryRow, Itinerary, ProviderInfo, SubAccount } from "./types.js";

export const UPDATE_STATUS: Record<number, string> = {
  0: "never updated",
  1: "ok",
  2: "invalid credentials",
  3: "locked out by the provider",
  4: "provider error or action required on the provider's site",
  5: "provider disabled by AwardWallet",
  6: "AwardWallet could not read the provider's site",
  7: "password missing",
  8: "updates paused to prevent a lockout",
  9: "ok, with a warning",
  10: "a security question must be answered",
  11: "update timed out",
};

export const PROPERTY_KINDS: Record<number, string> = {
  1: "account number",
  2: "expiration",
  3: "elite status",
  4: "lifetime points",
  5: "member since",
  6: "expiring balance",
  7: "YTD points",
  8: "YTD segments",
  9: "next elite level",
  10: "points to next level",
  11: "segments to next level",
  12: "name on account",
  13: "last activity",
  14: "points to next reward",
  15: "status expiration",
  16: "points to retain status",
  17: "segments to retain status",
  18: "alliance elite level",
  19: "status points",
};

export const PROVIDER_KINDS: Record<number, string> = {
  1: "Airline",
  2: "Hotel",
  3: "Car rental",
  4: "Train",
  5: "Other",
  6: "Credit card",
  7: "Shopping",
  8: "Dining",
  9: "Survey",
};

/** Who shared an account: a connected AwardWallet user or a business member. */
export interface Holder {
  type: "connectedUser" | "member";
  id: number;
  name: string;
}

const present = (value: string | null | undefined): string | undefined =>
  value && value !== "n/a" && value.trim() !== "" ? value : undefined;

/** YYYY-MM-DD of `date` in the local time zone (the user's "today", not UTC's). */
export function localDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2016-01-15T00:49:33+00:00" -> "2016-01-15"; anything unparseable is returned as-is. */
export function dateOnly(value: string | null | undefined): string | undefined {
  const v = present(value ?? undefined);
  if (!v) return undefined;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : v;
}

function propertyValue(props: AccountProperty[] | undefined, kind: number): string | undefined {
  return present(props?.find((p) => p.kind === kind)?.value);
}

function hidden(account: { balanceRaw?: number | null; balance?: string }): boolean {
  return account.balanceRaw === null || account.balanceRaw === undefined;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const two = (n: number | string) => String(n).padStart(2, "0");
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Dates as providers display them ("2027-01-31T00:00:00+00:00", "31 Mar 2027", "10-Dec-26",
 * "Jan 31, 2028", "3/31/27") as YYYY-MM-DD; undefined when the value isn't a recognizable date.
 * Slash dates are read month-first, as AwardWallet shows US providers.
 */
export function parseDate(value: string | null | undefined): string | undefined {
  const v = present(value ?? undefined)?.trim();
  if (!v) return undefined;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) return `${fullYear(m[3]!)}-${two(m[1]!)}-${two(m[2]!)}`;
  if ((m = v.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*\.?[\s-,]+(\d{2}|\d{4})$/))) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (month) return `${fullYear(m[3]!)}-${two(month)}-${two(m[1]!)}`;
  }
  if ((m = v.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const month = MONTHS[m[1]!.toLowerCase()];
    if (month) return `${m[3]}-${two(month)}-${two(m[2]!)}`;
  }
  return undefined;
}

/** Something on an account that expires: its points, a certificate or other sub-account, or elite status. */
export interface Expiration {
  date: string;
  what: string;
  amount?: string;
  subAccountId?: number;
}

const EXPIRY_NAME = /expir|valid (until|thru|through)|use by/i;

/** Every dated expiration AwardWallet reports for an account, soonest first. */
export function accountExpirations(account: Account): Expiration[] {
  const out: Expiration[] = [];
  const pointsDate = parseDate(account.expirationDate);
  if (pointsDate) {
    out.push({ date: pointsDate, what: "points/miles", amount: propertyValue(account.properties, 6) ?? (hidden(account) ? undefined : account.balance) });
  }
  for (const p of account.properties ?? []) {
    const date = parseDate(p.value);
    if (!date) continue;
    if (p.kind === 15) out.push({ date, what: `elite status${propertyValue(account.properties, 3) ? ` (${propertyValue(account.properties, 3)})` : ""}` });
    else if ((p.kind === 2 || (!p.kind && EXPIRY_NAME.test(p.name))) && date !== pointsDate) out.push({ date, what: p.name });
  }
  for (const s of account.subAccounts ?? []) {
    const date = parseDate(s.expirationDate);
    if (date) out.push({ date, what: s.displayName, amount: hidden(s) ? undefined : s.balance, subAccountId: s.subAccountId });
    for (const p of s.properties ?? []) {
      const d = parseDate(p.value);
      if (d && d !== date && (p.kind === 2 || p.kind === 15 || EXPIRY_NAME.test(p.name))) out.push({ date: d, what: `${s.displayName}: ${p.name}`, subAccountId: s.subAccountId });
    }
  }
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(`${e.date}|${e.what}`) ? false : (seen.add(`${e.date}|${e.what}`), true)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => prune(e));
}

export interface AccountRow {
  accountId: number;
  owner: string;
  program: string;
  programCode: string;
  kind: string;
  accountNumber?: string;
  balance: string | null;
  balanceRaw: number | null;
  eliteStatus?: string;
  expirationDate?: string;
  expiringBalance?: string;
  lastChange?: string;
  lastChangeDate?: string;
  lastUpdated?: string;
  updateStatus: string;
  subAccounts?: { subAccountId: number; name: string; balance: string | null; balanceRaw: number | null; expirationDate?: string }[];
  /** Everything dated that expires on this account: points, certificates/sub-accounts, elite status. */
  expirations?: Expiration[];
  sharedBy: Holder;
}

export function summarizeAccount(account: Account, holder: Holder): AccountRow {
  const row: AccountRow = {
    accountId: account.accountId,
    owner: account.owner,
    program: account.displayName,
    programCode: account.code,
    kind: account.kind,
    accountNumber: propertyValue(account.properties, 1) ?? present(account.login),
    balance: hidden(account) ? null : account.balance,
    balanceRaw: account.balanceRaw ?? null,
    eliteStatus: propertyValue(account.properties, 3),
    expirationDate: dateOnly(account.expirationDate),
    expiringBalance: propertyValue(account.properties, 6),
    lastChange: present(account.lastDetectedChange),
    lastChangeDate: dateOnly(account.lastChangeDate),
    lastUpdated: dateOnly(account.lastRetrieveDate),
    updateStatus: UPDATE_STATUS[account.errorCode] ?? `status code ${account.errorCode}`,
    sharedBy: holder,
  };
  if (account.subAccounts?.length) {
    row.subAccounts = account.subAccounts.map((s) => ({
      subAccountId: s.subAccountId,
      name: s.displayName,
      balance: hidden(s) ? null : s.balance,
      balanceRaw: s.balanceRaw ?? null,
      expirationDate: dateOnly(s.expirationDate),
    }));
  }
  const expirations = accountExpirations(account);
  if (expirations.length) row.expirations = expirations;
  return prune(row);
}

export interface HistoryEntry {
  date?: string;
  description?: string;
  points?: string;
  bonus?: string;
  details?: Record<string, string>;
}

export function historyEntries(rows: HistoryRow[] | undefined): HistoryEntry[] {
  return (rows ?? []).map((row) => {
    const entry: HistoryEntry = {};
    for (const field of row.fields ?? []) {
      switch (field.code) {
        case "PostingDate":
          entry.date = field.value;
          break;
        case "Description":
          entry.description = field.value;
          break;
        case "Miles":
          entry.points = field.value;
          break;
        case "Bonus":
          entry.bonus = field.value;
          break;
        default:
          (entry.details ??= {})[field.name] = field.value;
      }
    }
    return entry;
  });
}

function page<T>(items: T[], offset: number, limit: number) {
  const slice = items.slice(offset, offset + limit);
  return { total: items.length, offset, returned: slice.length, entries: slice };
}

function describeProperties(props: AccountProperty[] | undefined) {
  return (props ?? []).map((p) =>
    prune({ name: p.name, value: p.value, kind: p.kind !== undefined ? PROPERTY_KINDS[p.kind] : undefined, rank: p.rank }),
  );
}

function subAccountDetails(sub: SubAccount, historyLimit: number) {
  const history = historyEntries(sub.history);
  return prune({
    subAccountId: sub.subAccountId,
    name: sub.displayName,
    balance: hidden(sub) ? null : sub.balance,
    balanceRaw: sub.balanceRaw ?? null,
    lastChange: present(sub.lastDetectedChange),
    expirationDate: dateOnly(sub.expirationDate),
    properties: sub.properties?.length ? describeProperties(sub.properties) : undefined,
    history: history.length ? page(history, 0, historyLimit) : undefined,
  });
}

export function accountDetails(account: Account, holder: Holder | undefined, historyOffset: number, historyLimit: number) {
  const history = historyEntries(account.history);
  const hiddenFields: string[] = [];
  if (hidden(account)) hiddenFields.push("balance");
  if (account.history === undefined || account.history === null) hiddenFields.push("history");
  if (!account.expirationDate) hiddenFields.push("expirationDate");
  return prune({
    accountId: account.accountId,
    owner: account.owner,
    program: account.displayName,
    programCode: account.code,
    kind: account.kind,
    login: present(account.login),
    balance: hidden(account) ? null : account.balance,
    balanceRaw: account.balanceRaw ?? null,
    lastChange: present(account.lastDetectedChange),
    lastChangeDate: dateOnly(account.lastChangeDate),
    lastUpdated: dateOnly(account.lastRetrieveDate),
    expirationDate: dateOnly(account.expirationDate),
    updateStatus: UPDATE_STATUS[account.errorCode] ?? `status code ${account.errorCode}`,
    providerMessage: present(account.errorMessage),
    properties: describeProperties(account.properties),
    subAccounts: account.subAccounts?.map((s) => subAccountDetails(s, historyLimit)),
    history: page(history, historyOffset, historyLimit),
    links: prune({
      autoLogin: present(account.autologinUrl),
      updateNow: present(account.updateUrl),
      edit: present(account.editUrl),
    }),
    sharedBy: holder,
    notAvailable: hiddenFields.length
      ? `${hiddenFields.join(", ")} not provided by AwardWallet. Free (non-Plus) users' accounts hide history, expiration and most properties unless the business has a paid subscription, and lower sharing levels hide more.`
      : undefined,
  });
}

// ---------- Itineraries ----------

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);
const asArr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Obj[]) : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : undefined);

function place(point: Obj | undefined): string | undefined {
  if (!point) return undefined;
  const code = str(point["airportCode"]) ?? str(point["stationCode"]);
  const name = str(point["name"]);
  const address = str(asObj(point["address"])?.["text"]) ?? str(asObj(point["address"])?.["city"]);
  if (code && name) return `${code} (${name})`;
  return code ?? name ?? address;
}

function confirmationNumbers(it: Obj): string[] {
  const numbers = new Set<string>();
  for (const c of asArr(it["confirmationNumbers"])) if (str(c["number"])) numbers.add(str(c["number"])!);
  const issuing = asObj(it["issuingCarrier"]);
  if (str(issuing?.["confirmationNumber"])) numbers.add(str(issuing!["confirmationNumber"])!);
  for (const seg of asArr(it["segments"])) {
    const conf = str(asObj(seg["marketingCarrier"])?.["confirmationNumber"]);
    if (conf) numbers.add(conf);
  }
  for (const c of asArr(asObj(it["travelAgency"])?.["confirmationNumbers"])) if (str(c["number"])) numbers.add(str(c["number"])!);
  return [...numbers];
}

function people(it: Obj): string[] {
  const names = new Set<string>();
  for (const key of ["travelers", "guests"]) for (const t of asArr(it[key])) if (str(t["name"])) names.add(str(t["name"])!);
  const driver = str(asObj(it["driver"])?.["name"]);
  if (driver) names.add(driver);
  return [...names];
}

function segmentSummary(type: string, seg: Obj) {
  const dep = asObj(seg["departure"]);
  const arr = asObj(seg["arrival"]);
  const carrier = asObj(seg["marketingCarrier"]);
  const airline = asObj(carrier?.["airline"]);
  const flight = carrier ? [str(airline?.["iata"]) ?? str(airline?.["name"]), str(carrier["flightNumber"])].filter(Boolean).join(" ") : undefined;
  const seats = asArr(seg["seats"]).map((s) => str(s["seatNumber"])).filter(Boolean);
  return prune({
    from: place(dep),
    to: place(arr),
    departs: str(dep?.["localDateTime"]),
    arrives: str(arr?.["localDateTime"]),
    flight: type === "flight" ? flight : undefined,
    carrier: type !== "flight" ? (str(seg["carrier"]) ?? str(seg["serviceName"])) : undefined,
    number: str(seg["scheduleNumber"]),
    cabin: str(seg["cabin"]),
    seats: seats.length ? seats : undefined,
    duration: str(seg["duration"]),
  });
}

const TYPE_LABEL: Record<string, string> = {
  flight: "Flight",
  hotelReservation: "Hotel",
  carRental: "Car rental",
  bus: "Bus",
  train: "Train",
  transfer: "Transfer",
  cruise: "Cruise",
  event: "Event",
  parking: "Parking",
  ferry: "Ferry",
};

export interface ItinerarySummary {
  type: string;
  title: string;
  start?: string;
  end?: string;
  [key: string]: unknown;
}

export function summarizeItinerary(raw: Itinerary): ItinerarySummary {
  const it = raw as Obj;
  const type = str(it["type"]) ?? "unknown";
  const label = TYPE_LABEL[type] ?? type;
  const provider = asObj(it["providerInfo"]);
  const pricing = asObj(it["pricingInfo"]);
  const trip = asObj(it["tripInfo"]);
  const segments = asArr(it["segments"]).map((s) => segmentSummary(type, s));

  let title = label;
  let start: string | undefined;
  let end: string | undefined;
  let location: string | undefined;
  const extra: Obj = {};

  if (segments.length) {
    const first = segments[0]!;
    const last = segments[segments.length - 1]!;
    title = `${label} ${first["from"] ?? "?"} → ${last["to"] ?? "?"}`;
    start = str(first["departs"]);
    end = str(last["arrives"]);
  }
  switch (type) {
    case "hotelReservation":
      title = `${label}: ${str(it["hotelName"]) ?? "hotel"}`;
      start = str(it["checkInDate"]);
      end = str(it["checkOutDate"]);
      location = str(asObj(it["address"])?.["text"]);
      extra["rooms"] = it["roomsCount"];
      extra["guests"] = it["guestCount"];
      extra["cancellationPolicy"] = it["cancellationPolicy"];
      break;
    case "carRental": {
      const pickup = asObj(it["pickup"]);
      const dropoff = asObj(it["dropoff"]);
      title = `${label}: ${str(it["rentalCompany"]) ?? str(provider?.["name"]) ?? "car"}`;
      start = str(pickup?.["localDateTime"]);
      end = str(dropoff?.["localDateTime"]);
      location = str(asObj(pickup?.["address"])?.["text"]);
      extra["dropoffLocation"] = str(asObj(dropoff?.["address"])?.["text"]);
      extra["car"] = str(asObj(it["car"])?.["model"]) ?? str(asObj(it["car"])?.["type"]);
      break;
    }
    case "event":
      title = `${label}: ${str(it["eventName"]) ?? "event"}`;
      start = str(it["startDateTime"]);
      end = str(it["endDateTime"]);
      location = str(asObj(it["address"])?.["text"]);
      break;
    case "parking":
      title = `${label}: ${str(it["locationName"]) ?? "parking"}`;
      start = str(it["startDateTime"]);
      end = str(it["endDateTime"]);
      location = str(asObj(it["address"])?.["text"]);
      break;
    case "cruise":
      extra["ship"] = str(asObj(it["cruiseDetails"])?.["ship"]);
      extra["cabin"] = str(asObj(it["cruiseDetails"])?.["room"]);
      break;
  }

  const total = pricing?.["total"];
  const currency = str(pricing?.["currencyCode"]);
  return prune({
    type,
    title,
    start,
    end,
    status: str(it["status"]),
    cancelled: it["cancelled"] === true ? true : undefined,
    provider: str(provider?.["name"]),
    confirmationNumbers: confirmationNumbers(it),
    travelers: people(it),
    location,
    segments: segments.length > 1 || (segments.length === 1 && type === "flight") ? segments : undefined,
    price: typeof total === "number" && total > 0 ? `${total} ${currency ?? ""}`.trim() : undefined,
    pointsUsed: str(pricing?.["spentAwards"]),
    earned: str(provider?.["earnedRewards"]),
    trip: str(trip?.["tripName"]),
    ...extra,
  }) as ItinerarySummary;
}

export function summarizeProvider(info: ProviderInfo) {
  const input = (field: ProviderInfo["login"]) =>
    field
      ? prune({
          title: field.title,
          required: field.required,
          options: field.options?.filter((o) => o.code).map((o) => `${o.code} (${o.name})`),
        })
      : undefined;
  return prune({
    code: info.code,
    name: info.displayName,
    company: info.providerName,
    program: info.programName,
    kind: info.kind !== undefined ? PROVIDER_KINDS[info.kind] : undefined,
    loginFields: prune({ login: input(info.login), login2: input(info.login2), login3: input(info.login3), password: input(info.password) }),
    trackedProperties: info.properties?.map((p) => prune({ name: p.name, kind: p.kind ? PROPERTY_KINDS[Number(p.kind)] : undefined })),
    eliteLevels: info.eliteLevelsCount,
    capabilities: prune({
      history: info.canParseHistory,
      itineraries: info.canCheckItinerary,
      reservationLookupByConfirmation: info.canCheckConfirmation,
      expiration: info.canCheckExpiration === 2 ? "balance never expires" : info.canCheckExpiration === 1 ? true : info.canCheckExpiration === 0 ? false : undefined,
      autoLogin: info.autoLogin,
      statements: info.canParseFiles,
    }),
    confirmationLookupFields: info.confirmationNumberFields?.map((f) => f.title ?? f.code),
  });
}

/** Drop undefined values and empty arrays/objects so results stay compact. */
export function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
      out[k] = v;
    }
    return out as T;
  }
  return value;
}
