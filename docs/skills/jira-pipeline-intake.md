---
name: jira-pipeline-intake
description: Poll Jira for ai-ready stories, download requirements.md, transition work safely, and hand issues to the pipeline.
---

# Jira Pipeline Intake

Use this when implementing or running the Jira intake stage.

1. Query Jira with `project = PROJECT AND labels = ai-ready AND status = "To Do"`.
2. Only process issues with an attachment named exactly `requirements.md`.
3. Transition the issue to `In Progress` before build work starts.
4. Create `runs/JIRA-KEY/requirements.md`, `logs.txt`, and stage artifacts.
5. If any stage fails after transition, close the Jira issue to `Bug Reported` with the error summary.
6. Never let an issue remain stuck in `In Progress`.
7. For submission demos, `npm run mock` uses `AI-MOCK-1` and the same artifact layout without calling Jira.
