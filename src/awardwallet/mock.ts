/**
 * Demo mode (AW_MOCK_MODE=true): answers AwardWallet API calls with built-in sample data so the
 * whole server, sign-in included, can be tried without an AwardWallet Business API key.
 * Nothing is sent to AwardWallet.
 */
import { localDate } from "./format.js";
import type {
  Account,
  ConnectedUserDetails,
  ConnectedUserListItem,
  Itinerary,
  MemberDetails,
  MemberListItem,
  ProviderInfo,
  ProviderListItem,
} from "./types.js";

const day = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays: number) => localDate(new Date(Date.now() + offsetDays * day));
const isoDateTime = (offsetDays: number) => `${isoDate(offsetDays)}T00:00:00+00:00`;
const localDateTime = (offsetDays: number, time: string) => `${isoDate(offsetDays)}T${time}`;
const BIZ = "https://business.awardwallet.com";

function history(rows: [string, string, string, string][]) {
  return rows.map(([date, description, type, miles]) => ({
    fields: [
      { name: "Transaction Date", code: "PostingDate", value: date },
      { name: "Description", code: "Description", value: description },
      { name: "Type", code: "Info", value: type },
      { name: "Points", code: "Miles", value: miles },
    ],
  }));
}

function account(partial: Partial<Account> & Pick<Account, "accountId" | "code" | "displayName" | "kind" | "balanceRaw" | "owner">): Account {
  const id = partial.accountId;
  return {
    login: "n/a",
    autologinUrl: `${BIZ}/account/redirect?ID=${id}`,
    updateUrl: `${BIZ}/account/edit/${id}?autosubmit=1`,
    editUrl: `${BIZ}/account/edit/${id}`,
    balance: partial.balanceRaw === null ? "n/a" : partial.balanceRaw.toLocaleString("en-US"),
    errorCode: 1,
    lastRetrieveDate: isoDateTime(-1),
    lastChangeDate: isoDateTime(-6),
    ...partial,
  };
}

const alexAccounts: Account[] = [
  account({
    accountId: 5001,
    code: "delta",
    displayName: "Delta Air Lines (SkyMiles)",
    kind: "Airlines",
    login: "9012345678",
    balanceRaw: 84230,
    owner: "Alex Rivera",
    lastDetectedChange: "+2,150",
    expirationDate: null,
    properties: [
      { name: "SkyMiles Number", value: "9012345678", kind: 1 },
      { name: "Medallion Status", value: "Gold Medallion", rank: 2, kind: 3 },
      { name: "MQDs", value: "$9,420", kind: 19 },
      { name: "Next Elite Level", value: "Platinum Medallion", kind: 9 },
      { name: "Status Expiration", value: "Jan 31, 2028", kind: 15 },
    ],
    subAccounts: [
      { subAccountId: 50011, displayName: "Companion Certificate (Main Cabin)", balance: "1", balanceRaw: 1, expirationDate: isoDateTime(75) },
    ],
    history: history([
      [isoDate(-6), "DL 1432 ATL-BOS", "Flight", "+2,150"],
      [isoDate(-40), "Delta SkyMiles Amex - monthly spend", "Credit card", "+3,812"],
      [isoDate(-71), "Award ticket SEA-HNL", "Redemption", "-35,000"],
    ]),
  }),
  account({
    accountId: 5002,
    code: "marriott",
    displayName: "Marriott Bonvoy",
    kind: "Hotels",
    login: "alex.rivera@example.com",
    balanceRaw: 212450,
    owner: "Alex Rivera",
    lastDetectedChange: "+4,500",
    expirationDate: isoDateTime(410),
    properties: [
      { name: "Member Number", value: "123456789", kind: 1 },
      { name: "Membership Level", value: "Platinum Elite", rank: 3, kind: 3 },
      { name: "Nights this year", value: "38", kind: 8 },
      { name: "Nights to next level", value: "12", kind: 11 },
    ],
    subAccounts: [
      { subAccountId: 50021, displayName: "Free Night Award (up to 50,000 points)", balance: "1", balanceRaw: 1, expirationDate: isoDateTime(60) },
    ],
    history: history([
      [isoDate(-12), "Stay: Sheraton Philadelphia Downtown", "Stay", "+4,500"],
      [isoDate(-90), "Transfer to Alaska Mileage Plan", "Transfer", "-60,000"],
    ]),
  }),
  account({
    accountId: 5003,
    code: "chase",
    displayName: "Chase (Ultimate Rewards)",
    kind: "Credit Cards",
    balanceRaw: 145300,
    owner: "Alex Rivera",
    lastDetectedChange: "+1,845",
    properties: [{ name: "Name", value: "ALEX RIVERA", kind: 12 }],
    subAccounts: [
      { subAccountId: 50031, displayName: "Sapphire Preferred (...4821)", balance: "98,000", balanceRaw: 98000, lastDetectedChange: "+1,210" },
      { subAccountId: 50032, displayName: "Freedom Unlimited (...0077)", balance: "47,300", balanceRaw: 47300, lastDetectedChange: "+635" },
    ],
  }),
  account({
    accountId: 5004,
    code: "mileageplus",
    displayName: "United Airlines (MileagePlus)",
    kind: "Airlines",
    login: "AR112233",
    balanceRaw: 23900,
    owner: "Alex Rivera",
    errorCode: 2,
    errorMessage: "Invalid credentials",
    lastRetrieveDate: isoDateTime(-45),
    properties: [{ name: "Status", value: "Member", rank: 0, kind: 3 }],
  }),
  account({
    accountId: 5005,
    code: "hhonors",
    displayName: "Hilton (Honors)",
    kind: "Hotels",
    login: "AR998877",
    balanceRaw: 61200,
    owner: "Alex Rivera",
    expirationDate: isoDateTime(45),
    properties: [
      { name: "Status", value: "Gold", rank: 2, kind: 3 },
      { name: "Points expiring", value: "61,200", kind: 6 },
    ],
    history: history([[isoDate(-500), "Stay: Hilton Garden Inn Denver", "Stay", "+8,200"]]),
  }),
];

