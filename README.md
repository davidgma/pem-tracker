# PEM Tracker

Client-side pacing and daily energy expenditure tracking for chronic illness recovery (ME/CFS, Long COVID, dysautonomia) with in-browser SQLite3 WASM storage, pCloud drive cloud synchronization via OAuth 2.0 Implicit Grant, and an extensible dynamic plug-in architecture.

---

## Prerequisites (Linux)

- **Node.js**: v18+ or v20+ recommended (check with `node -v`)
- **npm**: v9+ (check with `npm -v`)
- **git**: v2.30+ (check with `git --version`)

If Node.js is not yet installed on your Linux distribution:
```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Fedora / RHEL
sudo dnf install -y nodejs npm git

# Arch Linux
sudo pacman -S nodejs npm git
```

---

## Quick Start on Local Linux

```bash
# 1. Install dependencies (auto-copies sql-wasm.wasm to public/)
npm install

# 2. Start local development server
npm run dev
```

Open your browser to:
```
http://localhost:3000
```

---

## Linking to GitHub from Local Linux

### 1. Initialize Git Repository (if not already initialized)

```bash
cd pem-tracker
git init
git add .
git commit -m "feat: initial commit of PEM Tracker with SQLite3, pCloud sync, and plugin system"
```

### 2. Create a New Repository on GitHub

1. Go to [GitHub](https://github.com/new).
2. Set the repository name to `pem-tracker`.
3. Choose **Private** (recommended for personal health data apps) or **Public**.
4. Leave "Initialize this repository with a README" **unchecked** (since you already have local files).
5. Click **Create repository**.

### 3. Add Remote and Push to GitHub

```bash
# Rename default branch to main
git branch -M main

# Add your GitHub remote (replace YOUR_GITHUB_USERNAME with your GitHub account)
# Using SSH:
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/pem-tracker.git

# Or using HTTPS:
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/pem-tracker.git

# Push code to GitHub
git push -u origin main
```

### 4. Daily Sync Workflow

When you make changes locally:
```bash
# Check modified files
git status

# Stage and commit
git add .
git commit -m "update: describe your changes"

# Push to GitHub
git push
```

To pull updates from GitHub:
```bash
git pull origin main
```

---

## Architecture & File Structure

```
├── public/
│   └── sql-wasm.wasm        # SQLite3 WebAssembly binary
├── src/
│   ├── plugins/             # Dynamically discovered plugins
│   │   ├── hello-world/     # Plugin 1: Welcome & architecture inspector
│   │   ├── sql-console/     # Plugin 2: Interactive SQL Query Console
│   │   ├── pacing-tracker/  # Core Pacing & Energy Expenditure Tracker
│   │   ├── pcloud-sync/     # pCloud OAuth Implicit Grant & Cloud Sync
│   │   ├── plugin.types.ts  # Typed Plugin contracts & context interfaces
│   │   └── registry.ts      # Dynamic auto-loader for plugins
│   ├── services/
│   │   ├── database.service.ts # Abstracted thread-safe SQLite3 storage layer
│   │   ├── mutex.ts         # AsyncMutex for concurrency protection
│   │   └── pcloud.service.ts # pCloud OAuth 2.0 Implicit Grant client
│   ├── types/
│   │   └── database.types.ts# Schemas for t_pems and t_activities
│   ├── App.tsx              # Top Bar Contract, dynamic navigation & dashboard
│   ├── index.css            # Tailwind CSS styling
│   └── main.tsx             # SPA entry point
├── package.json
└── vite.config.ts
```

---

## Production Build

```bash
npm run build
npm run preview
```
The compiled static assets will be in `dist/`, ready to deploy to any static host (Cloudflare Pages, Vercel, Netlify, Nginx, or GitHub Pages).
