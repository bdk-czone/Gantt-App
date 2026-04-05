MyProPlanner stable ProMax V6.2

Created: 2026-04-05

Purpose:
- Locked stable snapshot after UI improvements: toolbar restructure, column sort, column drag-to-reorder, and Outlook view cleanup.
- Use the matching archive `snapshots/MyProPlanner-stable-ProMax-V6.2.tgz` as the rollback backup.

What's included in this snapshot:
- App renamed to "Shlomi's Project Planner" with font size enlarged 40%.
- Toolbar: Filter and Fields buttons removed; Customize / Share / Agenda / Refresh moved to left-aligned row below the List/Gantt/Outlook view switcher in all views.
- List view: column sort on header click (ascending/descending toggle with arrow indicator).
- List view: column drag-to-reorder by dragging column headers.
- List view: richer Display button matching Gantt style (Tasks open by default toggle, font size slider, Reset display).
- Outlook view: hint text box removed.
- Outlook view: header now shows only the Space name instead of "Workspace / Space".
- Git tag: MyProPlanner-stable-ProMax-V6.2 (commit df39895)

Notes:
- Frontend TypeScript checks passed (zero errors) when this snapshot was created.
- Archive excludes generated folders: `frontend/node_modules`, `frontend/dist`, `backend/node_modules`, `backend/dist`, `.git`, and the `snapshots` folder itself.



### To roll back to this exact state at any time:

tar -xzf snapshots/MyProPlanner-stable-ProMax-V6.2.tgz
