import KanbanBoard from "@/components/kanban-board";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-10 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <KanbanBoard />
      </div>
    </main>
  );
}
