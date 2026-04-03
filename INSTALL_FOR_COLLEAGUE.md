# Install MyProPlanner On Another Mac

This guide is for teammates who will run their own local copy of MyProPlanner with their own private data.

Important:
- This app does not have user accounts or permissions yet.
- To keep data separate, each person should run their own local app instance and their own PostgreSQL database.
- Sharing the GitHub repo is the right approach if you want everyone to stay updated over time.

## Recommended Setup Flow

### 1. Give Them GitHub Access First

Because the repo is private, they must be added to the GitHub repo before any script or clone command will work.

Recommended:

- add their GitHub account as a collaborator on `bdk-czone/Gantt-App`
- ask them to accept the GitHub invitation email or GitHub notification first

Important:

- there is no special private clone link that bypasses permissions
- the installer script can help them sign in and clone, but GitHub still has to approve their account for the repo

## Option A: Best Teammate Flow

If they already have the repo cloned:

```bash
cd Gantt-App
bash scripts/install-myproplanner-mac.sh
```

This script will:

- check basic requirements
- ask before each install/setup step
- install missing tools with Homebrew when approved
- support Colima or Docker Desktop
- create `.env` files
- start the database
- create the schema
- optionally seed demo data
- optionally start the app

## Option B: Full Bootstrap Including Clone

The same script can also clone the repo, but they need the script file itself first.

If you want one-file onboarding:

- send them `scripts/install-myproplanner-mac.sh` directly
- or paste the script into a local file on their Mac

Then they can run:

```bash
bash install-myproplanner-mac.sh
```

Because the repo is private, the script will:

- ask them to sign in with GitHub CLI
- verify that their GitHub account has access to `bdk-czone/Gantt-App`
- clone the repo only if access is confirmed

## What Your Colleague Needs

- macOS
- internet access
- a GitHub account with access to the private repo

The installer can set up the rest.

## Manual Fallback

If they prefer the old manual flow:

```bash
git clone https://github.com/bdk-czone/Gantt-App.git
cd Gantt-App
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run db:start
npm run setup:db
npm run seed:db
npm run dev:full
```

Open:

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend health check: [http://localhost:3001/api/health](http://localhost:3001/api/health)

## How Updates Work

When you push updates to GitHub, your colleague can update their local copy with:

```bash
git pull
npm run install:all
npm run dev:full
```

Usually they only need `npm run install:all` again if dependencies changed.

## Data Isolation

Each person should use:

- their own cloned repo folder
- their own local PostgreSQL database/container
- their own browser profile if they want local-storage preferences and templates separated too

That means your colleague will not affect your data, and you will not affect theirs.

## If Something Breaks

Try these in order:

```bash
npm run db:stop
npm run db:start
npm run setup:db
npm run dev
```

If the app starts but looks wrong after a pull, also try:

```bash
npm run install:all
```

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
