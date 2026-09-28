# Security policy

This server handles AwardWallet API keys and, for some paid operations, loyalty-program or mailbox passwords, so security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub's [Report a vulnerability](https://github.com/bbarabe/awardwallet-mcp/security/advisories/new) form, under the repository's **Security** tab.

Include what you found, how to reproduce it (demo mode, `AW_MOCK_MODE=true`, is ideal), and the impact you expect. Never include real API keys, passwords or personal data.

You should get an acknowledgement within a few days. Fixes are released on `main` and credited in the advisory unless you prefer otherwise.

## Scope

Especially relevant:

- Leaks of credentials or secrets into tool results, logs, stdout or files.
- The local secure input page: cross-site requests, DNS rebinding, token handling, escaping.
- Ways to pass secrets or smuggle extra fields past the input schemas.
- Anything that sends data somewhere other than AwardWallet's documented API hosts.

Issues in AwardWallet's own services should be reported to AwardWallet.

## Supported versions

Only the latest version on `main` receives security fixes.
