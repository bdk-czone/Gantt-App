MyProPlanner stable ProMax V.6

Created: 2026-04-05

Purpose:
- Locked stable snapshot after major AI integration, Outlook communication log, and UI consistency pass.
- Use the matching archive `snapshots/MyProPlanner-stable-ProMax-V.6.tgz` as the rollback backup.

What's included in this snapshot:
- Gemini AI integration rewritten to use native REST API (gemini-2.5-flash), replacing the broken OpenAI-compat shim.
- Customer Communication Log with AI-assisted entry drafting from pasted email text or OCR screenshot.
- Outlook view: collapsible tree folder grouping (Workspace → Space → Project → entries).
- Display button in all 3 views (List, Gantt, Outlook) — each with font size slider and Reset display.
- View switcher (List / Gantt / Outlook) now consistent across all views with matching icons and button sizing.
- Gantt Display button unchanged: toggles (Show dependencies, Auto-shift linked tasks, Critical only, Tasks open by default) plus Font size and Zoom scale sliders.
- Git tag: MyProPlanner-stable-ProMax-V.6 (commit a4b6517)

Notes:
- Frontend TypeScript checks passed (zero errors) when this snapshot was created.
- Archive excludes generated folders: `frontend/node_modules`, `frontend/dist`, `backend/node_modules`, `backend/dist`, `.git`, and the `snapshots` folder itself.



### To roll back to this exact state at any time:

tar -xzf snapshots/MyProPlanner-stable-ProMax-V.6.tgz