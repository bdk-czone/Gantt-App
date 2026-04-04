# MyProPlanner

MyProPlanner is a full-stack planning app for managing projects, tasks, and schedules in both List and Gantt views.

It is designed for teams that want a lightweight planner with hierarchical tasks, dependency-aware scheduling, reusable project templates, and a cleaner planning workflow than a spreadsheet.


### Quick start

```bash
cd /path/to/Gantt-App
npm run dev:full
```


## Project Outline

MyProPlanner organizes work in this structure:

- Workspaces
- Spaces inside each workspace
- Projects (stored as lists)
- Tasks and subtasks inside each project
- Dependencies between tasks

The app currently focuses on planning and scheduling. It does not yet include user accounts, permissions, invites, or comments as first-class features.

## What The App Includes

### Core Planning

- Workspace, space, and project management
- Unlimited task nesting
- Task creation, editing, moving, and deletion
- Project start and end dates
- Status tracking with configurable project-specific status sets
- Custom fields per project
- Color and icon selection for projects and tasks

### List View

- Spreadsheet-style project view
- Show or hide fields per project
- Reorder and resize columns
- Built-in and custom fields
- Inline editing for common task values
- Project-aware filtering and saved view support

### Gantt View

- Timeline rendering for projects and tasks
- Day, week, and month zoom levels
- Sticky date/day header while scrolling
- Jump to the current day
- Drag a bar to move a task in time
- Drag the left or right edge of a task bar to shorten or extend duration
- Collapse an entire project to only show the project row
- Collapse or expand subtasks
- Resize the left task column
- Resize the planner header area vertically

### Hierarchy And Ordering

- Right-click task actions in Gantt
- Make a task a subtask of the task above
- Move a task one level up
- Reorder tasks by drag and drop within the same level
- Change parent/level from the task edit modal

### Dependencies

- Simple dependency model: task B can start only after task A is finished
- Dependency add/remove from the task edit modal
- Dependency visualization in Gantt
- Dependency conflict warnings
- Optional auto-shift helper to move a task forward to satisfy dependency rules
- Circular dependency protection in the backend

### View Customization

- `Customize view` side drawer
- Field visibility controls
- Filter and grouping placeholders
- Saved views
- View persistence controls
- Cleaner top menu bar for view/filter/customize actions

### Templates / Reuse

- Built-in project templates
- Save an existing project as a reusable template
- Templates can include:
  - default statuses
  - default fields
  - saved views
  - colors and icons
  - starter tasks
  - task dependencies

### Reporting And Planning Signals

- Critical path calculation
- Dependency conflict highlighting
- Overdue task highlighting
- Basic reports drawer
- Stakeholder report export
- Read-only workload share links with auto-refresh
- Gantt SVG and PNG export

### UI / Usability Improvements Already Included

- Scrollable sidebar for large workspace/project trees
- Scrollable task areas for large project/task sets
- Sticky Gantt header
- Cleaner Planner toolbar
- Templates entry point from the sidebar

## Architecture

### Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Docker named volume `pgdata`) |
| UI helpers | `date-fns`, `lucide-react` |
| File uploads | `multer` (disk storage, local `./data/uploads/`) |

### Request Flow

```text
Browser
  ↓ (dev: Vite proxy rewrites /api/* → http://localhost:3001)
  ↓ (prod: same-origin, backend serves built frontend from frontend/dist)
Express backend (port 3001)
  ↓ requireAuth middleware checks session cookie
  ↓ route handler
PostgreSQL (port 5432, Docker)
```

In development, Vite's dev server proxies all `/api` requests to the backend so the frontend never needs to think about CORS or ports.  
In production, the backend builds and serves the frontend as static files from `frontend/dist`, so a single process on a single port serves everything.

### Authentication Flow

MyProPlanner uses a single shared **passkey** (not per-user accounts).

1. On first run, the app prompts to set a passkey. The passkey is hashed with bcrypt and stored in `app_config` (a single-row table).
2. On login, the entered passkey is compared against the stored hash.
3. If correct, the backend creates a session row in the `sessions` table and sets a `session` HttpOnly cookie.
4. Every subsequent request passes through the `requireAuth` middleware, which validates the cookie against `sessions`.
5. The `/api/auth/*` routes and the public share routes (`/api/shares/public/:token`) are exempted from auth.