// Sam is a free (non-Plus) user who shared "read balances": AwardWallet hides history, expiration
// dates and every property except elite status.
const samAccounts: Account[] = [
  account({
    accountId: 5101,
    code: "aa",
    displayName: "American Airlines (AAdvantage)",
    kind: "Airlines",
    balanceRaw: 12500,
    owner: "Sam Rivera",
    autologinUrl: "n/a",
    updateUrl: "n/a",
    editUrl: "n/a",
    properties: [{ name: "Status", value: "Gold", rank: 1, kind: 3 }],
  }),
  account({
    accountId: 5102,
    code: "rapidrewards",
    displayName: "Southwest Airlines (Rapid Rewards)",
    kind: "Airlines",
    balanceRaw: 34120,
    owner: "Sam Rivera",
    autologinUrl: "n/a",
    updateUrl: "n/a",
    editUrl: "n/a",
    properties: [{ name: "Tier", value: "A-List", rank: 1, kind: 3 }],
  }),
];

const jordanAccounts: Account[] = [
  account({
    accountId: 5201,
    code: "british",
    displayName: "British Airways (Executive Club)",
    kind: "Airlines",
    login: "44556677",
    balanceRaw: 8420,
    owner: "Jordan Rivera",
    expirationDate: isoDateTime(300),
    properties: [
      { name: "Membership no", value: "44556677", kind: 1 },
      { name: "Level", value: "Blue", rank: 0, kind: 3 },
    ],
    history: history([[isoDate(-65), "BA 117 JFK-LHR", "Flight", "+1,250"]]),
  }),
];

