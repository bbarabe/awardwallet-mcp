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

You need an AwardWallet account with **AwardWallet Plus**. The API key comes from a free AwardWallet **Business** account linked to your personal account; you sign in to both with the same login.

1. Sign in to AwardWallet, then open [Create a business account](https://awardwallet.com/user/create-business-account).
2. **Give the business access to your loyalty accounts.** On the business site ([business.awardwallet.com](https://business.awardwallet.com)), click **Members** at the top, then **Request full access**.
3. **Approve the request.** AwardWallet emails you a link to authorize it. Once you approve, all your loyalty accounts are shared with the business, including ones you add later. Until then the business lists you with no accounts, and your assistant will find nothing.
4. **Optional: add family.** On the business site, use **Members → Add new member** to invite them. Each person approves in their own AwardWallet account and chooses how much to share; "Read all" is enough for this app.
5. Copy your **API key** from [business.awardwallet.com/profile/api](https://business.awardwallet.com/profile/api).

### Step 2: Add it to your AI app

#### Claude Desktop

Works on Windows and Mac. Claude Desktop includes everything needed to run it.

1. Download **[awardwallet-mcp.mcpb](https://github.com/bbarabe/awardwallet-mcp/releases/latest/download/awardwallet-mcp.mcpb)**.
2. Double-click the file. You can also drag it onto the Claude Desktop window, or use **Settings → Extensions → Advanced settings → Install Extension…**
3. Paste your API key when asked, then finish the installation.
4. Ask Claude: *"Which of my AwardWallet points or certificates expire this year?"*

To change the key later, go to **Settings → Extensions → AwardWallet → Configure**.

#### Claude Code and Cowork

The same plugin as for ChatGPT, without downloading anything. It works in Claude Code (the Claude Desktop **Code** tab, the terminal and VS Code) and in Cowork. Regular Claude chats can't run plugins that run on your computer; use the [Claude Desktop extension](#claude-desktop) for those.

1. Add the marketplace `bbarabe/awardwallet-mcp`:
   - **Claude Desktop:** **Customize → Plugins → Add → Add marketplace**, then enter it as the URL.
   - **Terminal:** `claude plugin marketplace add bbarabe/awardwallet-mcp`
2. Add **AwardWallet** from the plugin list (terminal: `claude plugin install awardwallet@awardwallet-mcp`).
3. Start a new session and ask Claude to *"set up AwardWallet"*. It gives you a link to a **secure connection page** on your computer.
4. Paste your API key on that page and select **Check and save**. Then tell Claude you're done.

Needs [Node.js](https://nodejs.org) 20.10 or later, unless the ChatGPT desktop app is installed: the plugin uses ChatGPT's copy of Node when it finds one.

#### ChatGPT desktop app

Works on Windows and Mac, in the ChatGPT desktop app's Codex and Work modes. ChatGPT includes everything needed to run it.

1. In ChatGPT, open **Plugins** in the sidebar, then choose **Add → Add a marketplace**.
2. Fill in:
   - **Source:** `bbarabe/awardwallet-mcp`
   - **Git ref:** `plugin`

   Then select **Add marketplace**.
3. Search the plugins for **AwardWallet**, open it and select **Install plugin**.
4. Select **Set up AwardWallet**. ChatGPT checks the connection and gives you a link to a **secure connection page** that opens on your computer.
5. Paste your API key on that page and select **Check and save**. Then tell ChatGPT you're done.
6. Ask ChatGPT: *"Which of my points, certificates or elite statuses expire in the next 90 days?"*

To change the key later, ask ChatGPT to *"connect AwardWallet again"*.

To update to a new version, open **Settings → Plugins → Marketplace**, select **Upgrade** next to **AwardWallet MCP**, then restart ChatGPT. To uninstall, select the delete icon there instead; your saved key stays on your computer in case you reinstall.

### Try it first with sample data

You don't need an AwardWallet key to see how it works. Demo mode uses a made-up family with eight accounts, a few certificates and some trips, and sends nothing to AwardWallet.

- **Claude Desktop:** leave the API key empty and switch on **Demo mode** in the extension's settings.
- **ChatGPT:** the plugin has no settings screen, so use the [developer setup](#connect-from-the-command-line) with `AW_MOCK_MODE=true`.

### Good to know

- **Balances aren't live.** They're AwardWallet's latest update of each account; results show when that was.
- **What each person shares matters.** Their sharing level ("Read numbers", "Read balances" or "Read all") controls what you see.
- **Free (non-Plus) AwardWallet members show less.** Their history and expiration dates stay hidden unless the Business account has a paid subscription.
- **Trips need more.** The travel timeline needs a paid Business subscription and AwardWallet's approval.
- **Privacy:**
  - The app runs on your computer and talks only to AwardWallet.
  - Your key stays on your computer: in Claude Desktop's secure settings, or for ChatGPT, in a settings file in the plugin's private folder.
  - Keys and passwords are never typed into the chat; a one-time page opens on your computer for them.
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
3. the credential store;
4. the settings file written by `connect_awardwallet`'s secure page: `credentials.json` in the plugin's data folder (`PLUGIN_DATA`) when running as a ChatGPT/Codex plugin, otherwise in `%APPDATA%wardwallet-mcp` (Windows), `~/Library/Application Support/awardwallet-mcp` (Mac) or `~/.config/awardwallet-mcp` (Linux). The file is readable only by you.

`logout --all` removes credentials from the credential store. The Claude Desktop extension and the ChatGPT plugin can't read the credential store (they ship without the native keyring module), so they use their own settings or the settings file.

### Connect from the command line

In the commands below, replace `/absolute/path/to/awardwallet-mcp` with the folder you cloned.

**Claude Code:**

```bash
claude mcp add --scope user awardwallet -- node /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

**Codex CLI** (shares `~/.codex/config.toml` with the ChatGPT desktop app). Install the published plugin:

```bash
codex plugin marketplace add bbarabe/awardwallet-mcp --ref plugin
codex plugin add awardwallet@awardwallet-mcp
```

Or run your build as a plain MCP server:

```bash
codex mcp add awardwallet -- node /absolute/path/to/awardwallet-mcp/dist/awardwallet-mcp.mjs
```

To try an unreleased plugin build, run `npm run pack:plugin` and add `build/chatgpt-marketplace` as a marketplace, either from the ChatGPT **Plugins → Add → Add a marketplace** dialog or with `codex plugin marketplace add`.

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
| `connect_awardwallet` | write | Link to the secure input page where the user enters the API key (or a paid API's credentials); saves them to the settings file and uses them right away |
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
npm run pack:plugin # build/chatgpt-marketplace: plugin marketplace for ChatGPT desktop and Codex
```

| Path | Contents |
|---|---|
| `src/tools/` | The MCP tools |
| `src/awardwallet/` | API client, response types, demo data, summaries and date handling |
| `src/catalog/` | Raw API operations, one file per AwardWallet API, each with a Zod input schema |
| `src/secure-input.ts` | The local secret-entry page |
| `src/setup.ts` | Checking and saving API credentials (`connect_awardwallet`, `login`) |
| `plugin/` | ChatGPT / Codex plugin: manifest, MCP config, Node launchers, skills and icons |
| `src/cli.ts` | `login`, `logout`, `status` |
| `test/` | Unit tests, and end-to-end tests that run the built server over stdio |

To release, bump the version in `package.json`, `mcpb/manifest.json`, `plugin/plugin.json`, `plugin/.claude-plugin/plugin.json` and `src/server.ts`, then push a matching tag (for example `v0.2.0`). The release workflow tests and builds, attaches `awardwallet-mcp.mcpb` and `awardwallet-mcp.mjs` to a new GitHub release, and publishes the plugin to the `plugin` branch that ChatGPT and Claude install from.

The plugin's launchers (`plugin/scripts/`; Claude refuses plugins with a top-level `bin/` in chat and Cowork) run the server with the Node.js runtime that ships with ChatGPT and Codex, and fall back to a Node.js on `PATH`.

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
