---
name: playwright-qa-agent
description: Test a live deployed web app against requirements.md with Playwright, screenshots, console capture, and bug-report.md output.
---

# Playwright QA Agent

Use this for live deployment QA.

1. Parse acceptance criteria from `requirements.md`.
2. Open the deployment URL in Chromium with Playwright.
3. Capture console errors and page exceptions.
4. Test every acceptance criterion with realistic user actions.
5. Save screenshots for initial load, key interactions, and failures.
6. Produce `runs/JIRA-KEY/bug-report.md` using the assignment format.
7. In mock mode, write the placeholder screenshot artifact and PASS report deterministically.