const users: ConnectedUserDetails[] = [
  {
    userId: 1001,
    fullName: "Alex Rivera",
    email: "alex.rivera@example.com",
    forwardingEmail: "alex.rivera@awardwallet.com",
    userName: "alexr",
    status: "Plus",
    accessLevel: "Regular",
    connectionType: "Connected",
    accountsAccessLevel: "Read all",
    accountsSharedByDefault: true,
    tripAccessLevel: "read_all",
    editConnectionUrl: `${BIZ}/members/connection/1001`,
    accountListUrl: `${BIZ}/account/list#/?agentId=1001`,
    timelineUrl: `${BIZ}/timeline/?agentId=1001`,
    accounts: alexAccounts,
  },
  {
    userId: 1002,
    fullName: "Sam Rivera",
    email: "sam.rivera@example.com",
    forwardingEmail: "sam.rivera@awardwallet.com",
    userName: "samr",
    status: "Free",
    accessLevel: "Regular",
    connectionType: "Connected",
    accountsAccessLevel: "Read balances",
    accountsSharedByDefault: false,
    tripAccessLevel: "no_access",
    editConnectionUrl: `${BIZ}/members/connection/1002`,
    accountListUrl: `${BIZ}/account/list#/?agentId=1002`,
    timelineUrl: `${BIZ}/timeline/?agentId=1002`,
    accounts: samAccounts,
  },
];

const members: MemberDetails[] = [
  {
    memberId: 2001,
    fullName: "Jordan Rivera",
    email: "jordan.rivera@example.com",
    forwardingEmail: "biz.jordan@awardwallet.com",
    editMemberUrl: `${BIZ}/agent/editFamilyMember.php?ID=2001&Source=M`,
    accountListUrl: `${BIZ}/account/list#/?agentId=2001`,
    timelineUrl: `${BIZ}/timeline/?agentId=2001`,
    accounts: jordanAccounts,
  },
];

const providers: ProviderListItem[] = [
  ["aa", "American Airlines (AAdvantage)", 1],
  ["delta", "Delta Air Lines (SkyMiles)", 1],
  ["mileageplus", "United Airlines (MileagePlus)", 1],
  ["rapidrewards", "Southwest Airlines (Rapid Rewards)", 1],
  ["alaskaair", "Alaska Airlines (Mileage Plan)", 1],
  ["british", "British Airways (Executive Club)", 1],
  ["aeroplan", "Air Canada (Aeroplan)", 1],
  ["flyingblue", "Air France KLM (Flying Blue)", 1],
  ["jetblue", "JetBlue Airways (TrueBlue)", 1],
  ["marriott", "Marriott Bonvoy", 2],
  ["hhonors", "Hilton (Honors)", 2],
  ["hyatt", "World of Hyatt", 2],
  ["ichotelsgroup", "IHG Hotels & Resorts (One Rewards)", 2],
  ["hertz", "Hertz (Gold Plus Rewards)", 3],
  ["nationalcar", "National Car Rental (Emerald Club)", 3],
  ["amtrak", "Amtrak (Guest Rewards)", 4],
  ["chase", "Chase (Ultimate Rewards)", 6],
  ["amex", "American Express (Membership Rewards)", 6],
  ["citybank", "Citi (ThankYou Rewards)", 6],
  ["capitalcards", "Capital One (Miles)", 6],
].map(([code, displayName, kind]) => ({ code: code as string, displayName: displayName as string, kind: kind as number }));

function providerInfo(code: string): ProviderInfo | undefined {
  const p = providers.find((x) => x.code === code);
  if (!p) return undefined;
  return {
    kind: p.kind,
    code: p.code,
    displayName: p.displayName,
    providerName: p.displayName.replace(/\s*\(.*\)$/, ""),
    programName: p.displayName.match(/\((.*)\)/)?.[1] ?? p.displayName,
    login: { code: "Login", title: "Username or member number", options: [], required: true, defaultValue: "" },
    password: { code: "Password", title: "Password", options: [], required: true, defaultValue: "" },
    properties: [
      { code: "Number", name: "Member number", kind: "1" },
      { code: "Level", name: "Elite level", kind: "3" },
      { code: "ExpirationDate", name: "Expiration date", kind: "2" },
    ],
    autoLogin: true,
    deepLinking: true,
    canCheckConfirmation: p.kind === 1 || p.kind === 2,
    canCheckItinerary: p.kind !== 6,
    canCheckExpiration: p.kind === 1 && p.code === "delta" ? 2 : 1,
    confirmationNumberFields: [
      { code: "RecordLocator", title: "Confirmation #", required: true, defaultValue: "" },
      { code: "LastName", title: "Last Name", required: true, defaultValue: "" },
    ],
    historyColumns: [
      { code: "PostingDate", name: "Date", kind: "0" },
      { code: "Description", name: "Description", kind: "0" },
      { code: "Miles", name: "Points", kind: "0" },
    ],
    eliteLevelsCount: 4,
    canParseHistory: true,
    canParseFiles: false,
  };
}

