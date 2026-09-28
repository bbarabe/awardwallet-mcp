/** Response shapes of the AwardWallet Account Access API (https://awardwallet.com/api/account). */

export interface AccountProperty {
  name: string;
  value: string;
  rank?: number;
  kind?: number;
}

export interface HistoryField {
  code: string;
  name: string;
  value: string;
}

export interface HistoryRow {
  fields?: HistoryField[];
}

export interface SubAccount {
  subAccountId: number;
  displayName: string;
  balance: string;
  balanceRaw?: number | null;
  lastDetectedChange?: string;
  expirationDate?: string | null;
  properties?: AccountProperty[];
  history?: HistoryRow[];
}

export interface Account {
  accountId: number;
  code: string;
  displayName: string;
  kind: string;
  login: string;
  autologinUrl?: string;
  updateUrl?: string;
  editUrl?: string;
  balance: string;
  balanceRaw: number | null;
  lastDetectedChange?: string;
  expirationDate?: string | null;
  barcode?: string;
  owner: string;
  errorCode: number;
  errorMessage?: string;
  lastChangeDate?: string | null;
  lastRetrieveDate?: string | null;
  history?: HistoryRow[];
  properties?: AccountProperty[];
  subAccounts?: SubAccount[];
}

export interface AccountsIndexItem {
  accountId: number;
  lastChangeDate?: string | null;
  lastRetrieveDate?: string | null;
}

export interface ConnectedUserBase {
  userId: number;
  fullName: string;
  email: string;
  forwardingEmail?: string;
  userName: string;
  status: "Free" | "Plus" | string;
  accessLevel?: string;
  connectionType: "Connected" | "Pending" | string;
  accountsAccessLevel: string;
  accountsSharedByDefault: boolean;
  tripAccessLevel?: string;
  editConnectionUrl?: string;
  accountListUrl?: string;
  timelineUrl?: string;
  bookingRequestsUrl?: string;
}

export interface ConnectedUserListItem extends ConnectedUserBase {
  accountsIndex: AccountsIndexItem[];
}

export interface ConnectedUserDetails extends ConnectedUserBase {
  accounts: Account[];
}

export interface MemberBase {
  memberId: number;
  fullName: string;
  email?: string;
  forwardingEmail?: string;
  editMemberUrl?: string;
  accountListUrl?: string;
  timelineUrl?: string;
}

export interface MemberListItem extends MemberBase {
  accountsIndex: AccountsIndexItem[];
}

export interface MemberDetails extends MemberBase {
  accounts: Account[];
}

export interface AccountDetailsResponse {
  /** The docs show `account` as an array in the example and as an object in the schema; handle both. */
  account: Account | Account[];
  member?: MemberBase;
  connectedUser?: ConnectedUserBase;
}

export interface ProviderListItem {
  code: string;
  displayName: string;
  kind?: number;
}

export interface ProviderInput {
  code?: string;
  title?: string;
  options?: { code: string; name: string; kind?: string }[];
  required?: boolean;
  defaultValue?: string;
}

export interface ProviderInfo {
  kind?: number;
  code?: string;
  displayName?: string;
  providerName?: string;
  programName?: string;
  login?: ProviderInput;
  login2?: ProviderInput;
  login3?: ProviderInput;
  password?: ProviderInput;
  properties?: { code?: string; name?: string; kind?: string }[];
  autoLogin?: boolean;
  deepLinking?: boolean;
  canCheckConfirmation?: boolean;
  canCheckItinerary?: boolean;
  canCheckExpiration?: number;
  confirmationNumberFields?: ProviderInput[];
  historyColumns?: { code?: string; name?: string; kind?: string }[];
  eliteLevelsCount?: number;
  canParseHistory?: boolean;
  canParseFiles?: boolean;
}

/** Itineraries are large and type-specific; we keep them loosely typed and summarize defensively. */
export type Itinerary = Record<string, unknown> & { type?: string };

export interface TravelTimelineResponse {
  itineraries?: Itinerary[];
  nextPageToken?: string;
}
