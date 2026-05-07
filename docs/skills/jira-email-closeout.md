---
name: jira-email-closeout
description: Email QA reports with screenshots, comment results back to Jira, and transition issues to Done or Bug Reported.
---

# Jira Email Closeout

Use this for the final pipeline stage.

1. Send email subject `QA Report - JIRA-KEY - PASS/FAIL`.
2. Include the full `bug-report.md` in the body.
3. Attach all screenshots.
4. Add Jira comment with deployment URL, PR URL, and summary.
5. Transition to `Done` only when QA status is PASS.
6. Transition to `Bug Reported` for partial, failed, crashed, or timed-out runs.
7. In mock mode, write `email-preview.json` and record the final transition without sending SMTP or calling Jira.
