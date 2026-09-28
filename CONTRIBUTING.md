# Contributing to AwardWallet MCP

Thanks for your interest! Bug reports, questions, ideas, docs fixes and code are all welcome.

## Issues

- **Bugs:** [open a bug report](https://github.com/bbarabe/awardwallet-mcp/issues/new?template=bug_report.yml). Say which client you use (Claude Desktop, Claude Code, OpenClaw…), your OS and Node version, and the output of `awardwallet-mcp --version`.
- **Ideas and questions:** [open a feature request](https://github.com/bbarabe/awardwallet-mcp/issues/new?template=feature_request.yml), or a blank issue.
- **Security problems:** please don't open a public issue. Follow [SECURITY.md](SECURITY.md).

**Never paste API keys, passwords, tokens or personal loyalty data** (account numbers, balances, names) into issues. Reproduce with demo mode (`AW_MOCK_MODE=true`) when you can.

## Development setup

Requires Node.js 20.10 or later.

```bash
git clone https://github.com/bbarabe/awardwallet-mcp.git
cd awardwallet-mcp
npm install
npm run build
npm test
```

| Command | What it does |
|---|---|
| `npm test` | Unit and end-to-end tests; demo data only, no network or credentials needed |
| `npm run typecheck` | TypeScript, strict |
| `npm run build` | Bundles `dist/awardwallet-mcp.mjs` |
| `npm run inspect` | Opens the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) against the build; run with `AW_MOCK_MODE=true` for demo data |
| `npm run pack:mcpb` | Builds and validates the Claude Desktop extension |

## Where things live

- **A new tool:** `src/tools/`. Register it in `account-tools.ts` or `catalog-tools.ts`, and add a test in `test/unit/tools.test.ts`.
- **A new or corrected raw API operation:** the matching file in `src/catalog/`, following the `ApiOperation` contract in `src/catalog/types.ts`. `test/unit/catalog.test.ts` enforces its invariants automatically. Link the exact section of AwardWallet's docs in `docsUrl`.
- **Formatting and summaries:** `src/awardwallet/format.ts`.
- **Demo data:** `src/awardwallet/mock.ts`. Keep it fictional.

## Conventions

These keep the server safe and pleasant for the model and the user:

- **Tool descriptions say what the tool does and returns.** They don't instruct the model how to behave.
- **Keep reads and writes in separate tools.** Every tool gets a `title` and accurate `readOnlyHint`/`destructiveHint` annotations.
- **Secrets never go through tool arguments.** A new operation that needs a password or token lists it in `secretFields`, so it's collected on the secure input page.
- **Never log, return or persist secrets.** stdout is the MCP protocol channel, so diagnostics go to stderr.
- **Keep results compact.** Summarize, paginate, and explain hidden or missing data in `notes`.
- **Validate inputs with Zod,** and return actionable error messages.
- **Test behavior changes.** Tests must not need credentials or the network.

## Pull requests

1. Fork, and create a branch from `main`.
2. Make the change, with tests.
3. Check that `npm run typecheck`, `npm test` and `npm run pack:mcpb` pass. CI runs them on Linux, Windows and macOS.
4. Open the PR and describe what changed and why. Small, focused PRs are easiest to review.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
