---
name: agentic-app-builder
description: Build a deployable web app from requirements.md without clarification, using the requested stack.
---

# Agentic App Builder

Use this when generating the app from Jira requirements.

1. Read the full `requirements.md` before writing code.
2. Make reasonable assumptions. Do not ask for clarification.
3. Generate a deployable app under `runs/JIRA-KEY/app`.
4. Prefer the stack requested by the requirements. If absent, use single-file HTML/CSS/JS.
5. Include a package script or static output that Vercel can deploy.
6. Write `build-summary.md` with the chosen stack, files created, and assumptions.
7. In `AGENT_COMMAND=mock` mode, use the deterministic todo app path and still write `build-summary.md`.
