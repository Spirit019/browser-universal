# Cline

Install: `~/.cline/skills/browser/` (global) or `<project>/.cline/skills/browser/`.

```bash
mkdir -p ~/.cline/skills
ln -s /path/to/browser-universal/browser ~/.cline/skills/browser
```

## One-time browser setup (by the user, once per machine)

The driver needs Playwright + a Chromium build:

```bash
cd ~/.cline/skills/browser/scripts
npm install && npx playwright install chromium
```

Until this is done, `browse.js` exits with a clear "Playwright not installed"
message rather than failing silently.

## Approval gating in Cline

Use the `ask_question` tool to get per-plan approval. Map the four options to
whatever fits the moment (2-5 choices):

- Approve all steps
- Run first step only, then re-plan
- Modify a step
- Cancel

Only after the user picks an approving option do you call `execute` with the
matching `--plan-hash` and `--confirm`. Never call `execute` without it.

## Tooling

- `run_commands` runs `browse.js` (cwd = workspace root; use the absolute or
  repo-relative path to `scripts/browse.js`).
- Browser is headed (visible) by default so the user can watch it act.
- The isolated context means the agent browses without your logged-in cookies.
