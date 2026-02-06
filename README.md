# Indikan

A lightweight, no‑auth Kanban board for indie builders. Fast to set up, fun to use, and easy to self‑host.

## Highlights
- Public by default. No accounts or sign‑in.
- Drag‑and‑drop columns and cards.
- Built‑in timers, tags, priorities, and archive.
- Real‑time sync with Convex.

## Tech Stack
- Next.js 16 (App Router)
- Convex (database + realtime)
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

### 2. Start Convex (backend)
```bash
bunx convex dev
```
This will print a deployment URL like `https://your-team.convex.cloud`. Keep it running.

### 3. Add environment variables
Create a `.env.local` file:
```bash
NEXT_PUBLIC_CONVEX_URL=your-convex-url
```

### 4. Run the app
```bash
bun dev
```
Open `http://localhost:3000`.

## Scripts
- `bun dev` – start the Next.js dev server
- `bun build` – build for production
- `bun start` – start the production server
- `bun lint` – run ESLint

## Convex Notes
- This project is intentionally public/no‑auth.
- To regenerate Convex types and apply schema changes:
```bash
bunx convex dev
```

## Deployment
1. Create a Convex deployment and set `NEXT_PUBLIC_CONVEX_URL`.
2. Deploy Next.js to your host of choice (Vercel, Netlify, Render, etc.).
3. Add the environment variable in your hosting provider.

## Contributing
PRs are welcome. If you’re planning a bigger change, open an issue first so we can align on direction.

## License
MIT
