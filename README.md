# Zero Human Touch Pipeline

Automates the assignment flow from Jira story intake to generated app, tests, GitHub PR, Vercel deployment, Playwright QA, email report, and Jira closeout.

## Mock Demo

Use this for the Loom proof run when real credentials are not available or when you need a deterministic dry run.

```bash
npm install
npm test
npm run mock
```

`npm run mock` forces `AGENT_COMMAND=mock` and `EMAIL_HOST=mock`, reads `fixtures/requirements.todo.md`, processes a synthetic Jira story `AI-MOCK-1`, and writes artifacts under `runs/AI-MOCK-1/`. It does not call Jira, GitHub, Vercel, or SMTP. Expected proof artifacts include:

- `runs/AI-MOCK-1/requirements.md`
- `runs/AI-MOCK-1/app/index.html`
- `runs/AI-MOCK-1/app/build-summary.md`
- `runs/AI-MOCK-1/test-results.txt`
- `runs/AI-MOCK-1/release-summary.json`
- `runs/AI-MOCK-1/bug-report.md`
- `runs/AI-MOCK-1/email-preview.json`
- `runs/AI-MOCK-1/logs.txt`

## Real Setup

1. Create real Jira, GitHub, Vercel, and SMTP credentials.
2. Copy `.env.example` to `.env`.
3. Fill all required values listed below.
4. Make sure the GitHub CLI `gh` is authenticated for the target repository.
5. Make sure the local agent command in `AGENT_COMMAND` is installed and can generate files from a prompt.
6. Run `npm test`.
7. Create an `ai-ready` Jira story with an attached `requirements.md`.
8. Run `npm run poll` once, or `npm start` for the cron worker.

## Environment Variables

Required for real mode:

```bash
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=APP
GITHUB_REPO=owner/repo
VERCEL_TOKEN=your-vercel-token
VERCEL_PROJECT_ID=your-vercel-project-id
EMAIL_HOST=smtp.example.com
EMAIL_USER=apikey
EMAIL_PASS=your-email-password
EMAIL_FROM=qa-bot@example.com
EMAIL_TO=manager@example.com
```

Optional:

```bash
JIRA_TO_DO_STATUS=To Do
JIRA_IN_PROGRESS_TRANSITION=In Progress
JIRA_DONE_TRANSITION=Done
JIRA_BUG_REPORTED_TRANSITION=Bug Reported
VERCEL_ORG_ID=your-vercel-team-id
EMAIL_PORT=587
AGENT_COMMAND=codex
PIPELINE_CRON=*/5 * * * *
RUNS_DIR=runs
```

## Jira Story Format

The real poller only picks up Jira issues that match this shape:

- Project: `JIRA_PROJECT_KEY`
- Label: `ai-ready`
- Status: `JIRA_TO_DO_STATUS`, default `To Do`
- Attachment named exactly `requirements.md`

Suggested story:

```markdown
Summary: Build a simple todo app
Labels: ai-ready
Status: To Do
Attachment: requirements.md

# Requirements - Simple Todo App

## What to build
A single-page app for managing todos.

## Features
- Add todo items
- Mark todos complete
- Delete todos
- Persist todos in localStorage

## Tech
- Plain HTML, CSS, JavaScript

## Acceptance criteria
- Add a new todo item
- Mark a todo as complete
- Delete a todo item
- Persist todos in localStorage
- No console errors on load
```

## Run Commands

```bash
npm test                         # run unit tests
npm run mock                     # deterministic dry run, no external services
npm run poll                     # process ready Jira issues once
npm start                        # run the scheduled worker
npm run qa -- <url> [run-dir]    # run Playwright QA against a deployed URL
```

Use a custom fixture for the mock demo:

```bash
npm run mock -- ./path/to/requirements.md
```

Use a custom cron:

```bash
PIPELINE_CRON="*/5 * * * *" npm start
```

## Loom Recording Sequence

1. Show the repository, `README.md`, and `docs/submission-checklist.md`.
2. Show the Jira story format and the `requirements.md` attachment requirement.
3. Run `npm test`.
4. Run `npm run mock`.
5. Open `runs/AI-MOCK-1/logs.txt` to show stage order and final status.
6. Open `app/index.html` and `build-summary.md` to prove app generation.
7. Open `test-results.txt` to prove the self-healing test stage completed.
8. Open `release-summary.json` to prove PR/deployment URLs are produced.
9. Open `bug-report.md` and `screenshots/` to prove QA output.
10. Open `email-preview.json` and the final Jira transition line from the terminal.

For real credentials, repeat the same sequence with `npm run poll` and show the actual Jira comment, PR, Vercel deployment, email, and final Jira transition.

## Troubleshooting

- `Missing required environment variable`: real mode needs `.env`; run `npm run mock` for the dry run.
- Jira issue not picked up: verify label `ai-ready`, status, project key, and attachment name `requirements.md`.
- Jira transition not found: set the `JIRA_*_TRANSITION` values to the exact transition names in the Jira workflow.
- Build agent does nothing: check `AGENT_COMMAND`; real mode passes the build prompt as the final argument unless the command contains `{prompt}`.
- GitHub PR fails: authenticate `gh`, verify `GITHUB_REPO`, and confirm the working tree allows branch creation.
- Vercel deploy fails: verify `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` for team projects.
- QA fails to open deployment: confirm the Vercel URL is live and returns a 2xx status.
- Email not sent: verify SMTP credentials; mock mode writes `email-preview.json` instead.
