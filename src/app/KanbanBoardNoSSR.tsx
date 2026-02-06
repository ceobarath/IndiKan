"use client";

import dynamic from "next/dynamic";

const KanbanBoard = dynamic(() => import("@/components/kanban-board"), {
  ssr: false,
  loading: () => (
    <section className="space-y-6">
      <div className="rounded-3xl border border-[color:var(--stroke)] bg-[color:var(--surface)] p-6 shadow-[var(--shadow)]">
        <div className="h-6 w-40 animate-pulse rounded-lg bg-[color:var(--surface-strong)]" />
        <div className="mt-3 h-4 w-64 animate-pulse rounded-lg bg-[color:var(--surface-strong)]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-h-[220px] animate-pulse rounded-3xl border border-dashed border-[color:var(--stroke)] bg-[color:var(--surface-strong)]" />
        <div className="min-h-[220px] animate-pulse rounded-3xl border border-dashed border-[color:var(--stroke)] bg-[color:var(--surface-strong)]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="min-h-[320px] animate-pulse rounded-3xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)]"
          />
        ))}
      </div>
    </section>
  ),
});

export default function KanbanBoardNoSSR() {
  return <KanbanBoard />;
}

