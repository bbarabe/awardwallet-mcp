## What and why

<!-- What does this change, and what problem does it solve? Link the issue if there is one (e.g. "Fixes #12"). -->

## Checklist

- [ ] `npm run typecheck`, `npm test` and `npm run pack:mcpb` pass
- [ ] Tests cover the change, and need no credentials or network
- [ ] New or changed tools have a `title`, accurate `readOnlyHint`/`destructiveHint`, and descriptions that say what they do (not how the model should behave)
- [ ] Secrets never pass through tool arguments, results, logs or stdout
- [ ] README/CONTRIBUTING updated if behavior or configuration changed
- [ ] No API keys, passwords or real personal loyalty data anywhere in the PR
