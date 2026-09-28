# AwardWallet MCP

[![CI](https://github.com/bbarabe/awardwallet-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/bbarabe/awardwallet-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

An [MCP](https://modelcontextprotocol.io) server that lets **Claude Desktop, Claude Code, OpenClaw** and any other MCP client work with your [AwardWallet](https://awardwallet.com) data. You get loyalty balances, elite status, expiring points and certificates, transaction history and upcoming trips, plus every endpoint of AwardWallet's six APIs.

It runs locally on your machine over stdio. There's no hosted service, and your AwardWallet credentials never go into the chat.

> **Unofficial.** This project is not affiliated with or endorsed by AwardWallet. It calls AwardWallet's published APIs with credentials you provide.

## What you can ask

- "Which benefits expire before December 31?" (points, free-night and companion certificates, elite status)
- "What's my Marriott balance and status, and how many nights until the next level?"
- "Show the last 50 transactions on my Delta account."
- "What trips do we have coming up, with confirmation numbers?"
- "Which accounts have update problems?"

## Highlights

- **Purpose-built tools** for the common questions. Results are compact and pre-summarized: expiring items, accounts that need attention, and hidden-data explanations.
- **Every AwardWallet API.** A catalog of 42 operations across the Account Access, Web Parsing, Email Parsing, Credit Card Bonus, Flight Award Search and Hotel Award Search APIs. Inputs are validated against schemas transcribed from AwardWallet's documentation.
- **Credentials stay out of config files and out of the chat:**
  - API keys live in your OS credential store (Windows Credential Manager, macOS Keychain, Linux Secret Service) or in Claude Desktop's secure extension settings.
  - Loyalty and mailbox passwords are typed into a one-time local page, never into the conversation.
- **Safe by construction:**
  - Read and write tools are separate, with `readOnlyHint`/`destructiveHint` annotations.
  - A read-only mode suits autonomous agents.
  - A demo mode with sample data lets you try everything without an account.
- **Tested:** 300+ unit and end-to-end tests, run in CI on Linux, Windows and macOS.

## Quick start

Requires [Node.js](https://nodejs.org) 20.10 or later.

```bash
git clone https://github.com/bbarabe/awardwallet-mcp.git
cd awardwallet-mcp
npm install
npm run build
```

### Try it with demo data

No AwardWallet account needed: `AW_MOCK_MODE=true` serves a built-in sample family with eight accounts, a few certificates and some trips. Nothing is sent to AwardWallet. For example, in Claude Code:

```bash
claude mcp add awardwallet-demo -e AW_MOCK_MODE=true -- node /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

### Connect your AwardWallet account

AwardWallet's data API (the **Account Access API**) belongs to an AwardWallet **Business** account, which is free to create.

1. **Create the Business account from your personal account.** While signed in to AwardWallet, open [awardwallet.com/user/create-business-account](https://awardwallet.com/user/create-business-account). The Business administrator needs **AwardWallet Plus** to use the API.
2. **Share your loyalty accounts with the business.** Your personal account appears as a connected user (the administrator), but it shares **no loyalty accounts until you share them**. Share your accounts with the business, and turn on sharing of accounts you add later. To include family, invite them from **Members → Add new member** in the Business interface. Each person picks what to share.
3. **Copy the API key** from [business.awardwallet.com/profile/api](https://business.awardwallet.com/profile/api).
4. **Save it.** `login` checks the key with AwardWallet and stores it in your OS credential store; `status` shows what the key can see:

   ```bash
   node dist/awardwallet-mcp.mjs login
   node dist/awardwallet-mcp.mjs status
   ```

What comes back depends on each person's sharing choices and AwardWallet plan:

- **Sharing level:** "Read numbers" and "Read balances" hide more than "Read all".
- **Free (non-Plus) users:** their history, expiration dates and most properties stay hidden unless the Business account has a paid subscription.
- **Travel timeline:** needs a paid Business subscription plus AwardWallet's approval for timeline export.

The tools say in their results when something is hidden and why.

## Connect a client

In the commands below, replace `/absolute/path/to/awardwallet-mcp` with where you cloned the repo (on Windows, something like `C:\Users\you\awardwallet-mcp`).

### Claude Code

```bash
claude mcp add --scope user awardwallet -- node /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

The key saved by `login` is read from the OS credential store, so no `-e AW_API_KEY=...` is needed.

### Claude Desktop

The simplest route is the desktop extension. Build it, then open `dist/awardwallet-mcp.mcpb` with Claude Desktop (or drag it onto **Settings → Extensions**):

```bash
npm run pack:mcpb
```

The install dialog asks for the API key and any paid-API credentials; Claude Desktop keeps them in its secure storage. Demo mode and read-only mode are switches in the same dialog.

The extension can't see a key saved by `login`, because it ships without the native keyring module. Enter the key in the dialog, or later under **Settings → Extensions → AwardWallet → Configure**.

Alternatively, point `claude_desktop_config.json` at the build to use the key saved by `login`:

```json
{
  "mcpServers": {
    "awardwallet": {
      "command": "node",
      "args": ["/absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs"]
    }
  }
}
```

### OpenClaw

OpenClaw runs stdio MCP servers ([docs](https://docs.openclaw.ai/tools/mcp)):

```bash
openclaw mcp add awardwallet --command node --arg /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

- **Use read-only mode for an autonomous agent.** Set `AW_READ_ONLY=true`, so it can only read.
- **On a headless Linux machine without a keyring,** pass `AW_API_KEY` through OpenClaw's secret mechanism. Or point `AW_API_KEY_FILE` at a file only the service can read, such as a systemd or Docker secret.

### Other MCP clients

Any client that launches stdio servers works. The command is `node /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs`, with optional environment variables from [Configuration](#configuration).

## Tools

| Tool | Access | What it does |
|---|---|---|
| `get_status` | read | Which APIs are configured (and where the credentials come from), demo/read-only mode, people and account counts |
| `list_people` | read | Connected AwardWallet users and business members, with ids and sharing levels |
| `list_loyalty_accounts` | read | Balances, elite status, update problems and everything that expires on each account (points, certificates and other sub-accounts, elite status). Filter by person, program, type, balance, or an `expiringBy` date. |
| `get_loyalty_account` | read | One account's properties, sub-accounts, update links and paginated transaction history |
| `get_travel_timeline` | read | Reservations in a date window: flights, hotels, cars, trains, cruises, events and more |
| `search_loyalty_programs`, `get_loyalty_program` | read | Programs AwardWallet supports and what it tracks for each |
| `search_api_operations` | read | Finds raw API operations and returns their input schemas |
| `call_api_read_operation` | read | Runs a read-only raw operation |
| `call_api_write_operation` | write | Runs a raw operation that changes data, signs in to a loyalty or mailbox account, or costs money |
| `get_secure_input_result` | read | Result of a request completed on the secure input page |
| `create_connection_link` | write | *(opt-in, `AW_CONNECT_LINKS=true`)* Creates an AwardWallet invitation link; needs AwardWallet's approval of connection links |

Read-only mode doesn't register the write tools at all.

## Every AwardWallet API

Besides the free Account Access API, AwardWallet sells APIs by contract. Add their credentials to enable them in the catalog tools:

| API | Operations | Credential (`login --api <id>` or environment variable) |
|---|---|---|
| [Account Access](https://awardwallet.com/api/account) | 10 | `accountAccess` / `AW_API_KEY` |
| [Web Parsing (Loyalty)](https://awardwallet.com/api/loyalty) | 9 | `webParsing` / `AW_WEB_PARSING_CREDENTIALS` |
| [Email Parsing](https://awardwallet.com/api/email) | 16 | `emailParsing` / `AW_EMAIL_PARSING_CREDENTIALS` |
| [Credit Card Bonus](https://awardwallet.com/api/cc) | 1 | `creditCardBonus` / `AW_CC_BONUS_CREDENTIALS` |
| [Flight Award Search](https://awardwallet.com/api/flight-award-search) | 3 | `flightAwardSearch` / `AW_FLIGHT_SEARCH_CREDENTIALS` |
| [Hotel Award Search](https://awardwallet.com/api/hotel-award-search) | 3 | `hotelAwardSearch` / `AW_HOTEL_SEARCH_CREDENTIALS` |

Paid-API credentials are `username:password`; `login --api <id>` prompts for both. Only the validated input is sent upstream, so unknown fields are dropped.

Current gaps (contributions welcome):

- Security-question and one-time-code answers (AwardWallet's `answers` arrays) can't be supplied yet.
- The Email Parsing browser-redirect endpoint isn't included, since it isn't an API call.
- The travel timeline covers connected users only; AwardWallet's API has no timeline endpoint for business members.

## Security model

**Secrets never enter the chat.** Some paid operations need a loyalty password or a mailbox token. `call_api_write_operation` refuses those as arguments and returns a one-time link like `http://127.0.0.1:<port>/secure/<token>`:

1. You open the link and type the secret on that page.
2. The server sends the request straight to AwardWallet.
3. `get_secure_input_result` returns AwardWallet's response to the conversation.

**The secure input page is locked down:**

- It listens on 127.0.0.1 only and validates `Host`, `Origin` and `Sec-Fetch-Site`.
- It runs no scripts.
- It shows prominently where the secret will be used, and asks for extra confirmation before sending a password without TLS.
- Links are single-use and expire after 15 minutes.
- Secrets are never logged or stored, and they're redacted from anything returned.

**Credentials are resolved in this order:**

1. environment variable;
2. `<NAME>_FILE`;
3. the OS credential store written by `login`.

`logout --all` removes stored credentials. Nothing is written to disk in plain text.

**Server hardening:**

- Tool inputs are schema-validated.
- Path parameters are encoded and can't contain dot segments.
- Results are size-capped with valid-JSON truncation.

If the server runs on another machine (for example OpenClaw on a home server), reach the secure page through an SSH tunnel or Tailscale Serve:

1. Fix the port with `AW_SECURE_INPUT_PORT`.
2. Set `AW_SECURE_INPUT_URL` to the forwarded address, so the links use it.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Configuration

| Variable | Default | |
|---|---|---|
| `AW_API_KEY` | from credential store | Account Access API key. `AW_API_KEY_FILE` reads it from a file instead. |
| `AW_*_CREDENTIALS` | from credential store | Paid APIs (table above); each also accepts `_FILE` |
| `AW_MOCK_MODE` | `false` | Built-in demo data; nothing is sent to AwardWallet |
| `AW_READ_ONLY` | `false` | Register read-only tools only |
| `AW_CONNECT_LINKS` | `false` | Offer `create_connection_link` |
| `AW_CONNECT_REDIRECT_URL` | – | Needed only if your business has several Redirect URLs configured |
| `AW_EMAIL_API_REGION` | `us` | `eu` keeps Email Parsing data in AwardWallet's EU infrastructure |
| `AW_SECURE_INPUT_PORT` | random | Fixed port for the secure input page |
| `AW_SECURE_INPUT_URL` | `http://127.0.0.1:<port>` | Public base URL of that page when tunneled |

## Limits worth knowing

- **Balances aren't live.** They're AwardWallet's last successful update of each account (`lastUpdated` in results).
- **Rate limit.** AwardWallet allows 20 requests per rolling 10 minutes for each user, member or account. The server caches identical reads for a minute. It fetches accounts for up to 30 people per call; `peopleOffset` pages through larger businesses.
- **Result size.** Results are capped at 60,000 characters. The tools paginate with `limit`, `historyOffset` and `pageToken`.

## Development

```bash
npm test            # unit + end-to-end tests (demo mode, no network, no credentials)
npm run typecheck
npm run build       # dist/awardwallet-mcp.mjs: one file, no runtime dependencies except the optional keyring
npm run inspect     # MCP Inspector against the build (set AW_MOCK_MODE=true for demo data)
npm run pack:mcpb   # dist/awardwallet-mcp.mcpb for Claude Desktop
```

| Path | Contents |
|---|---|
| `src/tools/` | The MCP tools |
| `src/awardwallet/` | API client, response types, demo data, summarizing and date handling |
| `src/catalog/` | The raw API operations, one file per AwardWallet API, each with a Zod input schema |
| `src/secure-input.ts` | The local secret-entry page |
| `src/cli.ts` | `login`, `logout`, `status` |
| `test/` | Unit tests plus end-to-end tests that run the built server over stdio |

## Contributing

Issues and pull requests are very welcome, whether it's a bug, a question, a feature idea, docs or code. The best starting point is to [open an issue](https://github.com/bbarabe/awardwallet-mcp/issues/new/choose) describing what you'd like to see. For code, [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, conventions and the PR checklist.

Some ideas where help would be great:

- Answering AwardWallet security questions and one-time codes through the secure input page
- Letting the Claude Desktop extension read keys saved with `login`
- Better summaries for more itinerary types, and more providers' date formats
- Real-world reports: what your AwardWallet accounts look like through the tools, and what's missing

Please don't include API keys, passwords or personal loyalty data in issues or tests.

## License

[MIT](LICENSE). Not affiliated with AwardWallet. "AwardWallet" is a trademark of its owner.
