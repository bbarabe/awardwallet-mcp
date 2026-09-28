/** Account Access API reads for the dedicated tools, with caching tuned to AwardWallet's rate limits. */
import type { AwardWalletClient } from "./client.js";
import type { Holder } from "./format.js";
import type {
  Account,
  AccountDetailsResponse,
  ConnectedUserDetails,
  ConnectedUserListItem,
  MemberDetails,
  MemberListItem,
  ProviderInfo,
  ProviderListItem,
  TravelTimelineResponse,
} from "./types.js";

/** Reads of the same id within a minute come from memory: AwardWallet allows 20 per 10 minutes per id. */
const DETAIL_TTL = 60_000;
const PROVIDERS_TTL = 6 * 60 * 60_000;
/** People whose accounts are fetched per call (one request each). */
export const MAX_PEOPLE_PER_CALL = 30;

export interface HolderAccounts {
  holder: Holder;
  accounts: Account[];
  /** Connection facts that explain missing fields (free user, sharing level). */
  sharing?: { status?: string; accountsAccessLevel?: string; tripAccessLevel?: string; connectionType?: string };
}

export class AccountAccessService {
  constructor(private readonly client: AwardWalletClient) {}

  private get<T>(path: string, ttl = DETAIL_TTL, signal?: AbortSignal): Promise<T> {
    return this.client.request<T>("accountAccess", "GET", path, { cacheTtlMs: ttl, signal });
  }

  connectedUser(userId: number, signal?: AbortSignal): Promise<ConnectedUserDetails> {
    return this.get<ConnectedUserDetails>(`/connectedUser/${userId}`, DETAIL_TTL, signal);
  }

  member(memberId: number, signal?: AbortSignal): Promise<MemberDetails> {
    return this.get<MemberDetails>(`/member/${memberId}`, DETAIL_TTL, signal);
  }

  async listPeople(signal?: AbortSignal): Promise<{ connectedUsers: ConnectedUserListItem[]; members: MemberListItem[] }> {
    const [users, members] = await Promise.all([
      this.get<{ connectedUsers?: ConnectedUserListItem[] }>("/connectedUser", DETAIL_TTL, signal),
      this.get<{ members?: MemberListItem[] }>("/member", DETAIL_TTL, signal),
    ]);
    return { connectedUsers: users.connectedUsers ?? [], members: members.members ?? [] };
  }

  /** Accounts grouped by who shared them: one user or member, or everyone `MAX_PEOPLE_PER_CALL` at a time. */
  async accountsByHolder(
    filter: { userId?: number; memberId?: number; peopleOffset?: number },
    signal?: AbortSignal,
  ): Promise<{ groups: HolderAccounts[]; totalPeople: number; peopleOffset: number; errors: string[] }> {
    if (filter.userId !== undefined) {
      return { groups: [userGroup(await this.connectedUser(filter.userId, signal))], totalPeople: 1, peopleOffset: 0, errors: [] };
    }
    if (filter.memberId !== undefined) {
      return { groups: [memberGroup(await this.member(filter.memberId, signal))], totalPeople: 1, peopleOffset: 0, errors: [] };
    }

    const people = await this.listPeople(signal);
    const everyone = [
      ...people.connectedUsers
        .filter((u) => u.connectionType !== "Pending" && (u.accountsIndex?.length ?? 0) > 0)
        .map((u) => ({ kind: "user" as const, id: Number(u.userId), name: u.fullName })),
      ...people.members
        .filter((m) => (m.accountsIndex?.length ?? 0) > 0)
        .map((m) => ({ kind: "member" as const, id: Number(m.memberId), name: m.fullName })),
    ];
    const offset = Math.max(0, filter.peopleOffset ?? 0);
    const slice = everyone.slice(offset, offset + MAX_PEOPLE_PER_CALL);
    const errors: string[] = [];
    const groups: HolderAccounts[] = [];
    for (let i = 0; i < slice.length; i += 6) {
      const batch = slice.slice(i, i + 6);
      const results = await Promise.allSettled(
        batch.map((p) => (p.kind === "user" ? this.connectedUser(p.id, signal).then(userGroup) : this.member(p.id, signal).then(memberGroup))),
      );
      results.forEach((result, index) => {
        const p = batch[index]!;
        if (result.status === "fulfilled") groups.push(result.value);
        else errors.push(`${p.name} (${p.kind === "user" ? "userId" : "memberId"} ${p.id}): ${errorMessage(result.reason)}`);
      });
    }
    return { groups, totalPeople: everyone.length, peopleOffset: offset, errors };
  }

  async account(accountId: number, signal?: AbortSignal): Promise<{ account: Account; holder?: Holder }> {
    const response = await this.get<AccountDetailsResponse>(`/account/${accountId}`, DETAIL_TTL, signal);
    // The docs show `account` as an array in the example and as an object in the schema.
    const account = Array.isArray(response.account) ? response.account[0] : response.account;
    if (!account) throw new Error(`AwardWallet returned no data for account ${accountId}.`);
    const holder: Holder | undefined = response.connectedUser
      ? { type: "connectedUser", id: Number(response.connectedUser.userId), name: response.connectedUser.fullName }
      : response.member
        ? { type: "member", id: Number(response.member.memberId), name: response.member.fullName }
        : undefined;
    return { account, holder };
  }

  travelTimeline(userId: number, body: { start: string; end: string; pageToken?: string }, signal?: AbortSignal): Promise<TravelTimelineResponse> {
    return this.client.request<TravelTimelineResponse>("accountAccess", "POST", `/travel-timeline/${userId}`, {
      body,
      cacheTtlMs: DETAIL_TTL,
      signal,
    });
  }

  providers(signal?: AbortSignal): Promise<ProviderListItem[]> {
    return this.get<ProviderListItem[]>("/providers/list", PROVIDERS_TTL, signal);
  }

  provider(code: string, signal?: AbortSignal): Promise<ProviderInfo> {
    return this.get<ProviderInfo>(`/providers/${encodeURIComponent(code)}`, PROVIDERS_TTL, signal);
  }
}

function userGroup(user: ConnectedUserDetails): HolderAccounts {
  return {
    holder: { type: "connectedUser", id: Number(user.userId), name: user.fullName },
    accounts: user.accounts ?? [],
    sharing: {
      status: user.status,
      accountsAccessLevel: user.accountsAccessLevel,
      tripAccessLevel: user.tripAccessLevel,
      connectionType: user.connectionType,
    },
  };
}

function memberGroup(member: MemberDetails): HolderAccounts {
  return { holder: { type: "member", id: Number(member.memberId), name: member.fullName }, accounts: member.accounts ?? [] };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
