---
name: get-started
description: Set up the AwardWallet plugin and check it works. Use when the user has just installed it, asks how to set it up or connect their account, or when an AwardWallet tool reports a missing or rejected API key or finds no accounts.
---

# Get started with AwardWallet

Walk the user through connecting AwardWallet, one step at a time, in plain language.

1. Call `get_status`.
   - `mode` starts with "demo": the plugin is showing sample data. Say so, then go to step 4.
   - `setupHelp` is present: no API key yet. Go to step 2.
   - `businessAccount.accounts` is 0: go to step 3.
   - Otherwise go to step 4.

2. **Connect the API key.** Briefly explain what the user needs first:
   - AwardWallet Plus on their AwardWallet account.
   - A free AwardWallet Business account, created at https://awardwallet.com/user/create-business-account while signed in to AwardWallet. They sign in to both with the same login.
   - The API key, copied from https://business.awardwallet.com/profile/api.

   Then call `connect_awardwallet` and give the user its link. They open it in their browser and paste the key there. Never ask for the key in the chat. If they paste one into the chat anyway, don't repeat or use it; ask them to enter it on the page instead.

   When the user says they're done, call `get_secure_input_result` with the `submissionId`. If the status is `completed`, call `get_status` again and continue. If it's `expired` or `cancelled`, offer a new link.

3. **No accounts visible.** The key works, but the Business account can't see any loyalty accounts yet. Tell the user to:
   1. Open https://business.awardwallet.com, click **Members**, then **Request full access**.
   2. Approve the request from the email AwardWallet sends them.

   Their accounts appear once they approve, including ones they add later. Family members can be invited under **Members → Add new member**; each person approves in their own AwardWallet account.

4. **Confirm and suggest questions.** Summarize what the plugin can see, for example "3 people and 24 loyalty accounts". Then suggest a few things to ask:
   - Which points, certificates or elite statuses expire in the next 90 days?
   - What's my Marriott balance and status?
   - What trips do we have coming up?

Balances are AwardWallet's latest update of each account, not live checks. Mention it once if the user seems to expect live numbers.
