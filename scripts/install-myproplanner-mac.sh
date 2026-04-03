#!/usr/bin/env bash

set -euo pipefail

APP_NAME="MyProPlanner"
DEFAULT_REPO_SLUG="${MYPROPLANNER_REPO_SLUG:-bdk-czone/Gantt-App}"
DEFAULT_BRANCH="${MYPROPLANNER_BRANCH:-main}"
DEFAULT_CLONE_DIR="${MYPROPLANNER_CLONE_DIR:-$HOME/Gantt-App}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

REPO_SLUG="$DEFAULT_REPO_SLUG"
BRANCH="$DEFAULT_BRANCH"
CLONE_DIR="$DEFAULT_CLONE_DIR"
REPO_ROOT=""

say() {
  printf '%s\n' "$*"
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

confirm() {
  local prompt="$1"
  local reply

  while true; do
    read -r -p "$prompt [y/N] " reply || true
    case "${reply:-}" in
      y|Y|yes|YES) return 0 ;;
      n|N|no|NO|'') return 1 ;;
      *) say "Please answer y or n." ;;
    esac
  done
}

load_homebrew_env() {
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

node_major_version() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

ensure_homebrew() {
  load_homebrew_env
  if command_exists brew; then
    return 0
  fi

  say "Homebrew is not installed. It is the easiest way to install Git, Node.js, GitHub CLI, and a Docker-compatible runtime."
  if ! confirm "Install Homebrew now?"; then
    die "Homebrew is required for the automated setup."
  fi

  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  load_homebrew_env
  command_exists brew || die "Homebrew installation finished, but brew is still not available in this shell."
}

install_brew_formula() {
  local formula="$1"
  local label="$2"

  ensure_homebrew
  if brew list --formula "$formula" >/dev/null 2>&1; then
    say "$label is already installed."
    return 0
  fi

  if ! confirm "Install $label with Homebrew?"; then
    die "$label is required for this setup."
  fi

  brew install "$formula"
}

install_brew_cask() {
  local cask="$1"
  local label="$2"

  ensure_homebrew
  if brew list --cask "$cask" >/dev/null 2>&1; then
    say "$label is already installed."
    return 0
  fi

  if ! confirm "Install $label with Homebrew Cask?"; then
    die "$label is required for this setup."
  fi

  brew install --cask "$cask"
}

ensure_git() {
  if command_exists git; then
    return 0
  fi
  install_brew_formula git "Git"
}

ensure_node() {
  local major
  major="$(node_major_version)"
  if [[ -n "$major" && "$major" -ge 18 ]]; then
    return 0
  fi

  if [[ -n "$major" ]]; then
    warn "Detected Node.js $major.x. $APP_NAME needs Node.js 18 or newer."
  else
    warn "Node.js is not installed."
  fi

  install_brew_formula node "Node.js"
}

ensure_github_cli() {
  if command_exists gh; then
    return 0
  fi
  install_brew_formula gh "GitHub CLI"
}

ensure_docker_runtime() {
  if command_exists docker && docker info >/dev/null 2>&1; then
    return 0
  fi

  if command_exists colima; then
    if confirm "Docker is not running. Start Colima now?"; then
      colima start
    fi
    if command_exists docker && docker info >/dev/null 2>&1; then
      return 0
    fi
  fi

  say "A Docker-compatible runtime is required for the local PostgreSQL service."
  say "Recommended option: Colima (free and lighter than Docker Desktop)."
  say "Other supported options: Docker Desktop or OrbStack."
  say
  say "Choose a runtime setup:"
  say "1. Install Colima + Docker CLI (recommended)"
  say "2. Install Docker Desktop"
  say "3. I will start my own Docker-compatible runtime manually"

  local choice
  read -r -p "Enter 1, 2, or 3: " choice

  case "$choice" in
    1)
      install_brew_formula docker "Docker CLI"
      install_brew_formula docker-compose "docker-compose"
      install_brew_formula colima "Colima"
      if confirm "Start Colima now?"; then
        colima start
      fi
      ;;
    2)
      install_brew_cask docker-desktop "Docker Desktop"
      say "Please launch Docker Desktop and wait until it finishes booting."
      read -r -p "Press Enter after Docker Desktop is running." _
      ;;
    3)
      say "Start OrbStack, Docker Desktop, or another Docker-compatible runtime, then return here."
      read -r -p "Press Enter when your runtime is running." _
      ;;
    *)
      die "Invalid choice."
      ;;
  esac

  if ! command_exists docker || ! docker info >/dev/null 2>&1; then
    die "Docker is still not available. Please start a Docker-compatible runtime and re-run the installer."
  fi
}

