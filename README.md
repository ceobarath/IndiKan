# Indie Kanban

A lightweight kanban board for indie developers. Built with Next.js, Convex, and dnd-kit.

## Setup

1. Ensure Node 20 is active.

```bash
node -v
```

2. Start Convex (this generates `convex/_generated` and prints your URL).

```bash
PATH="$HOME/.bun/bin:$PATH" bunx convex dev
```

3. Create `.env.local` and paste the Convex URL.

```bash
NEXT_PUBLIC_CONVEX_URL=your-convex-url
```

4. Run the app.

```bash
PATH="$HOME/.bun/bin:$PATH" bun dev
```

Open `http://localhost:3000`.