const timeline: Itinerary[] = [
  {
    type: "flight",
    status: "Confirmed",
    cancelled: false,
    reservationDate: isoDateTime(-20),
    providerInfo: { code: "delta", name: "Delta Air Lines", accountNumbers: [{ number: "9012****", masked: true }], earnedRewards: "2,150 miles" },
    issuingCarrier: { airline: { name: "Delta Air Lines", iata: "DL", icao: "DAL" }, confirmationNumber: "GXK4PQ" },
    pricingInfo: { total: 412.6, cost: 356.1, currencyCode: "USD" },
    travelers: [{ name: "Alex Rivera", full: true }],
    tripInfo: { tripId: "T9001", tripName: "Boston weekend" },
    segments: [
      {
        departure: { airportCode: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", localDateTime: localDateTime(18, "07:15:00") },
        arrival: { airportCode: "BOS", name: "Boston Logan International Airport", localDateTime: localDateTime(18, "09:52:00") },
        marketingCarrier: { airline: { name: "Delta Air Lines", iata: "DL", icao: "DAL" }, flightNumber: "1432", confirmationNumber: "GXK4PQ" },
        cabin: "Comfort+",
        seats: [{ seatNumber: "14C" }],
        duration: "2h 37m",
      },
      {
        departure: { airportCode: "BOS", name: "Boston Logan International Airport", localDateTime: localDateTime(21, "18:05:00") },
        arrival: { airportCode: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", localDateTime: localDateTime(21, "21:11:00") },
        marketingCarrier: { airline: { name: "Delta Air Lines", iata: "DL", icao: "DAL" }, flightNumber: "2219", confirmationNumber: "GXK4PQ" },
        cabin: "Comfort+",
        seats: [{ seatNumber: "15D" }],
        duration: "3h 06m",
      },
    ],
  },
  {
    type: "hotelReservation",
    status: "Confirmed",
    cancelled: false,
    providerInfo: { code: "marriott", name: "Marriott Bonvoy", earnedRewards: "3 nights" },
    confirmationNumbers: [{ number: "83920411", isPrimary: true }],
    hotelName: "Boston Marriott Copley Place",
    address: { text: "110 Huntington Ave, Boston, MA 02116, United States", city: "Boston", countryName: "United States" },
    checkInDate: localDateTime(18, "16:00:00"),
    checkOutDate: localDateTime(21, "11:00:00"),
    guestCount: 1,
    roomsCount: 1,
    cancellationPolicy: "Free cancellation until 2 days before arrival",
    pricingInfo: { spentAwards: "105,000 points", total: 0, currencyCode: "USD" },
    tripInfo: { tripId: "T9001", tripName: "Boston weekend" },
  },
  {
    type: "carRental",
    status: "Confirmed",
    cancelled: false,
    providerInfo: { code: "nationalcar", name: "National Car Rental" },
    confirmationNumbers: [{ number: "1123581321", isPrimary: true }],
    pickup: { localDateTime: localDateTime(45, "10:00:00"), address: { text: "Denver International Airport (DEN), Denver, CO", city: "Denver" } },
    dropoff: { localDateTime: localDateTime(49, "10:00:00"), address: { text: "Denver International Airport (DEN), Denver, CO", city: "Denver" } },
    car: { type: "Midsize SUV", model: "Toyota RAV4 or similar" },
    driver: { name: "Alex Rivera", full: true },
    pricingInfo: { total: 318.4, currencyCode: "USD" },
  },
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function notFound(what: string): Response {
  return json({ error: "not_found", message: `${what} not found` }, 404);
}

function listItem(user: ConnectedUserDetails): ConnectedUserListItem {
  const { accounts, ...rest } = user;
  return { ...rest, accountsIndex: accounts.map((a) => ({ accountId: a.accountId, lastChangeDate: a.lastChangeDate, lastRetrieveDate: a.lastRetrieveDate })) };
}

function memberItem(member: MemberDetails): MemberListItem {
  const { accounts, ...rest } = member;
  return { ...rest, accountsIndex: accounts.map((a) => ({ accountId: a.accountId, lastChangeDate: a.lastChangeDate, lastRetrieveDate: a.lastRetrieveDate })) };
}

async function accountAccess(method: string, path: string, request: Request): Promise<Response> {
  let m: RegExpMatchArray | null;
  if (method === "GET" && path === "/connectedUser") return json({ connectedUsers: users.map(listItem) });
  if (method === "GET" && (m = path.match(/^\/connectedUser\/(\d+)$/))) {
    const user = users.find((u) => u.userId === Number(m![1]));
    return user ? json(user) : notFound("Connected user");
  }
  if (method === "GET" && path === "/member") return json({ members: members.map(memberItem) });
  if (method === "GET" && (m = path.match(/^\/member\/(\d+)$/))) {
    const member = members.find((x) => x.memberId === Number(m![1]));
    return member ? json(member) : notFound("Member");
  }
  if (method === "GET" && (m = path.match(/^\/account\/(\d+)$/))) {
    const id = Number(m[1]);
    for (const user of users) {
      const acct = user.accounts.find((a) => a.accountId === id);
      if (acct) return json({ account: acct, connectedUser: listItem(user) });
    }
    for (const member of members) {
      const acct = member.accounts.find((a) => a.accountId === id);
      if (acct) return json({ account: acct, member: memberItem(member) });
    }
    return notFound("Account");
  }
  if (method === "POST" && (m = path.match(/^\/travel-timeline\/(\d+)$/))) {
    const id = Number(m[1]);
    if (id === 1001) return json({ itineraries: timeline });
    if (id === 1002) return json({ error: "trip_access_denied", message: "This user has not shared trips with your business" }, 403);
    return notFound("Connected user");
  }
  if (method === "GET" && path === "/providers/list") return json(providers);
  if (method === "GET" && (m = path.match(/^\/providers\/([A-Za-z0-9]+)$/))) {
    const info = providerInfo(m[1]!);
    return info ? json(info) : notFound("Provider");
  }
  if (method === "POST" && path === "/create-auth-url") {
    const body = (await request.json()) as { accountAccess?: string; tripAccess?: string };
    if (body.accountAccess === "no_access" && body.tripAccess === "no_access") {
      return json({ error: "nothing_requested", message: "accountAccess and tripAccess cannot both be no_access" }, 400);
    }
    return json({ url: "https://awardwallet.com/user/connections/approve?access=demo&authKey=demo-mode-link&id=demo" });
  }
  if (method === "GET" && (m = path.match(/^\/get-connection-info\/mock-(\d+)$/))) return json({ userId: m[1] });
  if (method === "GET" && path.startsWith("/get-connection-info/")) return json({ error: "auth_code_expired", message: "Unknown or expired code" }, 410);
  return notFound("Endpoint");
}

/** Paid APIs: echo the request so flows can be exercised, without pretending to know real results. */
async function paidApi(host: string, method: string, path: string, request: Request): Promise<Response> {
  let body: unknown;
  if (method !== "GET") {
    body = await request.json().catch(() => undefined);
  }
  return json({
    mock: true,
    note: "Demo mode: this request was not sent to AwardWallet.",
    request: { host, method, path, body: redact(body) },
  });
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, /password|secret|token|answer|pin/i.test(k) ? "[redacted]" : redact(v)]),
    );
  }
  return value;
}

export async function mockFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname === "business.awardwallet.com") {
    return accountAccess(request.method, url.pathname.replace(/^\/api\/export\/v2/, ""), request);
  }
  return paidApi(url.hostname, request.method, url.pathname, request);
}
