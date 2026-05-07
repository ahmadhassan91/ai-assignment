---
name: self-healing-test-loop
description: Generate meaningful tests, run them, fix failures automatically, and save test-results.txt.
---

# Self-Healing Test Loop

Use this after app generation.

1. Derive tests from features and acceptance criteria.
2. Write non-trivial tests that exercise behavior, not snapshots alone.
3. Run tests programmatically.
4. On failure, read the output, patch the app or tests only when the assertion was wrong, and rerun.
5. Stop only when tests pass or retry limit is reached.
6. Save the final output to `runs/JIRA-KEY/test-results.txt`.
7. In mock mode, still write `test-results.txt` so the submission proof path is identical.
