# browser — gated web browsing skill

A universal [Agent Skills](https://agentskills.io/specification)-compatible skill
that lets the agent control a real browser (navigate, click, type, read text,
screenshot) — **only behind a mandatory, per-plan approval gate**.

Type `/browser <task>` → the agent shows you an exact plan → you approve →
it runs. Nothing touches a browser without your explicit go-ahead.

- **Structural gate:** `plan` opens nothing; `execute` refuses without
  `--confirm` **and** a matching `--plan-hash`. "Approved step A, silently ran
  step B" is impossible — the script recomputes the hash and bails on mismatch.
- **Isolated by default:** a fresh browser with no cookies, so the agent is not
  acting inside your logged-in accounts. `--persistent` opts in explicitly.
- **Sensitive-action detector:** payment/bank hosts and password fields are
  flagged and need a second `--sensitive-ok` approval.
- **Headed by default:** you can watch the browser act.

Works in **Cline**, **Claude Code**, and any `SKILL.md` runner.

---

## Table of contents

- [Requirements](#requirements)
- [Install](#install)
- [How the gate works](#how-the-gate-works)
- [How to use](#how-to-use)
- [Step DSL](#step-dsl)
- [Safety model](#safety-model)
- [Repo layout](#repo-layout)
- [License](#license)

---

## Requirements

- **Node.js** 18+
- **Playwright + Chromium** (one-time install, see below)

---

## Install

```bash
git clone <your-repo-url> browser-universal
cd browser-universal
```

**One-time browser setup** (installs Playwright + a Chromium build):

```bash
cd browser/scripts
npm install && npx playwright install chromium
```

**Link the skill:**

Cline (global):
```bash
mkdir -p ~/.cline/skills
ln -s "$(pwd)/browser" ~/.cline/skills/browser
```

Claude Code (global):
```bash
mkdir -p ~/.claude/skills
cp -r browser ~/.claude/skills/browser
```

Project-local: use `<project>/.cline/skills/` or `<project>/.claude/skills/`.

---

## How the gate works

There is **no single command that both plans and acts.**

| Phase | Command | Effect |
|---|---|---|
| 1. Plan | `node browse.js plan --url … --step …` | Prints a numbered plan + `plan-hash`. **Opens nothing.** |
| 2. Approve | — | Agent shows the plan; **user** approves (per-plan). |
| 3. Execute | `node browse.js execute --plan-hash <h> --confirm …` | Runs only if the hash matches the approved steps. |

`execute` recomputes the hash from the steps you pass and **refuses** if it
doesn't equal `--plan-hash`. So the agent cannot approve plan A and then run a
different plan B.

---

## How to use

Trigger: `/browser <task>`, or ask the agent to browse / read / check a page.

Example — *"read the top post on HN and summarize it"*:

```bash
# 1. plan (opens nothing)
node browse.js plan --url https://news.ycombinator.com --step read
# -> prints:
#    1. goto https://news.ycombinator.com
#    2. read
#    plan-hash: ab12cd34ef56

# 2. you approve

# 3. execute (only after approval)
node browse.js execute --plan-hash ab12cd34ef56 --confirm \
  --url https://news.ycombinator.com --step read
```

The four approval choices the agent offers (Cline `ask_question`):
Approve all · run step 1 only · modify · cancel.

---

## Step DSL

`--step` is repeatable. Verbs:

| Verb | Example | Meaning |
|---|---|---|
| `goto` | `goto https://x.com` | navigate |
| `click` | `click "text=Sign in"` | click (Playwright selector) |
| `type` | `type "input[name=q]" "hello"` | fill a field |
| `press` | `press Enter` | key press |
| `wait` | `wait 1500` | wait ms |
| `read` | `read` | dump visible page text |
| `screenshot` | `screenshot out.png` | save a screenshot |

---

## Safety model

- **Isolated context by default** — fresh browser, no cookies, not logged into
  your accounts. `--persistent` opts into your real profile (called out in plan).
- **Sensitive detector** — payment/bank hosts + password fields force an extra
  `--sensitive-ok` (second explicit approval).
- **Headed by default** — visible browser window; `--headless` hides it.
- **Nothing runs without `--confirm` + matching hash.**

---

## Repo layout

```text
browser-universal/
├── README.md
├── LICENSE
├── .gitignore
└── browser/
    ├── SKILL.md                  # gate rules, DSL, safety, examples
    └── scripts/
        ├── browse.js             # plan / execute driver (structural gate)
        ├── package.json          # pins playwright
        └── .gitignore
```

Spec compliance: `name` matches the directory (`browser`); frontmatter within
the Agent Skills spec (name ≤64 chars lowercase+hyphens; description ≤1024).

---

## License

MIT — see [LICENSE](LICENSE).
