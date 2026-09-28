# AwardWallet MCP

[![CI](https://github.com/bbarabe/awardwallet-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/bbarabe/awardwallet-mcp/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/bbarabe/awardwallet-mcp)](https://github.com/bbarabe/awardwallet-mcp/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Ask **Claude** or **ChatGPT** about your airline miles, hotel points and credit-card rewards tracked in [AwardWallet](https://awardwallet.com):

- "Which of my points, certificates or elite statuses expire before December 31?"
- "What's my Marriott balance and status, and how many nights until the next level?"
- "Show the last 50 transactions on my Delta account."
- "What trips do we have coming up, with confirmation numbers?"
- "Which accounts have update problems?"

It runs on your own computer, and your AwardWallet key stays there.

> **Unofficial.** This project is not affiliated with or endorsed by AwardWallet. It uses AwardWallet's published APIs with a key you create.

## Get started (no coding needed)

### Step 1: Get your AwardWallet API key

You need an AwardWallet account with **AwardWallet Plus**. The API key comes from a free AwardWallet **Business** account that you create from your personal one:

1. Sign in to AwardWallet, then open [Create a business account](https://awardwallet.com/user/create-business-account).
2. **Share your loyalty accounts with the new business.** Your personal account is listed in the business as its administrator, but nothing is shared until you share it. Share your accounts, and turn on sharing for accounts you add later. To include family, invite them from **Members → Add new member** on the business site; each person chooses what to share.
3. Copy your **API key** from [business.awardwallet.com/profile/api](https://business.awardwallet.com/profile/api).

### Step 2: Add it to your AI app

#### Claude Desktop

Works on Windows and Mac. Claude Desktop includes everything needed to run it.

1. Download **[awardwallet-mcp.mcpb](https://github.com/bbarabe/awardwallet-mcp/releases/latest/download/awardwallet-mcp.mcpb)**.
2. Double-click the file. You can also drag it onto the Claude Desktop window, or use **Settings → Extensions → Advanced settings → Install Extension…**
3. Paste your API key when asked, then finish the installation.
4. Ask Claude: *"Which of my AwardWallet points or certificates expire this year?"*

To change the key later, go to **Settings → Extensions → AwardWallet → Configure**.

#### ChatGPT desktop app (Codex or Work)

ChatGPT's Codex and Work modes can use apps like this one that run on your computer.

1. Install **Node.js** (the "LTS" version) from [nodejs.org](https://nodejs.org). It's a normal installer, and you only need it once.
2. Download **[awardwallet-mcp.mjs](https://github.com/bbarabe/awardwallet-mcp/releases/latest/download/awardwallet-mcp.mjs)**. Save it somewhere it can stay, such as a new `Documents\AwardWallet` folder.
3. In ChatGPT, open **Settings → MCP servers → Add server** and fill in:
   - **Name:** `AwardWallet`
   - **Type:** STDIO
   - **Command:** `node`, with the full path to the file you saved as its argument. For example, `C:\Users\you\Documents\AwardWallet\awardwallet-mcp.mjs`, or on a Mac `/Users/you/Documents/AwardWallet/awardwallet-mcp.mjs`.
   - **Environment variable:** `AW_API_KEY` set to your API key
4. Select **Restart**. Then ask ChatGPT about your points.

If the form doesn't have a place for the argument or the environment variable, add the server to ChatGPT's settings file instead. The file is `config.toml`, in the `.codex` folder of your home folder: `C:\Users\you\.codex\config.toml` on Windows, `~/.codex/config.toml` on a Mac. Paste this, with your own path and key:

```toml
[mcp_servers.awardwallet]
command = "node"
args = ['C:\Users\you\Documents\AwardWallet\awardwallet-mcp.mjs']

[mcp_servers.awardwallet.env]
AW_API_KEY = "paste-your-key-here"
```

ChatGPT stores that key in plain text in its settings file. If you'd rather keep it in your computer's credential store, use the [developer setup](#for-developers) instead.

### Try it first with sample data

You don't need an AwardWallet key to see how it works. Demo mode uses a made-up family with eight accounts, a few certificates and some trips, and sends nothing to AwardWallet.

- **Claude Desktop:** leave the API key empty and switch on **Demo mode** in the extension's settings.
- **ChatGPT:** use the environment variable `AW_MOCK_MODE` = `true` instead of `AW_API_KEY`.

### Good to know

- **Balances aren't live.** They're AwardWallet's latest update of each account; results show when that was.
- **What each person shares matters.** Their sharing level ("Read numbers", "Read balances" or "Read all") controls what you see.
- **Free (non-Plus) AwardWallet members show less.** Their history and expiration dates stay hidden unless the Business account has a paid subscription.
- **Trips need more.** The travel timeline needs a paid Business subscription and AwardWallet's approval.
- **Privacy:**
  - The app runs on your computer and talks only to AwardWallet.
  - Your key stays in Claude Desktop's secure settings (or ChatGPT's settings file).
  - Passwords for AwardWallet's paid services are never typed into the chat; a one-time page opens on your computer for them.
- **Read-only mode.** Add `AW_READ_ONLY` = `true` (Claude Desktop: the **Read-only** switch) to let the assistant look but never change anything. It's a good idea with autonomous agents.

Something not working? [Open an issue](https://github.com/bbarabe/awardwallet-mcp/issues/new/choose). Please don't include your API key or personal details.

## For developers

### Build from source

Requires Node.js 20.10 or later.

```bash
git clone https://github.com/bbarabe/awardwallet-mcp.git
cd awardwallet-mcp
npm install
npm run build        # dist/awardwallet-mcp.mjs
```

Save the API key in your OS credential store (Windows Credential Manager, macOS Keychain or Linux Secret Service). `login` checks the key with AwardWallet first; `status` shows what it can see:

```bash
node dist/awardwallet-mcp.mjs login
node dist/awardwallet-mcp.mjs status
```

Credentials are resolved in this order:

1. environment variable (`AW_API_KEY`);
2. `AW_API_KEY_FILE`;
3. the credential store.

`logout --all` removes stored credentials. The Claude Desktop extension can't read the credential store (it ships without the native keyring module), so it uses its own settings.

### Connect from the command line

In the commands below, replace `/absolute/path/to/awardwallet-mcp` with the folder you cloned.

**Claude Code:**

```bash
claude mcp add --scope user awardwallet -- node /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

**ChatGPT desktop / Codex CLI** (they share `~/.codex/config.toml`):

```bash
codex mcp add awardwallet -- node /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

**OpenClaw:**

```bash
openclaw mcp add awardwallet --command node --arg /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

For an autonomous agent, set `AW_READ_ONLY=true`. On a headless Linux machine without a keyring, pass `AW_API_KEY` through the agent's secret mechanism or `AW_API_KEY_FILE`.

**Claude Desktop without the extension:** add a server to `claude_desktop_config.json` with command `node` and the path to `dist/awardwallet-mcp.mjs` as its argument. That server reads the key saved by `login`.

**Any other MCP client:** it's a standard stdio server. Run `node dist/awardwallet-mcp.mjs`.

**Demo data:** use `AW_MOCK_MODE=true` anywhere, for example `claude mcp add awardwallet-demo -e AW_MOCK_MODE=true -- node …`.

### Tools

| Tool | Access | What it does |
|---|---|---|
| `get_status` | read | Which APIs are configured (and where the credentials come from), demo/read-only mode, people and account counts |
| `list_people` | read | Connected AwardWallet users and business members, with ids and sharing levels |
| `list_loyalty_accounts` | read | Balances, elite status, update problems and everything that expires (points, certificates and other sub-accounts, elite status). Filter by person, program, type, balance, or an `expiringBy` date. |
| `get_loyalty_account` | read | One account's properties, sub-accounts, update links and paginated transaction history |
| `get_travel_timeline` | read | Reservations in a date window: flights, hotels, cars, trains, cruises, events and more |
| `search_loyalty_programs`, `get_loyalty_program` | read | Programs AwardWallet supports and what it tracks for each |
| `search_api_operations` | read | Finds raw API operations and returns their input schemas |
| `call_api_read_operation` | read | Runs a read-only raw operation |
| `call_api_write_operation` | write | Runs a raw operation that changes data, signs in to a loyalty or mailbox account, or costs money |
| `get_secure_input_result` | read | Result of a request completed on the secure input page |
| `create_connection_link` | write | *(opt-in, `AW_CONNECT_LINKS=true`)* Creates an AwardWallet invitation link; needs AwardWallet's approval |

Every tool has `readOnlyHint`/`destructiveHint` annotations, and read-only mode doesn't register the write tools.

### Every AwardWallet API

Besides the free Account Access API, AwardWallet sells APIs by contract. Add their credentials to enable them in the catalog tools:

| API | Operations | Credential (`login --api <id>` or environment variable) |
|---|---|---|
| [Account Access](https://awardwallet.com/api/account) | 10 | `accountAccess` / `AW_API_KEY` |
| [Web Parsing (Loyalty)](https://awardwallet.com/api/loyalty) | 9 | `webParsing` / `AW_WEB_PARSING_CREDENTIALS` |
| [Email Parsing](https://awardwallet.com/api/email) | 16 | `emailParsing` / `AW_EMAIL_PARSING_CREDENTIALS` |
| [Credit Card Bonus](https://awardwallet.com/api/cc) | 1 | `creditCardBonus` / `AW_CC_BONUS_CREDENTIALS` |
| [Flight Award Search](https://awardwallet.com/api/flight-award-search) | 3 | `flightAwardSearch` / `AW_FLIGHT_SEARCH_CREDENTIALS` |
| [Hotel Award Search](https://awardwallet.com/api/hotel-award-search) | 3 | `hotelAwardSearch` / `AW_HOTEL_SEARCH_CREDENTIALS` |

Paid-API credentials are `username:password`. Inputs are validated against schemas transcribed from AwardWallet's documentation, and only the validated value is sent.

Current gaps:

- Security-question and one-time-code answers can't be supplied yet.
- The Email Parsing browser-redirect endpoint isn't included.
- The travel timeline covers connected users only.

### Secure input page

`call_api_write_operation` never accepts a password or token as an argument. It returns a one-time link like `http://127.0.0.1:<port>/secure/<token>`: the user types the secret there, the server sends it straight to AwardWallet, and `get_secure_input_result` returns the response.

How the page protects secrets:

- It listens on 127.0.0.1 only and validates `Host`, `Origin` and `Sec-Fetch-Site`.
- It runs no scripts.
- It shows where the secret will be used, and asks for confirmation before sending a password without TLS.
- Links are single-use and expire after 15 minutes.
- Secrets are never logged or stored, and they're redacted from anything returned.

To reach the page on a remote host:

1. Set `AW_SECURE_INPUT_PORT`, then forward it (SSH tunnel, Tailscale Serve).
2. Set `AW_SECURE_INPUT_URL` to the forwarded address, so the links use it.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

### Configuration

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

### Limits

- **Rate limit.** AwardWallet allows 20 requests per rolling 10 minutes for each user, member or account. The server caches identical reads for a minute. It fetches accounts for up to 30 people per call; `peopleOffset` pages through larger businesses.
- **Result size.** Results are capped at 60,000 characters, with valid-JSON truncation and pagination (`limit`, `historyOffset`, `pageToken`).

### Develop and release

```bash
npm test            # unit + end-to-end tests (demo data, no network, no credentials)
npm run typecheck
npm run inspect     # MCP Inspector against the build (set AW_MOCK_MODE=true for demo data)
npm run pack:mcpb   # dist/awardwallet-mcp.mcpb
```

| Path | Contents |
|---|---|
| `src/tools/` | The MCP tools |
| `src/awardwallet/` | API client, response types, demo data, summaries and date handling |
| `src/catalog/` | Raw API operations, one file per AwardWallet API, each with a Zod input schema |
| `src/secure-input.ts` | The local secret-entry page |
| `src/cli.ts` | `login`, `logout`, `status` |
| `test/` | Unit tests, and end-to-end tests that run the built server over stdio |

To release, bump the version in `package.json`, `mcpb/manifest.json` and `src/server.ts`, then push a matching tag (for example `v0.2.0`). The release workflow tests, builds, and attaches `awardwallet-mcp.mcpb` and `awardwallet-mcp.mjs` to a new GitHub release.

## Contributing

Issues and pull requests are very welcome: bugs, questions, ideas, docs or code. Start by [opening an issue](https://github.com/bbarabe/awardwallet-mcp/issues/new/choose); [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, conventions and the PR checklist.

Some ideas where help would be great:

- Answering AwardWallet security questions and one-time codes through the secure input page
- Letting the Claude Desktop extension read keys saved with `login`
- Better summaries for more itinerary types, and more providers' date formats
- Real-world reports of what your accounts look like through the tools, and what's missing

Please don't include API keys, passwords or personal loyalty data in issues or tests.

## License

[MIT](LICENSE). Not affiliated with AwardWallet. "AwardWallet" is a trademark of its owner.
