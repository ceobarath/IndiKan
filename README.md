# Indikan

A lightweight, no‑auth Kanban board for indie builders. Fast to set up, fun to use, and easy to self‑host.

## Highlights
- Public by default. No accounts or sign‑in.
- Drag‑and‑drop columns and cards.
- Built‑in timers, tags, priorities, and archive.
- Persistent storage with SQLite.

## Tech Stack
- Next.js 16 (App Router)
- SQLite (`node:sqlite`)
- dnd-kit (drag and drop)
- Framer Motion (animation)
- Tailwind CSS v4

## Quick Start

### 1. Install dependencies
Choose one:
```bash
bun install
```
```bash
npm install
```
```bash
pnpm install
```

### 2. Run the app
```bash
bun dev
```
Open `http://localhost:3000`.

SQLite database file is created automatically at `data/indikan.sqlite`.

## Scripts
- `bun dev` – start the Next.js dev server
- `bun build` – build for production
- `bun start` – start the production server
- `bun lint` – run ESLint
- `bun test:e2e` – run Playwright end-to-end test suite

## Deployment
1. Deploy Next.js to your host of choice (Vercel, Netlify, Render, etc.).
2. Ensure the deployment environment supports Node's SQLite module and persistent file storage for `data/indikan.sqlite`.

Please note this project used Codex & Cursor hehe

## Contributing
PRs are welcome. If you’re planning a bigger change, open an issue first so we can align on direction.

## License
MIT
