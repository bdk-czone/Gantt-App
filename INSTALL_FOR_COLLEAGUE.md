# Install MyProPlanner On Another Mac

This guide is for teammates who will run their own local copy of MyProPlanner with their own private data.

Important:
- This app does not have per-user accounts or permissions yet.
- To keep data separate, each person should run their own local app instance and their own PostgreSQL database.
- All terminal commands below must be run from the cloned repo root after `cd` into the `Gantt-App` folder.

## Before You Start

### 1. Give Them GitHub Access First

Because the repo is private, they must be added to the GitHub repo before any script or clone command will work.

Recommended:
- add their GitHub account as a collaborator on `bdk-czone/Gantt-App`
- ask them to accept the GitHub invitation email or GitHub notification first

Important:
- there is no private clone link that bypasses repo permissions
- the installer can help them sign in with GitHub CLI, but GitHub still has to approve their access first

### 2. Prerequisites

They need:
- macOS
- internet access
- a GitHub account with access to the repo
- Node.js 18+
- npm
- Docker Desktop, OrbStack, or Colima + Docker CLI

## Option A: Recommended Installer Flow

If they already cloned the repo, they should run the installer from inside that repo:

```bash
cd /path/to/Gantt-App
bash scripts/install-myproplanner-mac.sh
```

What this installer does:
- checks for Homebrew, Git, Node.js, GitHub CLI, and Docker support
- asks before each install or setup step
- creates `.env` files if missing
- starts PostgreSQL
- applies the database schema
- optionally seeds sample data
- can launch the app at the end

## Option B: One-File Bootstrap Including Clone

If you send them `scripts/install-myproplanner-mac.sh` as a standalone file, they can run it before cloning.

Recommended flow:

```bash
mkdir -p ~/Projects
cd ~/Projects
bash /path/to/install-myproplanner-mac.sh
```

Important:
- the installer now defaults the clone target to the folder they launched it from, plus `/Gantt-App`
- for example, if they run it from `~/Projects`, it will propose `~/Projects/Gantt-App`
- they can still type a different path when prompted
- after the clone finishes, all later commands should be run inside that exact repo folder

## Manual Install: Step By Step

Use this if they prefer to install everything manually.

### 1. Pick a parent folder and clone the repo

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/bdk-czone/Gantt-App.git
cd Gantt-App
```

From this point on, every command below is run from inside `~/Projects/Gantt-App`.

### 2. Install project dependencies

```bash
npm run install:all
```

This installs:
- root-level npm tools for the repo
- backend dependencies in `backend/`
- frontend dependencies in `frontend/`

### 3. Create local environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Default local values:
- backend database: `postgresql://postgres:postgres@localhost:5432/projectflux`
- backend server: `http://localhost:3001`
- frontend app: `http://localhost:5173`
- frontend API base URL: empty, which means Vite proxies `/api` to the backend in local dev

### 4. Start PostgreSQL

```bash
npm run db:start
```

This starts the local Postgres container through Docker Compose.

### 5. Create the schema

```bash
npm run setup:db
```

This applies the app schema to the configured database.

### 6. Optional: load sample/demo data

```bash
npm run seed:db
```

### 7. Start the app

```bash
npm run dev:full
```

Then open:
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend health check: [http://localhost:3001/api/health](http://localhost:3001/api/health)

### 8. First app launch

On the first run, the app will ask them to create a shared passkey for their own local instance.
That passkey is only for their own local copy unless they deliberately share that machine or database.

## What `npm run dev:full` Actually Does

At the repo root, `npm run dev:full` means:

```bash
npm run db:start && npm run dev
```

That breaks down like this:
- `npm run db:start` runs `bash scripts/db-start.sh` and starts the local PostgreSQL container
- `npm run dev` runs `node scripts/dev.mjs`
- `scripts/dev.mjs` starts two processes in parallel:
  - the backend dev server inside `backend/`
  - the frontend Vite dev server inside `frontend/`

So `npm run dev:full` is the safest one-command startup for day-to-day use.

If the database is already running, they can also use:

```bash
npm run dev
```

That starts only the backend and frontend app servers.

## How Updates Work

When you push updates to GitHub, your colleague can update their local copy with:

```bash
cd /path/to/Gantt-App
git pull
npm run install:all
npm run dev:full
```

Usually they only need `npm run install:all` again if dependencies changed.

## If Something Breaks

Try these in order from the repo root:

```bash
npm run db:stop
npm run db:start
npm run setup:db
npm run dev:full
```

If the app starts but looks wrong after a pull, also run:

```bash
npm run install:all
```

## Data Isolation

Each person should use:
- their own cloned repo folder
- their own local PostgreSQL database/container
- their own browser profile if they want local-storage preferences and templates separated too

That means your colleague will not affect your data, and you will not affect theirs.

## What Is Not Supported Yet

This app does not yet support:
- user logins
- invites
- multi-user permissions
- one shared deployment with private per-user data

So for now, the safe model is:
- one person or team
- one app instance
- one database
