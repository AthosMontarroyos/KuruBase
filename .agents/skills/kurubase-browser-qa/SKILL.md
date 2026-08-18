---
name: kurubase-browser-qa
description: Verify KuruBase web interfaces and browser-to-API workflows. Use after starting a KuruBase frontend or documentation dev server, when testing responsive behavior, authentication failures, CRUD flows, accessibility, console errors, or release readiness.
---

# KuruBase Browser QA

Use the project-managed `agent-browser` command through `npx agent-browser`. Do not install it globally as a side effect of verification.

## Workflow

1. Load the matching CLI instructions with `npx agent-browser skills get core`.
2. Open the actual application URL and wait for network idle.
3. Verify the primary workflow at 1440x900 and 390x844.
4. Capture one desktop and one mobile screenshot in the same review pass.
5. Check the browser console, failed network requests, focus order, labels, overflow, and loading/error/empty states.
6. Exercise a rejected authentication request and a successful data request using non-production test credentials.
7. Re-run once after fixes, close the browser session, and report residual risks.

Never paste access tokens into source files, screenshots, logs, or the final report. Browser QA supplements API and RLS integration tests; it cannot prove database isolation by itself.
