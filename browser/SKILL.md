---
name: browser
description: Let the agent open and control a web browser (navigate, click, type, read page text, take screenshots) on the user's machine. Use when the user asks to browse a site, scrape or read a page, fill a form, check something live on the web, or says /browser. ALWAYS plan first and get explicit per-plan approval before executing; never runs a browser without --confirm.
---

# Browser — gated web browsing for the agent

Gives the agent real browser control (navigate, click, type, read text,
screenshot) through a Playwright driver script — but only behind a mandatory
approval gate.

Skill root: `browser/`. Driver: `scripts/browse.js` (Node). Requires Playwright
(Chromium). One-time setup by the user:

```bash
cd browser/scripts
npm install && npx playwright install chromium
```

## THE GATE (non-negotiable)

There is no single command that both plans and acts. `plan` opens nothing;
`execute` only runs with `--confirm` **and** a matching `--plan-hash`. This is
enforced in the script, so an agent cannot browse without a real approval.

### Step 1 — plan (opens nothing)

```bash
node scripts/browse.js plan --url <url> [--step "goto <url>"] [--step "click <sel>"] ...
```

Prints a readable, numbered plan and a `plan-hash`. **Shows it to the user and
ask for approval** before doing anything else.

### Step 2 — get explicit approval (per-plan)

Present the plan, then ask the user to choose (Cline: `ask_question`):

- ✅ **Approve all** — run every step
- 1️⃣ **Run step 1 only** — execute the first step, then re-plan the rest
- ✏️ **Modify** — let the user edit a step (e.g. redact text before it's typed)
- ❌ **Cancel** — do nothing

Batch approval of the whole plan is the default. If the user edits anything,
re-run `plan` and get a fresh hash — the old hash no longer matches.

### Step 3 — execute (only after approval)

Re-declare the exact approved steps plus the token:

```bash
node scripts/browse.js execute --plan-hash <hash> --confirm --url <url> \
  --step "..." [--step "..."] [--sensitive-ok]
```

The script recomputes the hash from the steps you pass. If it does not equal
`--plan-hash`, it **refuses and exits** — no browser is launched. This is what
makes "approved step A, silently ran step B" impossible.

## Step DSL

Steps are short strings; `--step` is repeatable. Verbs:

| Verb | Example | Meaning |
|---|---|---|
| `goto` | `goto https://x.com` | navigate |
| `click` | `click "text=Sign in"` | click (any Playwright selector) |
| `type` | `type "input[name=q]" "hello"` | fill a field (selector + value) |
| `press` | `press Enter` | key press |
| `wait` | `wait 1500` | wait ms |
| `read` | `read` | dump visible page text |
| `screenshot` | `screenshot out.png` | save a screenshot |

## Safety rails (baked in)

- **Isolated context by default** — a fresh browser with no cookies, so the
  agent is NOT acting inside your logged-in accounts. `--persistent` opts into
  your real profile and must be called out to the user in the plan.
- **Sensitive-action detector** — payment/bank hosts and password fields are
  flagged in the plan; `execute` then additionally requires `--sensitive-ok`
  (a second, explicit approval).
- **Headed by default** — the browser window is visible so the user can watch.
  `--headless` hides it; mention it if used.
- **Nothing runs without `--confirm` + matching hash.** No exceptions.

## Rules for the agent

1. Always `plan` first. Never call `execute` from a plan you didn't show.
2. Show the plan and get explicit approval. Never self-approve.
3. If anything changes after approval, re-`plan` and get a new approval.
4. Never merge browsing results into the main task plan unless the user asks.
5. Don't exfiltrate: never send page contents to a third party the user didn't
   approve. Reading a page into the thread is fine.
6. Prefer the smallest plan that answers the question (often just `read`).

## Runtime notes

- See [cline.md](references/cline.md) for Cline install + `ask_question` gating.
- See [claude-code.md](references/claude-code.md) for Claude Code / other runners.

## Example

User: `/browser read the top post on HN and summarize it`

You:
```bash
node scripts/browse.js plan --url https://news.ycombinator.com --step read
```
Plan shows: `1. goto https://news.ycombinator.com  2. read`, hash `ab12...`.
Ask: Approve all / step 1 only / modify / cancel. User: **Approve all**.
```bash
node scripts/browse.js execute --plan-hash ab12... --confirm \
  --url https://news.ycombinator.com --step read
```
Then summarize the text — raw summary only, no tool dump.