ensure_repo_access() {
  ensure_github_cli

  say "Because the repository is private, your GitHub account must already have access to $REPO_SLUG."
  say "If you were invited, accept the GitHub invitation first."

  if ! gh auth status -h github.com >/dev/null 2>&1; then
    if ! confirm "Sign in to GitHub now with GitHub CLI?"; then
      die "GitHub sign-in is required to clone a private repository."
    fi
    gh auth login -h github.com -p https -w
  fi

  if ! gh repo view "$REPO_SLUG" >/dev/null 2>&1; then
    die "This GitHub account does not have access to $REPO_SLUG yet. Ask the repo owner to add you as a collaborator or team member, then accept the invitation and re-run the installer."
  fi
}

is_repo_root() {
  [[ -f "$1/package.json" && -d "$1/backend" && -d "$1/frontend" ]]
}

choose_repo_root() {
  if is_repo_root "$PWD"; then
    REPO_ROOT="$PWD"
    say "Using the current folder as the $APP_NAME repo:"
    say "$REPO_ROOT"
    return 0
  fi

  ensure_repo_access

  read -r -p "Where should the repo be cloned? [$CLONE_DIR] " reply
  if [[ -n "${reply:-}" ]]; then
    CLONE_DIR="$reply"
  fi

  if [[ -d "$CLONE_DIR/.git" ]]; then
    REPO_ROOT="$CLONE_DIR"
    say "Using the existing clone at:"
    say "$REPO_ROOT"
    return 0
  fi

  if [[ -e "$CLONE_DIR" ]] && [[ -n "$(ls -A "$CLONE_DIR" 2>/dev/null || true)" ]]; then
    die "Target directory already exists and is not an empty Git clone: $CLONE_DIR"
  fi

  if ! confirm "Clone $REPO_SLUG into $CLONE_DIR now?"; then
    die "Repository clone was skipped."
  fi

  mkdir -p "$(dirname "$CLONE_DIR")"
  gh repo clone "$REPO_SLUG" "$CLONE_DIR" -- --branch "$BRANCH"
  REPO_ROOT="$CLONE_DIR"
}

ensure_env_file() {
  local source_path="$1"
  local target_path="$2"

  if [[ -f "$target_path" ]]; then
    say "Keeping existing $(basename "$target_path")."
    return 0
  fi

  cp "$source_path" "$target_path"
  say "Created $(basename "$target_path")."
}

main() {
  [[ "$(uname -s)" == "Darwin" ]] || die "This installer is designed for macOS."

  say "Interactive $APP_NAME installer"
  say "This script will ask for approval before each install or setup step."
  say

  ensure_homebrew
  ensure_git
  ensure_node
  ensure_docker_runtime
  choose_repo_root

  cd "$REPO_ROOT"

  if ! confirm "Install project npm dependencies in $REPO_ROOT now?"; then
    die "Project dependency installation was skipped."
  fi
  npm run install:all

  if ! confirm "Create local environment files if they do not already exist?"; then
    die "Environment file creation was skipped."
  fi
  ensure_env_file backend/.env.example backend/.env
  ensure_env_file frontend/.env.example frontend/.env

  if port_in_use 5432; then
    warn "Port 5432 is already in use. If another PostgreSQL instance is using it, the local database container may fail to start."
  fi
  if ! confirm "Start the local PostgreSQL service now?"; then
    die "Database startup was skipped."
  fi
  npm run db:start

  if ! confirm "Create or update the database schema now?"; then
    die "Database schema setup was skipped."
  fi
  npm run setup:db

  if confirm "Load the optional sample data now?"; then
    npm run seed:db
  fi

  if port_in_use 3001; then
    warn "Port 3001 is already in use. The backend may not start until that process is stopped."
  fi
  if port_in_use 5173; then
    warn "Port 5173 is already in use. Vite may choose another port unless you stop the existing process."
  fi

  if confirm "Start the app now? This will keep the terminal open while the app runs."; then
    npm run dev
  else
    say
    say "Setup finished."
    say "When you are ready to run the app:"
    say "  cd \"$REPO_ROOT\""
    say "  npm run dev"
  fi
}

main "$@"
