---
name: expiring-rewards
description: Review AwardWallet points, miles, certificates, free-night awards and elite statuses that expire soon, grouped by person with dates and suggested next steps. Use when the user asks what's expiring, what they might lose, or for a regular rewards check-up.
---

# Review expiring rewards

1. Pick the window. Use the user's date or number of days if they give one; otherwise use the next 90 days.

2. Call `list_loyalty_accounts` with `expiringWithinDays` (or `expiringBy` for a specific date). Add `owner`, `program` or `kind` only if the user asked to narrow it. If the result says more people remain (`peopleOffset`), fetch the next page too.

3. Present the results as a table, soonest first:

   | Person | Program | What expires | Amount | Date | Days left |

   - Treat each expiring item separately: the points balance, each certificate or other sub-account, and elite status.
   - Group by person when more than one person has something expiring.
   - Say plainly when nothing expires in the window.

4. For each item, suggest one practical way to keep it, when the program's rules are well known. For example, many programs extend points after any earning or redeeming activity, and certificates can usually be used but not extended. If you're not sure of a program's rule, say so rather than guessing.

5. Flag accounts whose `lastUpdated` is more than two weeks old, or that have update problems. Their dates may be out of date, so the user should refresh them in AwardWallet.

Balances and dates are AwardWallet's latest update of each account, not live checks.
