# Submission Checklist

Use this before recording and during the Loom so every assignment proof point is visible.

## Pre-Recording Checklist

- [ ] Repository is open at `/Users/clustox1/Documents/Assignment`.
- [ ] Dependencies are installed with `npm install`.
- [ ] `.env.example` is present; real `.env` is filled only if doing a real service run.
- [ ] Jira demo story is ready with label `ai-ready`, status `To Do`, and attachment named exactly `requirements.md`.
- [ ] Mock fixture exists at `fixtures/requirements.todo.md`.
- [ ] Previous demo artifacts are removed or clearly ignored: `rm -rf runs/AI-MOCK-1`.
- [ ] Unit tests pass: `npm test`.
- [ ] Decide recording path: `npm run mock` for deterministic proof, `npm run poll` for real integrations.

## Recording Checklist

| Proof point | What to show | Command or artifact |
| --- | --- | --- |
| 1. Jira intake | Story format, `ai-ready` label, `To Do` status, and `requirements.md` attachment rule | README Jira Story Format section or real Jira issue |
| 2. Requirements download/run folder | Pipeline creates a Jira-keyed run directory and stores requirements | `runs/AI-MOCK-1/requirements.md` |
| 3. Agentic app build | Generated app files and build summary | `runs/AI-MOCK-1/app/index.html`, `runs/AI-MOCK-1/app/build-summary.md` |
| 4. Self-healing tests | Test stage completed and saved output | `runs/AI-MOCK-1/test-results.txt` |
| 5. GitHub PR handoff | Release stage produced branch and PR URL | `runs/AI-MOCK-1/release-summary.json` |
| 6. Vercel deployment | Release stage produced deployment URL and health-check target | `runs/AI-MOCK-1/release-summary.json` |
| 7. Playwright QA | QA report and screenshot artifacts exist | `runs/AI-MOCK-1/bug-report.md`, `runs/AI-MOCK-1/screenshots/` |
| 8. Email and Jira closeout | Email report preview and final transition are visible | `runs/AI-MOCK-1/email-preview.json`, terminal line `Final Jira transition: Done` |

## Exact Mock Recording Flow

```bash
npm test
rm -rf runs/AI-MOCK-1
npm run mock
```

Then open these in order:

1. `runs/AI-MOCK-1/logs.txt`
2. `runs/AI-MOCK-1/requirements.md`
3. `runs/AI-MOCK-1/app/index.html`
4. `runs/AI-MOCK-1/app/build-summary.md`
5. `runs/AI-MOCK-1/test-results.txt`
6. `runs/AI-MOCK-1/release-summary.json`
7. `runs/AI-MOCK-1/bug-report.md`
8. `runs/AI-MOCK-1/email-preview.json`

## Real Run Recording Swap

For the real pipeline, replace `npm run mock` with:

```bash
npm run poll
```

Show the same run artifacts under the real Jira key, then show the live Jira comment, GitHub PR, Vercel deployment URL, delivered email, and final Jira status.
