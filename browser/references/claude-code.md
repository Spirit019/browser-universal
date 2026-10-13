# Claude Code (and other runners)

Install: `~/.claude/skills/browser/` or `<project>/.claude/skills/browser/`.

```bash
mkdir -p ~/.claude/skills
cp -r /path/to/browser-universal/browser ~/.claude/skills/browser
```

One-time browser setup (user runs once):

```bash
cd ~/.claude/skills/browser/scripts
npm install && npx playwright install chromium
```

## Approval gating

The gate is enforced in the script itself (`plan` vs `execute --confirm
--plan-hash`), so it works even on runners without an `ask_question`-style tool:

1. Run `plan`, show the numbered plan + hash to the user.
2. Get explicit approval (native confirm, or the user typing "yes").
3. Run `execute --plan-hash <hash> --confirm ...` re-declaring the exact steps.

If the runner has a background-Task tool, you may run the `execute` in the
background, but you still must have shown the plan and obtained approval first.
