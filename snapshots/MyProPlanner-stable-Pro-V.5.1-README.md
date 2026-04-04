MyProPlanner stable Pro V.5.1

Created: 2026-04-04

Purpose:
- Locked stable snapshot after the planner toolbar interaction fixes, two-line toolbar layout, Gantt seam binding cleanup, and list progress-bar renderer/editor improvements.
- Includes teammate setup hardening: installer clone path now defaults to the launch folder, clearer manual install instructions, and explicit `npm run dev:full` documentation.
- Use the matching archive `snapshots/MyProPlanner-stable-Pro-V.5.1.tgz` as the rollback backup.

Notes:
- Frontend TypeScript checks passed when this snapshot was created.
- Installer script syntax was validated with `bash -n`.
- Archive excludes generated folders like `frontend/node_modules`, `frontend/dist`, `backend/node_modules`, `backend/dist`, `.git`, and the `snapshots` folder itself.
