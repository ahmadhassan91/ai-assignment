---
name: github-vercel-release
description: Push generated app work to GitHub, open a Jira-keyed PR, deploy to Vercel, and health check the live URL.
---

# GitHub Vercel Release

Use this after tests pass.

1. Create branch `feature/JIRA-KEY-short-description`.
2. Commit all generated output and reports with a meaningful message.
3. Push the branch to `GITHUB_REPO`.
4. Open a PR whose title includes the Jira key.
5. Trigger a Vercel deployment for the branch.
6. Poll until deployment is `READY`.
7. `curl` the live URL and require HTTP 200 before QA starts.
8. In mock mode, write `release-summary.json` with deterministic PR and deployment URLs instead of calling GitHub or Vercel.