This means all data is shared — whoever knows the passkey can see everything. It is not a multi-user identity system.

### Schema Migration Pattern

There are no numbered migration files. Instead, `backend/src/ensureSchema.ts` holds an array called `SCHEMA_PATCHES` — a list of idempotent SQL statements (mostly `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

Every time the backend starts, `ensureSchema()` runs all patches in order. Because each statement is safe to re-run, the database is always brought to the current schema without tracking a migration version. New features just append new patches to the array.

### Storage Layers

**PostgreSQL (persistent, shared across all users of the instance):**

- `workspaces`, `spaces`, `lists` (projects), `tasks`, `task_dependencies`
- `app_config` — passkey hash, single row
- `sessions` — active login sessions
- `workload_shares` — share link tokens and their included project lists
- `project_resources` — per-project bookmark links and uploaded file metadata

**Local filesystem (`./data/uploads/`, gitignored):**

- Uploaded files from the Project Resources feature
- Files are stored with a random 8-byte hex prefix to avoid name collisions
- The DB row in `project_resources` holds the stored filename and original name

**Browser local storage:**

- View mode (list vs. Gantt)
- Sidebar collapsed/expanded state and width
- UI scale preference
- Some project templates
- Column visibility and order per project

### Data Model (summary)

```text
Workspace
  └── Space (one or more per workspace)
        └── List / Project (one or more per space, optionally in a Folder)
              ├── Task (unlimited nesting, children via parent_id)
              │     └── Task (subtask)
              ├── Task dependency (predecessor → successor, type: FS)
              └── Project Resource (link or uploaded file)
```

All primary keys are `UUID`. Dates are stored as `DATE` (YYYY-MM-DD), not timestamps with time zones.

### API ↔ Frontend Contract

All API calls from the frontend go through `frontend/src/api.ts`. That file:

- Prefixes every path with `VITE_API_URL` (empty string in dev, so Vite proxies it)
- Sends `credentials: 'include'` on every call so the session cookie is forwarded
- Uses a shared `request<T>()` helper that sets `Content-Type: application/json` and throws on non-OK responses
- File uploads bypass `request()` and use raw `fetch` directly (to avoid overriding the `Content-Type` that `multipart/form-data` needs to set itself)
- Normalizes all date fields to `YYYY-MM-DD` strings via `normalizeDateOnly()` before returning data to React state

## Repository Structure

```text
.
├── backend/
│   └── src/
│       ├── routes/          # workspaces, spaces, lists, tasks, shares, auth, resources
│       ├── middleware/      # requireAuth (session cookie check)
│       ├── lib/             # shared helpers
│       ├── schema.sql       # base DB schema (run once for a fresh install)
│       ├── seed.sql         # sample seed data
│       ├── ensureSchema.ts  # idempotent migration patches (run on every start)
│       ├── db.ts            # PostgreSQL pool
│       └── index.ts         # Express app entry — mounts routes, calls ensureSchema
├── data/
│   └── uploads/             # uploaded project resource files (gitignored)
├── frontend/
│   └── src/
│       ├── components/      # ListView, GanttView, Sidebar, modals, panels
│       ├── lib/             # settings, templates, reminders, helpers
│       ├── api.ts           # typed API client layer
│       ├── types.ts         # shared TypeScript interfaces
│       └── App.tsx          # app shell — auth gate, view routing, header
├── snapshots/               # rollback archives
├── scripts/
│   ├── dev.mjs              # root one-command dev launcher
│   ├── db-start.sh          # start Docker Postgres
│   ├── db-stop.sh           # stop Docker Postgres
│   └── install-myproplanner-mac.sh   # interactive Mac onboarding script
└── docker-compose.yml       # local PostgreSQL (named volume: pgdata)
```

## Running Locally

### Prerequisites

- Node.js 18+
- npm
- Docker Desktop, OrbStack, or Colima + Docker CLI
- GitHub access to `bdk-czone/Gantt-App` if you are cloning the private repo yourself

Important:
- all commands below assume you are inside the repo root
- if you cloned into `~/Projects/Gantt-App`, run `cd ~/Projects/Gantt-App` first

### Recommended Mac Installer

For teammate onboarding on macOS, use the interactive installer:

```bash
bash scripts/install-myproplanner-mac.sh
```

What it does:

- checks prerequisites first
- asks for approval before each install/setup step
- can install Homebrew, Git, Node.js, GitHub CLI, and Colima when approved
- handles private GitHub repo authentication
- works even when Docker Desktop is not installed
- creates `.env` files
- starts the database
- applies the schema
- optionally seeds demo data
- optionally runs the app

If you send the same script as a standalone file before cloning, it now defaults the clone target to the folder where the user launched the script, plus `/Gantt-App`.

### Manual Setup

### 1. Clone the repo and enter it

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/bdk-czone/Gantt-App.git
cd Gantt-App
```

### 2. Install dependencies

```bash
npm run install:all
```

### 3. Create local environment files

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

Defaults:

- Backend API: `http://localhost:3001`
- Frontend app: `http://localhost:5173`
- Database: `postgresql://postgres:postgres@localhost:5432/projectflux`
- Frontend API URL: empty in local dev, so Vite proxies `/api` to the backend

### 4. Start PostgreSQL

```bash
npm run db:start
```

### 5. Create the schema

```bash
npm run setup:db
```

### 6. Seed sample data (optional)

```bash
npm run seed:db
```

### 7. Run the app

```bash
npm run dev:full
```

Open:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend health check: [http://localhost:3001/api/health](http://localhost:3001/api/health)

### 8. First run

On the first app launch, MyProPlanner will ask you to create the local passkey for that instance.

### What `npm run dev:full` does

At the repo root:

```bash
npm run dev:full
```

expands to:

```bash
npm run db:start && npm run dev
```

That means:

- `npm run db:start` runs `bash scripts/db-start.sh` and starts the PostgreSQL Docker container
- `npm run dev` runs `node scripts/dev.mjs`
- `scripts/dev.mjs` starts both dev servers in parallel:
  - backend in `backend/`
  - frontend in `frontend/`

If your database is already running, `npm run dev` is enough.

## Deploying For Public Share Links

If you want a boss or customer on a different network to open a live workload link, the app must be deployed to a public server or domain.

Recommended production setup:

1. Build both apps:

```bash
npm run build
```

2. Configure the backend environment:

```bash
cp backend/.env.example backend/.env
```

Required:

- `DATABASE_URL` must point to a reachable PostgreSQL database

Optional:

- `PORT`
- `CORS_ORIGINS` if you host the frontend on a different domain from the backend

3. Start the backend:

```bash
npm run start:prod
```

How production hosting works now:

- the backend serves the built frontend from `frontend/dist`
- API requests use same-origin `/api` by default
- SPA routes such as `/share/<token>` are served by the backend too

That means once deployed, share links can look like:

- `https://your-domain.com/share/<token>`

and they can be opened from completely different networks.

If you deploy the frontend and backend on different domains:

- set `frontend/.env` with `VITE_API_URL=https://your-api-domain.com`
- set `backend/.env` with `CORS_ORIGINS=https://your-frontend-domain.com`

Important:

- share links are read-only
- they auto-refresh every 30 seconds
- this is not collaborative editing or true socket-based realtime yet

## Available Scripts

At the repo root:

- `npm run dev` - run backend and frontend together
- `npm run dev:full` - start Postgres, then run backend and frontend together
- `npm run dev:backend` - run backend only
- `npm run dev:frontend` - run frontend only
- `npm run build` - build backend and frontend for production
- `npm run start:prod` - start the backend server, which also serves the built frontend when available
- `npm run db:start` - start local PostgreSQL with Docker Compose or `docker-compose`
- `npm run db:stop` - stop local PostgreSQL
- `npm run setup:db` - apply schema to the configured database without requiring local `psql`
- `npm run seed:db` - seed the configured database without requiring local `psql`
- `npm run install:all` - install dependencies for root, backend, and frontend
- `bash scripts/install-myproplanner-mac.sh` - interactive Mac installer for teammate setup and first run

## How To Let Other People Use It With Their Own Data

Yes, but there is an important distinction:

### What Is Supported Today

Today, the safest way to let someone else use MyProPlanner with their own data is:

1. Add their GitHub account to the private GitHub repo.
2. Let them clone it onto their own Mac.
3. Have them run their own local frontend, backend, and PostgreSQL database.
4. Let them use their own browser profile so local-storage-based preferences/templates stay separate.

In other words, data isolation today is instance-level and database-level, not account-level.

Recommended workflow:

- keep the code in a private GitHub repo
- add specific GitHub users as collaborators or give their team access
- each colleague clones the repo locally
- each colleague runs their own local database
- you push updates, they pull updates

Use [INSTALL_FOR_COLLEAGUE.md](./INSTALL_FOR_COLLEAGUE.md) as the handoff/setup guide.

Important note about private repos:

- there is no special GitHub clone link that bypasses private-repo permissions
- the teammate must have real GitHub access to the repo
- the installer script can sign them in with GitHub CLI and verify access, but it cannot clone the repo unless GitHub has already approved that user

### What Is Not Built Yet

The app does not yet include:

- authentication
- user accounts
- invites
- permissions
- shared multi-user identity

So if multiple people use the same deployed instance against the same database, they are using the same shared planning data.

### Recommended Packaging / Wrapping Options

#### Option 1: Per-user or per-team local/self-hosted instance

Best for now.

- one frontend
- one backend
- one dedicated PostgreSQL database per person or team
- one cloned local copy of the repo per person or team

Each user or team gets isolated data without needing auth.

This is the recommended path for your current app.

#### Option 2: Single shared internal deployment

Possible, but everyone shares the same data unless you add auth and user scoping.

#### Option 3: Productized SaaS / multi-user app

This would require the next feature layer:

- users
- assignees
- invites
- permissions
- ownership/workload views
- comments/activity

That is not in the current version yet.

## API Overview

### Health

- `GET /api/health`

### Workspaces

- `GET /api/workspaces`
- `GET /api/workspaces/:id`
- `POST /api/workspaces`
- `PATCH /api/workspaces/:id`
- `DELETE /api/workspaces/:id`

### Spaces

- `GET /api/spaces`
- `GET /api/spaces/:id`
- `GET /api/spaces/:spaceId/lists`
- `POST /api/spaces`
- `PATCH /api/spaces/:id`
- `DELETE /api/spaces/:id`

### Lists / Projects

- `GET /api/lists/:id`
- `POST /api/lists`
- `PATCH /api/lists/:id`
- `DELETE /api/lists/:id`

### Tasks

- `GET /api/tasks/lists/:listId/tasks/tree`
- `GET /api/tasks/:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`

### Dependencies

- `POST /api/tasks/:id/dependencies`
- `DELETE /api/tasks/:id/dependencies/:depId`

### Auth

- `POST /api/auth/setup` — set the passkey on first run
- `POST /api/auth/login` — verify passkey, set session cookie
- `POST /api/auth/logout` — clear session
- `GET /api/auth/status` — check if a session is active

### Shares

- `POST /api/shares/workload`
- `GET /api/shares/public/:token`

### Project Resources

- `GET /api/lists/:listId/resources` — list all links and files for a project
- `POST /api/lists/:listId/resources` — add a bookmark link (JSON: `label`, `url`)
- `POST /api/lists/:listId/resources/upload` — upload a file (multipart: `file`, optional `label`)
- `GET /api/resources/:id/download` — download an uploaded file
- `DELETE /api/resources/:id` — delete a link or file

## Current Product Boundaries

This version is strong on planning and scheduling, but it is still missing a few platform pieces:

- no per-user accounts (passkey is shared by all users of the instance)
- no team/user model
- no permissions layer
- no server-side template sharing
- no comments/activity feed
- no real-time collaborative editing

## Recommended Next Steps

If you want to turn this into a shareable product for other users, the most valuable next steps are:

1. Add users, authentication, and permissions.
2. Move all template storage and per-user preferences that matter from browser local storage into the backend.
3. Add deployment manifests for production hosting.
4. Add tenant-aware data separation if multiple teams will share one deployment.

## License

Add your preferred license before publishing publicly on GitHub.
